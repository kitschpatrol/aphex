/* eslint-disable ts/no-unused-vars */

import { exportViaFileSystem } from './engines/file-system'
import { exportViaOsxphotos } from './engines/osxphotos'
import { exportViaSwiftPhotoKit } from './engines/swift-photokit'

type ExportOptions = {
	engine?:
		| 'applescript-gui'
		| 'file-system'
		| 'osxphotos'
		| 'osxphotos-photokit'
		| 'osxphotos-photos'
		| 'swift-photokit'
		| 'swift-photokit-orientation'
}

/**
 * Export an album to a directory.
 * @param album - The album to export.
 * @param destinationDirectory - The directory to export the album to.
 * @returns The path to the exported album.
 */
export async function exportAlbum(album: string, destinationDirectory: string): Promise<string> {
	// TODO
	return ''
}

/**
 * Export a photo to a directory.
 * @param uuid - The UUID of the photo to export.
 * @param destinationDirectory - The directory to export the photo to.
 * @returns The path to the exported photo.
 */
export async function exportPhoto(uuid: string, destinationDirectory: string): Promise<string> {
	// TODO
	return ''
}
