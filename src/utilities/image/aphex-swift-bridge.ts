import is, { assert } from '@sindresorhus/is'
import { execa } from 'execa'
import path from 'node:path'
import { packageDirectorySync } from 'package-directory'
import { ensureArray } from '../general'

/**
 * Get full album paths mapped to their UUIDs
 * @throws
 */
export async function aphexAlbums(): Promise<Record<string, string>> {
	const result = await execa('./aphex-swift', ['albums'], {
		cwd: getDistributionPath(),
	})

	try {
		const output: unknown = JSON.parse(result.stdout)
		assert.object<string, string>(output)
		return output
	} catch {
		throw new Error(`Error fetching albums: ${result.stdout}`)
	}
}

/**
 * TypeScript type definition for the JSON representation of a PHAsset
 * from the iOS Photos framework
 */
export type PhotoInfo = {
	burstIdentifier?: string
	creationDate?: Date
	editedFilename?: string
	editedFilePath?: string
	hasAdjustments: boolean
	isFavorite: boolean
	isHidden: boolean
	localIdentifier: string
	mediaSubtypes: number
	mediaType: number
	modificationDate?: Date
	originalFilename?: string
	originalFilePath?: string
	pixelHeight: number
	pixelWidth: number
	representsBurst: boolean
	sourceType: number
	title?: string
}

export type AlbumInfo = {
	assetCollectionSubtype: number
	assetCollectionType: number
	endDate?: Date
	estimatedAssetCount: number
	localIdentifier: string
	localizedTitle?: string
	startDate?: Date
}

/**
 * Runtime type guard for PhotoInfo
 */
// eslint-disable-next-line complexity
export function isPhotoInfo(value: unknown): value is PhotoInfo {
	if (!is.plainObject(value)) {
		return false
	}

	// Required fields
	if (
		!is.string((value as Record<string, unknown>).localIdentifier) ||
		!is.boolean((value as Record<string, unknown>).hasAdjustments) ||
		!is.boolean((value as Record<string, unknown>).isFavorite) ||
		!is.boolean((value as Record<string, unknown>).isHidden) ||
		!is.number((value as Record<string, unknown>).mediaSubtypes) ||
		!is.number((value as Record<string, unknown>).mediaType) ||
		!is.number((value as Record<string, unknown>).pixelHeight) ||
		!is.number((value as Record<string, unknown>).pixelWidth) ||
		!is.boolean((value as Record<string, unknown>).representsBurst) ||
		!is.number((value as Record<string, unknown>).sourceType)
	) {
		return false
	}

	// Optional string fields (if present)
	const object = value as Record<string, unknown>
	if (
		(object.burstIdentifier !== undefined && !is.string(object.burstIdentifier)) ||
		(object.editedFilename !== undefined && !is.string(object.editedFilename)) ||
		(object.editedFilePath !== undefined && !is.string(object.editedFilePath)) ||
		(object.originalFilename !== undefined && !is.string(object.originalFilename)) ||
		(object.originalFilePath !== undefined && !is.string(object.originalFilePath)) ||
		(object.title !== undefined && !is.string(object.title))
	) {
		return false
	}

	// Optional date fields (if present)
	if (
		(object.creationDate !== undefined && !is.date(object.creationDate)) ||
		(object.modificationDate !== undefined && !is.date(object.modificationDate))
	) {
		return false
	}

	return true
}

/**
 * Runtime type guard for PhotoInfo array
 */
export function isPhotoInfoArray(value: unknown): value is PhotoInfo[] {
	return is.array(value) && value.every((element) => isPhotoInfo(element))
}

/**
 * Runtime type guard for AlbumInfo
 */
export function isAlbumInfo(value: unknown): value is AlbumInfo {
	if (!is.plainObject(value)) {
		return false
	}

	const object = value as Record<string, unknown>

	if (
		!is.string(object.localIdentifier) ||
		!is.number(object.assetCollectionType) ||
		!is.number(object.assetCollectionSubtype) ||
		!is.number(object.estimatedAssetCount)
	) {
		return false
	}

	if (
		(object.localizedTitle !== undefined && !is.string(object.localizedTitle)) ||
		(object.startDate !== undefined && !is.date(object.startDate)) ||
		(object.endDate !== undefined && !is.date(object.endDate))
	) {
		return false
	}

	return true
}

/**
 * Assert that a value is a PhotoInfo
 */
export function assertPhotoInfo(value: unknown): asserts value is PhotoInfo {
	if (!isPhotoInfo(value)) {
		throw new Error('Invalid PhotoInfo object')
	}
}

/**
 * Assert that a value is an array of PhotoInfo
 */
export function assertPhotoInfoArray(value: unknown): asserts value is PhotoInfo[] {
	if (!isPhotoInfoArray(value)) {
		throw new Error('Invalid PhotoInfo array')
	}
}

/**
 * Assert that a value is an AlbumInfo
 */
export function assertAlbumInfo(value: unknown): asserts value is AlbumInfo {
	if (!isAlbumInfo(value)) {
		throw new Error('Invalid AlbumInfo object')
	}
}

/**
 * Get photo asset information for given identifiers (UUID, filename, album name, or photo path)
 * @throws
 */
export async function aphexPhotoInfo(
	identifiers: string | string[],
	caseSensitive = false,
): Promise<PhotoInfo[]> {
	const identifiersArray = ensureArray(identifiers)

	const result = await execa(
		'./aphex-swift',
		['photo-info', ...identifiersArray, caseSensitive ? '--case-sensitive' : ''],
		{
			cwd: getDistributionPath(),
		},
	)

	try {
		const output: unknown = JSON.parse(result.stdout, dateReviver)
		assertPhotoInfoArray(output)
		return output
	} catch {
		throw new Error(`Error fetching albums: ${result.stdout}`)
	}
}

/**
 * Export photos for given identifiers to a destination directory
 * @throws
 */
export async function aphexAlbumInfo(
	identifier: string,
	caseSensitive = false,
): Promise<AlbumInfo> {
	const result = await execa(
		'./aphex-swift',
		['album-info', identifier, caseSensitive ? '--case-sensitive' : ''],
		{
			cwd: getDistributionPath(),
		},
	)

	try {
		const output: unknown = JSON.parse(result.stdout, dateReviver)
		assertAlbumInfo(output)
		return output
	} catch {
		throw new Error(`Error fetching album info: ${result.stdout}`)
	}
}

/**
 * Export photos for given identifiers to a destination directory
 * @throws
 */
export async function aphexExport(
	identifiers: string | string[],
	destination: string,
	caseSensitive = false,
): Promise<string[]> {
	const identifiersArray = ensureArray(identifiers)

	const result = await execa(
		'./aphex-swift',
		[
			'export',
			...identifiersArray,
			'--destination',
			destination,
			caseSensitive ? '--case-sensitive' : '',
		],
		{
			cwd: getDistributionPath(),
		},
	)

	try {
		const output: unknown = JSON.parse(result.stdout, dateReviver)
		assert.array<string>(output)
		return output
	} catch {
		throw new Error(`Error fetching albums: ${result.stdout}`)
	}
}

function getDistributionPath(): string {
	const packageRoot = packageDirectorySync()
	if (!packageRoot) {
		throw new Error('Package root not found')
	}
	return path.join(packageRoot, 'dist')
}

function dateReviver(key: string, value: unknown) {
	if (
		(key === 'creationDate' ||
			key === 'modificationDate' ||
			key === 'startDate' ||
			key === 'endDate') &&
		typeof value === 'string'
	) {
		return value ? new Date(value) : undefined
	}
	return value
}
