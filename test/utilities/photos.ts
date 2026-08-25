import { isDate } from '@sindresorhus/is'
import fse from 'fs-extra'
import path from 'node:path'
import { aphexPhotoInfo } from '../../src/aphex-swift/cli-bridge'
import { stripExtension } from '../../src/utilities/file'
import { ensureArray } from '../../src/utilities/general'

/**
 * Gets a sample photo UUID from the user's Photos library.
 */
export async function getSamplePhotoUuid(isEdited?: boolean, hasTitle?: boolean): Promise<string> {
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
 * Gets sample photo UUIDs for all four permutations of edited/unedited and
 * titled/untitled.
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

	for (const originalPath of originalArray) {
		const originalDirectory = path.dirname(originalPath)
		const originalExtension = path.extname(originalPath)
		const originalBare = stripExtension(path.basename(originalPath))

		Math.round(Math.random() * 1_000_000)
		const randomPart = Math.floor(Math.random() * 1_000_000)
		const entropicPath = path.join(
			originalDirectory,
			`${originalBare}-${randomPart}.${originalExtension}`,
		)
		entropicPaths.push(entropicPath)
		await fse.rename(originalPath, entropicPath)
	}

	return entropicPaths
}

/**
 * Recursively replace all non-object/array values with an empty string,
 * preserving the original array/object shape. This is intentionally typed with
 * `unknown` to avoid unsafe generic assertions when transforming arbitrary data
 * structures in tests.
 *
 * Example: keyTree({ a: 1, b: [2, { c: 3 }] }) -> { a: '', b: ['', { c: '' }] }
 */
export function keyTree(input: unknown): unknown {
	if (Array.isArray(input)) {
		return input.map((item) => keyTree(item))
	}

	if (input !== null && typeof input === 'object' && !isDate(input)) {
		const result: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(input)) {
			result[key] = keyTree(value)
		}

		return result
	}

	return ''
}
