console.log('I am not an empty file!')

// import { exportViaAppleScriptGui } from './engines/applescript-gui'
// import { exportViaFileSystem } from './engines/file-system'
// import { exportViaOsxphotos } from './engines/osxphotos'
// import { exportViaSwiftPhotoKit } from './engines/swift-photokit'

// export type { ExportPhotoOptions } from './utilities/image/apple-photos'
// export { defaultExportPhotoOptions } from './utilities/image/apple-photos'

// Type ExportOptions = {
// 	engine?:
// 		| 'applescript-gui'
// 		| 'file-system'
// 		| 'osxphotos'
// 		| 'osxphotos-photokit'
// 		| 'osxphotos-photos'
// 		| 'swift-photokit'
// 		| 'swift-photokit-orientation'
// }

// /**
//  * Export an album to a directory.
//  * @param album - The album to export.
//  * @param destinationDirectory - The directory to export the album to.
//  * @param options - Export options including which engine to use.
//  * @returns The path to the exported album.
//  */
// export async function exportAlbum(
// 	album: string,
// 	destinationDirectory: string,
// 	options?: ExportOptions,
// ): Promise<string> {
// 	const engine = options?.engine ?? 'applescript-gui'

// 	switch (engine) {
// 		case 'applescript-gui': {
// 			const results = await exportViaAppleScriptGui(album, destinationDirectory)
// 			return results.join(', ')
// 		}
// 		case 'file-system':
// 		case 'osxphotos':
// 		case 'osxphotos-photokit':
// 		case 'osxphotos-photos':
// 		case 'swift-photokit':
// 		case 'swift-photokit-orientation': {
// 			throw new Error(`Album export not supported for engine: ${engine}`)
// 		}
// 	}
// }

// /**
//  * Export a photo to a directory.
//  * @param uuid - The UUID of the photo to export.
//  * @param destinationDirectory - The directory to export the photo to.
//  * @param options - Export options including which engine to use.
//  * @returns The path to the exported photo.
//  */
// export async function exportPhoto(
// 	uuid: string,
// 	destinationDirectory: string,
// 	options?: ExportOptions,
// ): Promise<string> {
// 	const engine = options?.engine ?? 'file-system'

// 	switch (engine) {
// 		case 'applescript-gui': {
// 			const results = await exportViaAppleScriptGui(uuid, destinationDirectory)
// 			return results[0] // Return first exported photo path
// 		}
// 		case 'file-system': {
// 			return exportViaFileSystem(uuid, destinationDirectory)
// 		}
// 		case 'osxphotos': {
// 			return exportViaOsxphotos(uuid, destinationDirectory, { mode: 'export' })
// 		}
// 		case 'osxphotos-photokit': {
// 			return exportViaOsxphotos(uuid, destinationDirectory, { mode: 'photokit' })
// 		}
// 		case 'osxphotos-photos': {
// 			return exportViaOsxphotos(uuid, destinationDirectory, { mode: 'photos-export' })
// 		}
// 		case 'swift-photokit': {
// 			return exportViaSwiftPhotoKit(uuid, destinationDirectory, { mode: 'requestimage' })
// 		}
// 		case 'swift-photokit-orientation': {
// 			return exportViaSwiftPhotoKit(uuid, destinationDirectory, {
// 				mode: 'requestimagedataandorientation',
// 			})
// 		}
// 	}
// }
