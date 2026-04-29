import { execa } from 'execa'
import fse from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import { getSlugFilename } from '../file'
import { log } from '../log'
import { convertToPng } from './convert'
import { getImageDimensions, getImageInfo } from './image'
import { lookupImageMimeType } from './mime'

const SSIM_REGEX = /All:\s*([\d.]+)/
const PSNR_REGEX = /average:\s*([\d.]+)/

/**
 * Get two identically sized PNGs from two images. Uses the smaller image size
 * as the target size. Remember to clean up temp
 */
export async function getTwoIdenticallySizedPng(
	image1: string,
	image2: string,
): Promise<{
	image1Png: string
	image2Png: string
}> {
	const tempDirectory1 = await fse.mkdtemp(
		path.join(
			os.tmpdir(),
			`com.kitschpatrol.aphex.get-two-identically-sized-png.${getSlugFilename(image1)}.`,
		),
	)
	const tempDirectory2 = await fse.mkdtemp(
		path.join(
			os.tmpdir(),
			`com.kitschpatrol.aphex.get-two-identically-sized-png.${getSlugFilename(image2)}.`,
		),
	)

	const { width: w1, height: h1 } = await getImageDimensions(image1)
	const { width: w2, height: h2 } = await getImageDimensions(image2)

	const targetWidth = Math.min(w1, w2)
	const targetHeight = Math.min(h1, h2)

	const image1Png = await convertToPng(image1, tempDirectory1, false, targetWidth, targetHeight)
	const image2Png = await convertToPng(image2, tempDirectory2, false, targetWidth, targetHeight)

	return {
		image1Png,
		image2Png,
	}
}

/**
 * Check if two images have the same pixel dimensions.
 */
export async function isIdenticalSize(image1: string, image2: string): Promise<boolean> {
	const { width: w1, height: h1 } = await getImageDimensions(image1)
	const { width: w2, height: h2 } = await getImageDimensions(image2)

	return h1 === h2 && w1 === w2
}

/**
 * Quantify the similarity between two images.
 *
 * Bundles image conversion for performance across several measurements
 */
export async function calculateSimilarity(
	image1: string,
	image2: string,
): Promise<{
	dssim: number
	psnr: number
	ssim: number
}> {
	const { image1Png, image2Png } = await getTwoIdenticallySizedPng(image1, image2)
	try {
		const [dssim, ssim, psnr] = await Promise.all([
			calculateDSSIMInternal(image1Png, image2Png),
			calculateSSIMInternal(image1Png, image2Png),
			calculatePSNRInternal(image1Png, image2Png),
		])
		return {
			dssim,
			psnr,
			ssim,
		}
	} finally {
		await fse.rm(path.dirname(image1Png), { force: true, recursive: true })
		await fse.rm(path.dirname(image2Png), { force: true, recursive: true })
	}
}

/**
 * Calculates the DSSIM index between two images using the dssim command-line
 * tool.
 *
 * @param image1 The path to the first image file.
 * @param image2 The path to the second image file.
 *
 * @returns A promise that resolves to the DSSIM value as a number.
 */
export async function calculateDSSIM(image1: string, image2: string): Promise<number> {
	const { image1Png, image2Png } = await getTwoIdenticallySizedPng(image1, image2)
	try {
		return await calculateDSSIMInternal(image1Png, image2Png)
	} finally {
		await fse.rm(path.dirname(image1Png), { force: true, recursive: true })
		await fse.rm(path.dirname(image2Png), { force: true, recursive: true })
	}
}

async function calculateDSSIMInternal(image1: string, image2: string): Promise<number> {
	lookupImageMimeType(image1, ['png'])
	lookupImageMimeType(image2, ['png'])

	// Sometimes resizing fails?
	if (!(await isIdenticalSize(image1, image2))) {
		log.error(`Images are not the same size:\n${image1}\n${image2}`)
		return -1
	}

	const { stdout } = await execa('dssim', [image1, image2])

	// Dssim output is typically in the form "0.00234\timage1\timage2"
	// where the first tab-separated value is the DSSIM index.
	const [dssimIndex] = stdout.split('\t')
	// eslint-disable-next-line ts/no-unnecessary-condition
	if (dssimIndex === undefined) {
		throw new Error('DSSIM index not found in dssim output.')
	}

	return Number.parseFloat(dssimIndex)
}

/**
 * Calculates the SSIM between two images using ffmpeg.
 *
 * @param image1 The path to the first image.
 * @param image2 The path to the second image.
 *
 * @returns A promise that resolves to the SSIM value as a number.
 */
export async function calculateSSIM(image1: string, image2: string): Promise<number> {
	const { image1Png, image2Png } = await getTwoIdenticallySizedPng(image1, image2)
	try {
		return await calculateSSIMInternal(image1Png, image2Png)
	} finally {
		await fse.rm(path.dirname(image1Png), { force: true, recursive: true })
		await fse.rm(path.dirname(image2Png), { force: true, recursive: true })
	}
}

async function calculateSSIMInternal(image1: string, image2: string): Promise<number> {
	lookupImageMimeType(image1, ['png'])
	lookupImageMimeType(image2, ['png'])

	// Sometimes resizing fails?
	if (!(await isIdenticalSize(image1, image2))) {
		log.error(`Images are not the same size:\n${image1}\n${image2}`)
		return -1
	}

	const result = await execa('ffmpeg', [
		'-i',
		image1,
		'-i',
		image2,
		'-filter_complex',
		'ssim',
		'-f',
		'null',
		'-',
	])
	// Extract SSIM value from stdout
	const match = SSIM_REGEX.exec(result.stderr)
	return match?.[1] ? Number.parseFloat(match[1]) : 0
}

/**
 * Calculates the PSNR between two images using ffmpeg.
 *
 * @param image1 The path to the first image.
 * @param image2 The path to the second image.
 *
 * @returns A promise that resolves to the PSNR value as a number.
 */
export async function calculatePSNR(image1: string, image2: string): Promise<number> {
	const { image1Png, image2Png } = await getTwoIdenticallySizedPng(image1, image2)
	try {
		return await calculatePSNRInternal(image1Png, image2Png)
	} finally {
		await fse.rm(path.dirname(image1Png), { force: true, recursive: true })
		await fse.rm(path.dirname(image2Png), { force: true, recursive: true })
	}
}

/**
 * Calculates the PSNR between two images using ffmpeg.
 */
export async function calculatePSNRInternal(image1: string, image2: string): Promise<number> {
	lookupImageMimeType(image1, ['png'])
	lookupImageMimeType(image2, ['png'])

	// Sometimes resizing fails?
	if (!(await isIdenticalSize(image1, image2))) {
		log.error(`Images are not the same size:\n${image1}\n${image2}`)
		return -1
	}

	const result = await execa('ffmpeg', [
		'-i',
		image1,
		'-i',
		image2,
		'-filter_complex',
		'psnr',
		'-f',
		'null',
		'-',
	])

	// Extract PSNR value from stdout
	const match = PSNR_REGEX.exec(result.stderr)
	return match?.[1] ? Number.parseFloat(match[1]) : 0
}

/**
 * Check if two images are exactly visually identical.
 */
export async function visuallyIdentical(image1: string, image2: string): Promise<boolean> {
	const { dssim, psnr, ssim } = await calculateSimilarity(image1, image2)

	const isVisuallyIdentical = dssim === 0 && psnr === 0 && ssim === 1

	if (!isVisuallyIdentical) {
		log
			.withMetadata({
				dssim,
				psnr,
				ssim,
			})
			.debug(`Images are not visually identical:\n${image1}\n${image2}:`)
	}

	return isVisuallyIdentical
}

/**
 * Check if two images have identical metadata.
 */
export async function metadataIdentical(image1: string, image2: string): Promise<boolean> {
	const image1Info = await getImageInfo(image1)
	const image2Info = await getImageInfo(image2)

	const isMetadataIdentical =
		image1Info.alpha === image2Info.alpha &&
		image1Info.tags.creator === image2Info.tags.creator &&
		image1Info.tags.credit === image2Info.tags.credit &&
		image1Info.tags.description === image2Info.tags.description &&
		image1Info.tags.preservedFileName === image2Info.tags.preservedFileName &&
		image1Info.colorProfile === image2Info.colorProfile &&
		image1Info.dimensionsPixels.height === image2Info.dimensionsPixels.height &&
		image1Info.dimensionsPixels.width === image2Info.dimensionsPixels.width &&
		image1Info.mime === image2Info.mime
	// Overkill
	// image1Info.path === image2Info.path
	// Can fluctuate
	// image1Info.sizeBytes === image2Info.sizeBytes

	if (!isMetadataIdentical) {
		log
			.withMetadata({ image1Info, image2Info })
			.debug(`Metadata is not identical:\n${image1}\n${image2}`)
	}

	return isMetadataIdentical
}

/**
 * Check if an identical image exists in a directory.
 */
export async function identicalImageExistsInDirectory(
	sourceImagePath: string,
	directory: string,
): Promise<boolean> {
	const existingFiles = await fse.readdir(directory)

	// Check if there is an existing file with the same name, but possibly different extension
	const existingFile = existingFiles.find(
		(file) => path.basename(file) === path.basename(sourceImagePath),
	)

	// Assume different if no existing file exists
	if (existingFile === undefined) {
		return false
	}

	const existingFilePath = path.join(directory, existingFile)
	const isMetadataIdentical = await metadataIdentical(sourceImagePath, existingFilePath)
	if (!isMetadataIdentical) {
		return false
	}

	const isVisuallyIdentical = await visuallyIdentical(sourceImagePath, existingFilePath)
	if (!isVisuallyIdentical) {
		return false
	}

	return true
}
