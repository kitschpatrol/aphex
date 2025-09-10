import { assert } from '@sindresorhus/is'
import { execa } from 'execa'
import path from 'node:path'
import { packageDirectorySync } from 'package-directory'
import { ensureArray } from './general'

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
type PhotoAsset = {
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

/**
 * Get photo asset information for given identifiers (UUID, filename, album name, or photo path)
 * @throws
 */
export async function aphexInfo(
	identifiers: string | string[],
	caseSensitive = false,
): Promise<PhotoAsset[]> {
	const identifiersArray = ensureArray(identifiers)

	const result = await execa(
		'./aphex-swift',
		['info', ...identifiersArray, caseSensitive ? '--case-sensitive' : ''],
		{
			cwd: getDistributionPath(),
		},
	)

	try {
		const output: unknown = JSON.parse(result.stdout, dateReviver)
		assert.array<PhotoAsset>(output)
		return output
	} catch {
		throw new Error(`Error fetching albums: ${result.stdout}`)
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
	if ((key === 'creationDate' || key === 'modificationDate') && typeof value === 'string') {
		return value ? new Date(value) : undefined
	}
	return value
}
