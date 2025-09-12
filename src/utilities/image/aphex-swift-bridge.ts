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
 * TypeScript type definition for ResourceInfo from the Swift implementation
 */
export type ResourceInfo = {
	contentType: string
	fileName: string
	filePath: string
	fileSize: number
	height: number
	width: number
}

/**
 * TypeScript type definition for the JSON representation of a PHAsset
 * from the iOS Photos framework (CodablePHAsset)
 */
export type PhotoInfo = {
	dateCreated: Date
	dateModified: Date
	edited?: ResourceInfo
	favorite: boolean
	hidden: boolean
	original: ResourceInfo
	title?: string
	uuid: string
}

export type AlbumInfo = {
	dateEnd?: Date
	dateStart?: Date
	estimatedAssetCount: number
	path: string
	subtype: number
	title: string
	type: number
	uuid: string
}

/**
 * Runtime type guard for ResourceInfo
 */
export function isResourceInfo(value: unknown): value is ResourceInfo {
	if (!is.plainObject(value)) {
		return false
	}

	const object = value as Record<string, unknown>
	return (
		is.string(object.contentType) &&
		is.string(object.fileName) &&
		is.string(object.filePath) &&
		is.number(object.fileSize) &&
		is.number(object.height) &&
		is.number(object.width)
	)
}

/**
 * Runtime type guard for PhotoInfo
 */
export function isPhotoInfo(value: unknown): value is PhotoInfo {
	if (!is.plainObject(value)) {
		return false
	}

	const object = value as Record<string, unknown>

	// Required fields
	if (
		!is.string(object.uuid) ||
		!is.boolean(object.favorite) ||
		!is.boolean(object.hidden) ||
		!isResourceInfo(object.original) ||
		!is.date(object.dateCreated) ||
		!is.date(object.dateModified)
	) {
		return false
	}

	// Optional fields
	if (
		(object.title !== undefined && !is.string(object.title)) ||
		(object.edited !== undefined && !isResourceInfo(object.edited))
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
		!is.string(object.uuid) ||
		!is.number(object.type) ||
		!is.number(object.subtype) ||
		!is.number(object.estimatedAssetCount) ||
		!is.string(object.title) ||
		!is.string(object.path)
	) {
		return false
	}

	if (
		(object.dateStart !== undefined && !is.date(object.dateStart)) ||
		(object.dateEnd !== undefined && !is.date(object.dateEnd))
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
 * Runtime type guard for AlbumInfo array
 */
export function isAlbumInfoArray(value: unknown): value is AlbumInfo[] {
	return is.array(value) && value.every((element) => isAlbumInfo(element))
}

/**
 * Assert that a value is an AlbumInfo array
 */
export function assertAlbumInfoArray(value: unknown): asserts value is AlbumInfo[] {
	if (!isAlbumInfoArray(value)) {
		throw new Error('Invalid AlbumInfo array')
	}
}

/**
 * Get photo asset information for given identifiers (ID, filename, album name, or photo path)
 * @throws
 */
export async function aphexPhotoInfo(
	identifiers: string | string[],
	caseSensitive = false,
): Promise<PhotoInfo[]> {
	const identifiersArray = ensureArray(identifiers)

	const result = await execa(
		'./aphex-swift',
		['photo-info', ...identifiersArray, ...(caseSensitive ? ['--case-sensitive'] : [])],
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
	identifiers: string | string[],
	caseSensitive = false,
): Promise<AlbumInfo[]> {
	const identifiersArray = ensureArray(identifiers)

	const result = await execa(
		'./aphex-swift',
		['album-info', ...identifiersArray, ...(caseSensitive ? ['--case-sensitive'] : [])],
		{
			cwd: getDistributionPath(),
		},
	)

	try {
		const output: unknown = JSON.parse(result.stdout, dateReviver)
		assertAlbumInfoArray(output)
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
			...(caseSensitive ? ['--case-sensitive'] : []),
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
		(key === 'dateCreated' || key === 'dateModified' || key === 'dateStart' || key === 'dateEnd') &&
		typeof value === 'string'
	) {
		return value ? new Date(value) : undefined
	}
	return value
}
