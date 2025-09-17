import type { AlbumInfo, PhotoInfo } from '../aphex-swift/cli-bridge'
import { aphexAlbumInfo, aphexPhotoInfo, isAlbumInfo, isPhotoInfo } from './cli-bridge'

/**
 * Takes a mix of photos, albums, strings, all resolved to a single array of PhotoInfo objects
 */
export async function resolveIdentifiers(
	identifiers: Array<AlbumInfo | PhotoInfo | string>,
): Promise<PhotoInfo[]> {
	const photoInfos = identifiers.filter((identifier) => isPhotoInfo(identifier))
	const identifierAlbumUuids = identifiers
		.filter((identifier) => isAlbumInfo(identifier))
		.map((identifier) => identifier.uuid)
	const identifierStrings = identifiers.filter((identifier) => typeof identifier === 'string')

	photoInfos.push(...(await aphexPhotoInfo([...identifierAlbumUuids, ...identifierStrings])))

	if (photoInfos.length === 0) {
		throw new Error(
			`No photos found for identifiers "${identifiers.map((identifier) => JSON.stringify(identifier)).join(', ')}"`,
		)
	}

	// Ensure unique by uuid
	const seen = new Set<string>()
	const unique = photoInfos.filter((photo) => {
		if (seen.has(photo.uuid)) return false
		seen.add(photo.uuid)
		return true
	})

	return unique
}

/**
 * Albums
 */
export async function resolveAlbumIdentifier(identifier: AlbumInfo | string): Promise<AlbumInfo> {
	if (isAlbumInfo(identifier)) {
		return identifier
	}

	const aphexAlbumInfoResult = await aphexAlbumInfo(identifier)
	if (aphexAlbumInfoResult.length === 0) {
		throw new Error(`No album found for identifier "${identifier}"`)
	}
	if (aphexAlbumInfoResult.length > 1) {
		throw new Error(`Multiple albums found for identifier "${identifier} — is it a photo?"`)
	}

	return aphexAlbumInfoResult[0]
}

/**
 * Get photo info if needed, and throw errors if it's not a photo
 */
export async function resolvePhotoIdentifier(identifier: PhotoInfo | string): Promise<PhotoInfo> {
	if (isPhotoInfo(identifier)) {
		return identifier
	}
	const aphexPhotoInfoResult = await aphexPhotoInfo(identifier)
	if (aphexPhotoInfoResult.length === 0) {
		throw new Error(`No photo asset found for identifier "${identifier}"`)
	}
	if (aphexPhotoInfoResult.length > 1) {
		throw new Error(`Multiple photo assets found for identifier "${identifier} — is it an album?"`)
	}
	return aphexPhotoInfoResult[0]
}
