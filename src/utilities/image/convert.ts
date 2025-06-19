import { execa } from 'execa'
import fse from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import { getSizeBytes, getSlugFilename } from '../file'
import { getColorProfile, getPathToColorProfile } from './color'
import { getImageDimensions } from './image'
import { lookupImageMimeType } from './mime'

/**
 * Optimize a PNG image
 */
export async function optimizePng(
	imagePath: string,
	destinationDirectory: string,
): Promise<string> {
	lookupImageMimeType(imagePath, ['png'])

	const destinationImagePath = path.join(destinationDirectory, path.basename(imagePath))
	await execa('oxipng', [
		'--scale16',
		'--alpha',
		'--preserve',
		'--out',
		destinationImagePath,
		imagePath,
	])

	return destinationImagePath
}

/**
 * Resize a PNG image to fit within a maximum width and height
 * Copies the image unchanged if it already fits within the target size
 * @returns The destination image path
 */
export async function resizePngToFit(
	imagePath: string,
	destinationDirectory: string,
	maxWidth: number,
	maxHeight: number,
): Promise<string> {
	lookupImageMimeType(imagePath, ['png'])

	if (maxWidth <= 0 || maxHeight <= 0) {
		throw new Error(`Invalid target size: ${maxWidth} x ${maxHeight}`)
	}

	const { width, height } = await getImageDimensions(imagePath)

	const destinationImagePath = path.join(destinationDirectory, path.basename(imagePath))

	// eslint-disable-next-line unicorn/prefer-ternary
	if (height <= maxHeight && width <= maxWidth) {
		// No resize needed
		await fse.copy(imagePath, destinationImagePath)
	} else {
		// Imagemagick
		// Consider -unsharp 0x1
		await execa('convert', [
			imagePath,
			'-resize',
			`${maxWidth}x${maxHeight}`,
			'-filter',
			'Lanczos',
			destinationImagePath,
		])
	}

	return destinationImagePath
}

/**
 * Resize a PNG image to fit within a maximum width and height
 */
export async function convertToJpeg(
	sourceImagePath: string,
	destinationDirectory: string,
	quality: 'lossless' | number,
	force = false,
	engine: 'guetzli' | 'mozjpeg' | 'sips' = 'mozjpeg',
): Promise<string> {
	const mime = lookupImageMimeType(sourceImagePath, ['bmp', 'jpeg', 'png', 'tiff', 'webp'])

	const destinationImagePath = path.join(
		destinationDirectory,
		path.basename(sourceImagePath, path.extname(sourceImagePath)) + '.jpeg',
	)

	if (!force && mime === 'jpeg') {
		await fse.copy(sourceImagePath, destinationImagePath)
	} else {
		// Convert 0-1 quality to 0-100 range for JPEG tools
		const jpegQuality = quality === 'lossless' ? 'lossless' : Math.round(quality * 100)

		switch (engine) {
			case 'guetzli': {
				if (jpegQuality === 'lossless') {
					throw new Error('Lossless JPEG conversion not supported with guetzli')
				}

				await execa('guetzli', [
					'--quality',
					jpegQuality.toString(),
					sourceImagePath,
					destinationImagePath,
				])

				break
			}

			case 'mozjpeg': {
				// Special case, only takes bmp...
				const tgaTempDirectory = await fse.mkdtemp(
					path.join(
						os.tmpdir(),
						`com.ericmika.apple-photos-export..${getSlugFilename(sourceImagePath)}.${engine}.`,
					),
				)
				const tgaImagePath = await convertToTga(sourceImagePath, tgaTempDirectory)

				await (jpegQuality === 'lossless'
					? execa('cjpeg', [
							'--lossless',
							'-optimize',
							'-progressive',
							'-outfile',
							destinationImagePath,
							tgaImagePath,
						])
					: execa('cjpeg', [
							'-quality',
							jpegQuality.toString(),
							'-optimize',
							'-progressive',
							'-outfile',
							destinationImagePath,
							tgaImagePath,
						]))

				await fse.rm(tgaTempDirectory, { recursive: true })
				break
			}

			case 'sips': {
				if (jpegQuality === 'lossless') {
					throw new Error('Lossless JPEG conversion not supported with sips')
				}

				// TODO clean up temp (sips does not respect TMPDIR)
				await execa('sips', [
					'-s',
					'format',
					'jpeg',
					'-s',
					'formatOptions',
					jpegQuality.toString(),
					sourceImagePath,
					'--out',
					destinationImagePath,
				])

				break
			}
		}
	}

	return destinationImagePath
}

/**
 * Convert an image to a WebP
 */
export async function convertToWebp(
	sourceImagePath: string,
	destinationDirectory: string,
	quality: 'lossless' | 'near-lossless' | number,
	force = false,
): Promise<string> {
	const mime = lookupImageMimeType(sourceImagePath, true)

	const destinationImagePath = path.join(
		destinationDirectory,
		path.basename(sourceImagePath, path.extname(sourceImagePath)) + '.webp',
	)

	if (!force && mime === 'webp') {
		await fse.copy(sourceImagePath, destinationImagePath)
	} else {
		// Convert 0-1 quality to 0-100 range for WebP
		const webpQuality = typeof quality === 'number' ? Math.round(quality * 100) : quality

		const qualityArgs =
			quality === 'lossless'
				? ['-lossless']
				: quality === 'near-lossless'
					? ['-near_lossless', '100']
					: [
							'-q',
							String(webpQuality), // Quality factor (0:small..100:big), default=75
						]

		await execa('cwebp', [
			...qualityArgs,
			'-mt',
			'-metadata',
			'all',
			sourceImagePath,
			'-o',
			destinationImagePath,
		])
	}

	return destinationImagePath
}

/**
 * Convert an image to a TIFF
 */
export async function convertToTiff(
	sourceImagePath: string,
	destinationDirectory: string,
	force = false,
): Promise<string> {
	const mime = lookupImageMimeType(sourceImagePath, true)

	const destinationImagePath = path.join(
		destinationDirectory,
		path.basename(sourceImagePath, path.extname(sourceImagePath)) + '.tiff',
	)

	// TODO clean up temp (sips does not respect TMPDIR)
	await (!force && mime === 'tiff'
		? fse.copy(sourceImagePath, destinationImagePath)
		: execa('sips', [
				'--setProperty',
				'format',
				'tiff',
				sourceImagePath,
				'--out',
				destinationImagePath,
			]))

	return destinationImagePath
}

/**
 * Convert an image to a PNG
 * Supports width / height to help quality comparison tools match target sizes in one step
 */
export async function convertToPng(
	sourceImagePath: string,
	destinationDirectory: string,
	force = false,
	width?: number,
	height?: number,
): Promise<string> {
	const mime = lookupImageMimeType(sourceImagePath, true)

	const destinationImagePath = path.join(
		destinationDirectory,
		path.basename(sourceImagePath, path.extname(sourceImagePath)) + '.png',
	)

	const needsResize = width !== undefined && height !== undefined

	if (!force && mime === 'png' && !needsResize) {
		await fse.copyFile(sourceImagePath, destinationImagePath)
	} else {
		const resizeArgs = needsResize
			? ['--resampleHeightWidth', height.toString(), width.toString()]
			: []

		// TODO webp issues?
		// TODO clean up temp (sips does not respect TMPDIR)
		await execa('sips', [
			...resizeArgs,
			'--setProperty',
			'format',
			'png',
			sourceImagePath,
			'--out',
			destinationImagePath,
		])
	}

	return destinationImagePath
}

/**
 * Convert an image to a TGA
 * Only viable input to mozjpeg is TGA, BMP, and some other esoteric stuff...
 * BMP emitted by sips is too modern for cjpeg, so we need to convert to TGA instead
 */
export async function convertToTga(
	sourceImagePath: string,
	destinationDirectory: string,
	force = false,
): Promise<string> {
	// TODO Webp not supported by sips...
	const mime = lookupImageMimeType(sourceImagePath, [
		'tga',
		'png',
		'tiff',
		'psd',
		'jpeg',
		'heic',
		'avif',
	])

	const destinationImagePath = path.join(
		destinationDirectory,
		path.basename(sourceImagePath, path.extname(sourceImagePath)) + '.bmp',
	)

	// TODO clean up temp (sips does not respect TMPDIR)
	await (!force && mime === 'tga'
		? fse.copyFile(sourceImagePath, destinationImagePath)
		: execa('sips', [
				'--setProperty',
				'format',
				'tga',
				sourceImagePath,
				'--out',
				destinationImagePath,
			]))

	return destinationImagePath
}

/**
 * Convert an image to an AVIF
 */
export async function convertToAvif(
	sourceImagePath: string,
	destinationDirectory: string,
	quality: 'lossless' | number | { alpha: number; color: number },
	force = false,
): Promise<string> {
	const mime = lookupImageMimeType(sourceImagePath, true)

	const destinationImagePath = path.join(
		destinationDirectory,
		path.basename(sourceImagePath, path.extname(sourceImagePath)) + '.avif',
	)

	if (!force && mime === 'avif') {
		await fse.copy(sourceImagePath, destinationImagePath)
	} else {
		const qualityArgs =
			quality === 'lossless'
				? ['--lossless']
				: typeof quality === 'number'
					? ['-q', Math.round(quality * 63).toString()] // Convert 0-1 quality to 0-63 range for AVIF
					: ['-qcolor', quality.color.toString(), '--qalpha', quality.alpha.toString()]

		// Extra profile shenanigans since we can't change it after the fact
		const profile = await getColorProfile(sourceImagePath)

		// Consider exposing --target-size
		await execa('avifenc', [
			...qualityArgs,
			'--icc',
			profile === 'None'
				? getPathToColorProfile('sRGB IEC61966-2.1')
				: getPathToColorProfile(profile),
			'--speed',
			'default',
			sourceImagePath,
			destinationImagePath,
		])
	}

	return destinationImagePath
}

export type LosslessFormat = 'avif' | 'none' | 'png' | 'webp'
export type NearLosslessFormat = 'none' | 'webp'
export type LossyFormat = 'avif' | 'jpeg' | 'none' | 'webp'

/**
 * Configuration options for image compression.
 *
 * The compression process follows a three-tier approach:
 * 1. First attempts lossless compression if enabled
 * 2. Falls back to near-lossless compression if lossless exceeds size limit
 * 3. Finally uses lossy compression if other methods fail to meet size requirements
 *
 * Set format to 'none' to disable that compression tier.
 */
export type CompressImageOptions = {
	/**
	 * Force compression even if the original image is already within the size limit.
	 * When false, images smaller than maxFileSizeBytes are copied without modification.
	 */
	forceCompression: boolean

	/**
	 * Format to use for lossless compression (first attempt).
	 * - 'avif': Best compression but slower encoding
	 * - 'png': Good compatibility, optimized with oxipng
	 * - 'webp': Good balance of compression and speed
	 * - 'none': Skip lossless compression
	 */
	losslessFormat: LosslessFormat

	/**
	 * Format to use for lossy compression (final fallback).
	 * - 'avif': Best compression but very slow encoding
	 * - 'jpeg': Good compatibility, uses mozjpeg encoder
	 * - 'webp': Good balance of compression and speed
	 * - 'none': Skip lossy compression (may result in oversized files)
	 */
	lossyFormat: LossyFormat

	/**
	 * Quality level for lossy compression (0-1 scale).
	 * - 0: Lowest quality, smallest file size
	 * - 1: Highest quality, largest file size
	 * - Recommended range: 0.85-0.96 for high-quality images
	 */
	lossyQuality: number

	/**
	 * Maximum allowed file size in bytes.
	 * Images exceeding this size will be compressed using the configured formats.
	 * The compression process stops when this target is met or all options are exhausted.
	 */
	maxFileSizeBytes: number

	/**
	 * Format to use for near-lossless compression (second attempt).
	 * - 'webp': Only format currently supporting near-lossless mode
	 * - 'none': Skip near-lossless compression
	 */
	nearLosslessFormat: NearLosslessFormat
}

/**
 * Compress an image to a target size
 */
// eslint-disable-next-line complexity
export async function compressImage(
	sourceImagePath: string,
	destinationDirectory: string,
	options: CompressImageOptions,
): Promise<{
	compression: 'lossless' | 'lossy' | 'near-lossless' | 'none'
	path: string
}> {
	const {
		forceCompression,
		losslessFormat,
		lossyFormat,
		lossyQuality,
		maxFileSizeBytes,
		nearLosslessFormat,
	} = options

	if (losslessFormat === 'none' && nearLosslessFormat === 'none' && lossyFormat === 'none') {
		throw new Error('At least one compression format must be enabled')
	}

	// Check for no compression needed
	// lookupImageMimeType(sourceImagePath, true)

	const initialSize = await getSizeBytes(sourceImagePath)

	if (!forceCompression && initialSize <= maxFileSizeBytes) {
		const destinationImagePath = path.join(destinationDirectory, path.basename(sourceImagePath))
		await fse.copyFile(sourceImagePath, destinationImagePath)
		return {
			compression: 'none',
			path: destinationImagePath,
		}
	}

	// Compress
	let workingImagePath: string
	const tempDirectory = await fse.mkdtemp(
		path.join(
			os.tmpdir(),
			`com.ericmika.apple-photos-export..${getSlugFilename(sourceImagePath)}.compress.`,
		),
	)

	// First try lossless
	switch (losslessFormat) {
		case 'avif': {
			workingImagePath = await convertToAvif(sourceImagePath, tempDirectory, 'lossless')
			break
		}

		case 'none': {
			workingImagePath = sourceImagePath
			break
		}

		case 'png': {
			workingImagePath =
				lookupImageMimeType(sourceImagePath) === 'png'
					? sourceImagePath
					: await convertToPng(sourceImagePath, tempDirectory)

			workingImagePath = await optimizePng(workingImagePath, tempDirectory)
			break
		}

		case 'webp': {
			workingImagePath = await convertToWebp(sourceImagePath, tempDirectory, 'lossless')
			break
		}
	}

	const losslessSize = await getSizeBytes(workingImagePath)
	if (losslessSize <= maxFileSizeBytes) {
		const destinationImagePath = path.join(destinationDirectory, path.basename(workingImagePath))
		await fse.copyFile(workingImagePath, destinationImagePath)
		await fse.rm(tempDirectory, { force: true, recursive: true })
		return {
			compression: 'lossless',
			path: destinationImagePath,
		}
	}

	// Clean up failed lossless file
	if (workingImagePath !== sourceImagePath) {
		await fse.rm(workingImagePath)
	}

	// Try near-lossless compression
	switch (nearLosslessFormat) {
		case 'none': {
			workingImagePath = sourceImagePath
			break
		}

		case 'webp': {
			workingImagePath = await convertToWebp(sourceImagePath, tempDirectory, 'near-lossless')
			break
		}
	}

	const nearLosslessSize = await getSizeBytes(workingImagePath)
	if (nearLosslessSize <= maxFileSizeBytes) {
		const destinationImagePath = path.join(destinationDirectory, path.basename(workingImagePath))
		await fse.copyFile(workingImagePath, destinationImagePath)
		await fse.rm(tempDirectory, { force: true, recursive: true })
		return {
			compression: 'near-lossless',
			path: destinationImagePath,
		}
	}

	// Clean up failed near-lossless file
	if (workingImagePath !== sourceImagePath) {
		await fse.rm(workingImagePath)
	}

	// Use lossy compression
	switch (lossyFormat) {
		case 'avif': {
			// Very slow
			workingImagePath = await convertToAvif(sourceImagePath, tempDirectory, lossyQuality, true)
			break
		}

		case 'jpeg': {
			workingImagePath = await convertToJpeg(
				sourceImagePath,
				tempDirectory,
				lossyQuality,
				true,
				'mozjpeg',
			)
			break
		}

		case 'none': {
			workingImagePath = sourceImagePath
			break
		}

		case 'webp': {
			workingImagePath = await convertToWebp(sourceImagePath, tempDirectory, lossyQuality, true)
			break
		}
	}

	const destinationImagePath = path.join(destinationDirectory, path.basename(workingImagePath))
	await fse.copyFile(workingImagePath, destinationImagePath)
	await fse.rm(tempDirectory, { force: true, recursive: true })
	return {
		compression: lossyFormat === 'none' ? 'none' : 'lossy',
		path: destinationImagePath,
	}
}
