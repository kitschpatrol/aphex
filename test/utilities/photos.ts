import fse from 'fs-extra'
import path from 'node:path'
import { stripExtension } from '../../src/utilities/file'
import { ensureArray } from '../../src/utilities/general'
import { aphexPhotoInfo } from '../../src/utilities/image/aphex-swift-bridge'

/**
 * Gets a sample photo UUID from the user's Photos library.
 */
export async function getSamplePhotoUuid(
	isEdited: boolean | undefined = undefined,
	hasTitle: boolean | undefined = undefined,
): Promise<string> {
	const photos = await aphexPhotoInfo('/Favorites')
	for (const photo of photos) {
		if (
			(isEdited === undefined || Boolean(photo.edited) === isEdited) &&
			(hasTitle === undefined || Boolean(photo.title) === hasTitle)
		) {
			return photo.uuid
		}
	}
	throw new Error('No matching photo found')
}

/**
 * Gets sample photo UUIDs for all four permutations of edited/unedited and titled/untitled.
 */
export async function getSamplePhotoPermutations(): Promise<string[]> {
	return Promise.all([
		getSamplePhotoUuid(false, false),
		getSamplePhotoUuid(false, true),
		getSamplePhotoUuid(true, false),
		getSamplePhotoUuid(true, true),
	])
}

/**
 * Add some entropy to a filename by appending a random number suffix.
 */
export async function entropicRename(original: string | string[]): Promise<string[]> {
	const originalArray = ensureArray(original)
	const entropicPaths: string[] = []

	for (const original of originalArray) {
		const originalDirectory = path.dirname(original)
		const originalExtension = path.extname(original)
		const originalBare = stripExtension(path.basename(original))

		Math.round(Math.random() * 1_000_000)
		const randomPart = Math.floor(Math.random() * 1_000_000)
		const entropicPath = path.join(
			originalDirectory,
			`${originalBare}-${randomPart}.${originalExtension}`,
		)
		entropicPaths.push(entropicPath)
		await fse.rename(original, entropicPath)
	}
	return entropicPaths
}
