import { execa } from 'execa'
import { imageSizeFromFile } from 'image-size/fromFile'
import type { ImageMimeType } from './mime'
import type { ImageTags } from './tags'
import { getSizeBytes } from '../file'
import { getColorProfile } from './color'
import { lookupImageMimeType } from './mime'
import { getTags } from './tags'

export type ImageInfo = {
	alpha: boolean
	colorProfile: string
	dimensionsPixels: { height: number; width: number }
	mime: ImageMimeType
	path: string
	sizeBytes: number
	tags: ImageTags
}

/**
 * Get all available information about an image
 */
export async function getImageInfo(imagePath: string): Promise<ImageInfo> {
	return {
		alpha: await hasAlpha(imagePath),
		colorProfile: await getColorProfile(imagePath),
		dimensionsPixels: await getImageDimensions(imagePath),
		mime: lookupImageMimeType(imagePath, true),
		path: imagePath,
		sizeBytes: await getSizeBytes(imagePath),
		tags: await getTags(imagePath),
	}
}

/**
 * Get the dimensions of an image
 */
export async function getImageDimensions(imagePath: string): Promise<{
	height: number
	width: number
}> {
	// Probably throws?
	const { width, height } = await imageSizeFromFile(imagePath)
	return { width, height }
}

/**
 * Check if an image has an alpha channel
 */
export async function hasAlpha(imagePath: string): Promise<boolean> {
	const mime = lookupImageMimeType(imagePath, true)

	// Fast path, jpegs are never transparent
	if (mime === 'jpeg') {
		return false
	}

	// Medium path, check for alpha channel
	const { stdout: channelOutput } = await execa('identify', ['-format', '%[channels]', imagePath])
	if (!channelOutput.includes('rgba')) {
		return false
	}

	// Slow path, check for transparency in the alpha channel
	try {
		// Imagemagick looks per-pixel, not just for presence of alpha channel
		// Maybe not 100% accurate???
		// const { stdout } = await execa('identify', ['-format', '%[opaque]', imagePath])

		// Alternate...
		const { stdout } = await execa('convert', [
			imagePath,
			'-channel',
			'A',
			'-separate',
			'+channel',
			'-format',
			'%[fx:mean]',
			'info:',
		])

		return stdout !== '1'
	} catch (error) {
		throw new Error(`Error checking file: ${String(error)}`)
	}
}
