import fse from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import { Piscina } from 'piscina'
import type { PhotoInfo } from '../utilities/image/aphex-swift-bridge'
import type { ColorProfile } from '../utilities/image/color'
import type {
	CompressImageOptions,
	LosslessFormat,
	LossyFormat,
	NearLosslessFormat,
} from '../utilities/image/convert'
import type { ImageInfo } from '../utilities/image/image'
import type { ImageMimeType } from '../utilities/image/mime'
import type { ExportedPhoto, ExportEngine, ExportPhotoOptions } from './export-photo'
import { sipsTempCleanup } from '../utilities/general'
import {
	assignColorProfile,
	getColorProfile,
	needsColorConversion,
	normalizeColorProfile,
} from '../utilities/image/color'
import { calculateSimilarity, identicalImageExistsInDirectory } from '../utilities/image/compare'
import {
	compressImage,
	convertToPng,
	optimizePng,
	resizePngToFit,
} from '../utilities/image/convert'
import { getImageInfo } from '../utilities/image/image'
import { cloneTags, getTags, setTags, stripTags } from '../utilities/image/tags'

export type ProcessImageOptions = CompressImageOptions & {
	/** Fallback color profile applied when source profile is not in preserve list */
	defaultColorProfile: ColorProfile
	/** Calculate SSIM/PSNR/DSSIM metrics comparing original vs processed images */
	logSimilarity: boolean
	/** Lossless format used specifically for images with alpha channels */
	losslessFormatAlpha: LosslessFormat
	/** Lossy format used specifically for images with alpha channels */
	lossyFormatAlpha: LossyFormat
	/** Maximum pixel dimensions before triggering resize (width OR height) */
	maxDimensionsPixels: {
		height: number
		width: number
	}
	/** Near-lossless format used specifically for images with alpha channels */
	nearLosslessFormatAlpha: NearLosslessFormat
	/** Image formats that bypass conversion and compression entirely */
	passthroughFormats: ImageMimeType[]
	/** Color profiles that are kept unchanged instead of being normalized */
	preserveColorProfiles: ColorProfile[]
}

export type ProcessImageResult = {
	input: ImageInfo
	output: ImageInfo
	report: {
		color: Awaited<ReturnType<typeof normalizeColorProfile>>
		compression: Awaited<ReturnType<typeof compressImage>>['compression']
		date: Date
		durationMs: number
		similarity?: {
			dssim: number
			psnr: number
			ssim: number
		}
	}
}

export type ProcessMetadata = ProcessImageResult & {
	exportEngine: ExportEngine
	options: { export: ExportPhotoOptions; process: ProcessImageOptions }
	photoInfo: PhotoInfo
}

export const defaultProcessImageOptions: ProcessImageOptions = {
	defaultColorProfile: 'sRGB IEC61966-2.1',
	forceCompression: false,
	logSimilarity: false,
	losslessFormat: 'webp',
	losslessFormatAlpha: 'png', // Webp's lossless compression screws up alpha areas
	lossyFormat: 'jpeg', // Toss up with webp
	lossyFormatAlpha: 'webp', // Webp's lossy compression seems ok for alpha areas
	lossyQuality: 0.95, // See Compression Analysis.numbers (converted to 0-1 range)
	maxDimensionsPixels: {
		width: Number.MAX_SAFE_INTEGER,
		height: Number.MAX_SAFE_INTEGER,
	},
	maxFileSizeBytes: 25_000_000,
	nearLosslessFormat: 'none', // 'webp'... Meh
	nearLosslessFormatAlpha: 'none', // Webp's near lossless compression screws up alpha areas
	passthroughFormats: [],
	preserveColorProfiles: [
		// 'Adobe RGB (1998)',
		// 'Apple Wide Color Sharing Profile',
		// 'Display P3',
		// 'None',
		// 'ProPhoto RGB',
		'sRGB IEC61966-2.1',
		// 'Unsupported',
	],
}

/**
 * Process one or more exported photos
 */
export async function processPhotos(
	exportedPhotos: ExportedPhoto[],
	outputDirectory: string,
	options: ProcessImageOptions,
): Promise<ProcessImageResult[]> {
	await fse.ensureDir(outputDirectory)

	// Higher crashes the machine? Default 1.5x
	const threads = Math.floor(os.availableParallelism() * 0.5)
	console.log(`Using ${threads} threads for processing`)
	const piscina = new Piscina({
		filename: new URL('workers/process-image-worker.js', import.meta.url).href,
		maxThreads: threads,
		minThreads: threads,
	})

	// Process images in parallel
	const tempProcessOutputDirectory = await fse.mkdtemp(
		path.join(os.tmpdir(), `com.kitschpatrol.aphex.process`),
	)

	const processImageResults = await Promise.all<ProcessImageResult>(
		exportedPhotos.map(async ({ path }) =>
			// eslint-disable-next-line ts/no-unsafe-return
			piscina.run({
				destinationDirectory: tempProcessOutputDirectory,
				options,
				sourceImagePath: path,
			}),
		),
	)

	// Copy processed images to output if they're different
	let updatedImageCount = 0
	for (const result of processImageResults) {
		const exportedPhoto = exportedPhotos.find(({ path }) => path === result.input.path)
		if (exportedPhoto === undefined) {
			throw new Error(
				`Exported photo info not found for processed image with input "${result.input.path}"`,
			)
		}

		// Write tags, pulling from the original image
		const processingOutputPath = result.output.path
		const finalOutputPath = path.join(outputDirectory, path.basename(result.output.path))
		const { exportEngine, exportOptions, photoInfo } = exportedPhoto

		const tags = await getTags(photoInfo.original.filePath)
		result.output.path = finalOutputPath
		tags.processMetadata = {
			exportEngine,
			options: {
				export: exportOptions,
				process: options,
			},
			photoInfo,
			...result,
		}

		await setTags(processingOutputPath, tags)

		// See if the processed image is actually different from what we had before
		const identicalImageExists = await identicalImageExistsInDirectory(
			processingOutputPath,
			outputDirectory,
		)

		// Use original image if no material change
		if (identicalImageExists) {
			console.log(
				`Image wasn't changed by processing, keeping original: "${path.basename(result.output.path)}"`,
			)
			continue
		}

		// Move to output directory
		updatedImageCount += 1
		console.log(`Image updated: "${path.basename(result.output.path)}"`)

		// Delete original
		await fse.rm(result.input.path, { force: true })

		await fse.move(processingOutputPath, finalOutputPath, { overwrite: true })

		// TODO separate step?
		// Validate exif data
		// const isValid = await validateTags(
		// 	result.output.path,
		// 	['processMetadata', 'preservedFileName', 'label'], // All required ("and")
		// 	['credit', 'creator'], // One required ("or")
		// )
		// if (!isValid) {
		// 	throw new Error(`Invalid XMP data for "${result.output.path}"`)
		// }
	}

	// Clean up
	await fse.rm(tempProcessOutputDirectory, { force: true, recursive: true })

	console.log(
		`Processed ${processImageResults.length} images and actually updated ${updatedImageCount}`,
	)

	const sipsTempFileCount = await sipsTempCleanup()
	console.log(`Cleaned up ${sipsTempFileCount} probable SIPS temp files from "${os.tmpdir()}"`)

	return processImageResults
}

/**
 * Process an image
 *
 * Run in parallel through a worker for album processing
 */
// eslint-disable-next-line complexity
export async function processImage(
	sourceImagePath: string,
	destinationDirectory: string,
	options: ProcessImageOptions,
): Promise<ProcessImageResult> {
	const startTime = performance.now()
	const input = await getImageInfo(sourceImagePath)

	const tempDirectory = await fse.mkdtemp(
		path.join(os.tmpdir(), `com.kitschpatrol.aphex.process-image`),
	)

	// Result will be updated as we go
	const report: Partial<ProcessImageResult['report']> = {
		date: new Date(),
	}

	// Always do lossless png compression first if passthrough is possible, in case that gets us under the target
	// And strips out unnecessary alpha channels
	let workingImagePath = sourceImagePath
	if (options.passthroughFormats.includes('png') && input.mime === 'png') {
		workingImagePath = await optimizePng(workingImagePath, tempDirectory)
	}

	// Check for various violations
	const isOverweight = input.sizeBytes > options.maxFileSizeBytes
	const isOversize =
		input.dimensionsPixels.width > options.maxDimensionsPixels.width ||
		input.dimensionsPixels.height > options.maxDimensionsPixels.height
	const isInvalidColorProfile = await needsColorConversion(
		workingImagePath,
		options.preserveColorProfiles,
	)
	const isInvalidOutputFormat = !options.passthroughFormats.includes(input.mime)

	// Convert to png if needed, some types always need conversion,
	// If we're doing any pixel space manipulations, do it in a lossless PNG
	if (
		input.mime !== 'png' &&
		// eslint-disable-next-line ts/no-unnecessary-condition
		(isInvalidOutputFormat || isOverweight || isInvalidColorProfile || (isOversize && isOverweight))
	) {
		workingImagePath = await convertToPng(workingImagePath, tempDirectory)
		// TODO any benefit here?
		workingImagePath = await optimizePng(workingImagePath, tempDirectory)
	} else {
		// Copy over image to temp anyway
		workingImagePath = path.join(tempDirectory, path.basename(sourceImagePath))
		await fse.copyFile(sourceImagePath, workingImagePath)
	}

	// Always normalize color profile on the working image
	report.color = await normalizeColorProfile(
		workingImagePath,
		options.preserveColorProfiles,
		options.defaultColorProfile,
	)
	const normalizedColorProfile = await getColorProfile(workingImagePath)

	// TODO consider always compressing PNGs?
	// Always compress converted images since we've already taken the recompression quality hit
	if (
		isInvalidOutputFormat ||
		isOverweight ||
		isInvalidColorProfile ||
		// eslint-disable-next-line ts/no-unnecessary-condition
		(isOversize && isOverweight)
	) {
		// Resize if needed
		if (isOversize) {
			workingImagePath = await resizePngToFit(
				workingImagePath,
				tempDirectory,
				options.maxDimensionsPixels.width,
				options.maxDimensionsPixels.height,
			)
		}

		// Compress
		// Use different lossy formats with / without alpha if needed
		const compressionResult = await compressImage(workingImagePath, tempDirectory, {
			forceCompression: options.forceCompression,
			losslessFormat: input.alpha ? options.losslessFormatAlpha : options.losslessFormat,
			lossyFormat: input.alpha ? options.lossyFormatAlpha : options.lossyFormat,
			lossyQuality: options.lossyQuality,
			maxFileSizeBytes: options.maxFileSizeBytes,
			nearLosslessFormat: input.alpha
				? options.nearLosslessFormatAlpha
				: options.nearLosslessFormat,
		})

		workingImagePath = compressionResult.path
		report.compression = compressionResult.compression
	} else {
		report.compression = 'none'
	}

	// Order is touchy here
	await stripTags(workingImagePath)
	await assignColorProfile(workingImagePath, normalizedColorProfile)

	await cloneTags(sourceImagePath, workingImagePath, [
		'creator',
		'credit',
		'label',
		'preservedFileName',
	])

	// Who cares
	// await cloneFileCreationTime(sourceImagePath, destinationImagePath)

	// Copy the image to destination, sometimes this will be a straight copy
	const destinationImagePath = path.join(destinationDirectory, path.basename(workingImagePath))
	await fse.copyFile(workingImagePath, destinationImagePath)

	// Clean up
	await fse.rm(tempDirectory, { force: true, recursive: true })

	// Prep report
	const output = await getImageInfo(destinationImagePath)

	// Calculate similarity if needed
	if (
		options.logSimilarity &&
		(report.compression === 'lossy' || report.compression === 'near-lossless')
	) {
		const { dssim, psnr, ssim } = await calculateSimilarity(sourceImagePath, destinationImagePath)
		report.similarity = {
			dssim, // Lower is better
			psnr, // 1 is perfect
			ssim, // Higher is better
		}
	}

	report.durationMs = Math.round(performance.now() - startTime)

	// Type guard
	if (!isProcessImageResultReport(report)) {
		throw new Error('Invalid report')
	}

	return {
		input,
		output,
		report,
	}
}

function isProcessImageResultReport(
	object: Partial<ProcessImageResult['report']>,
): object is ProcessImageResult['report'] {
	// Check for the mandatory fields first
	const hasMandatoryFields =
		object.color !== undefined &&
		object.compression !== undefined &&
		object.date instanceof Date &&
		typeof object.durationMs === 'number'

	// If mandatory fields are missing, immediately return false
	if (!hasMandatoryFields) return false

	// If similarity is provided, check its fields
	if (object.similarity !== undefined) {
		return (
			typeof object.similarity.dssim === 'number' &&
			typeof object.similarity.psnr === 'number' &&
			typeof object.similarity.ssim === 'number'
		)
	}

	// If there is no similarity field, the rest is already validated
	return true
}
