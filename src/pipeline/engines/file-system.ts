import fse from 'fs-extra'
import path from 'node:path'
import type { PhotoInfo } from '../../utilities/image/aphex-swift-bridge'
import { aphexPhotoInfo, isPhotoInfo } from '../../utilities/image/aphex-swift-bridge'

/**
 * Export a photo via direct file system copy of the original or edited file
 */
export async function exportViaFileSystem(
	photoUuid: PhotoInfo | string,
	destinationDirectory: string,
	forceOriginal = false,
): Promise<string> {
	const [{ edited, original }] = isPhotoInfo(photoUuid)
		? [photoUuid]
		: await aphexPhotoInfo(photoUuid)

	if (forceOriginal || edited === undefined) {
		const destinationPath = path.join(destinationDirectory, original.fileName)
		await fse.copy(original.filePath, destinationPath, {
			overwrite: true,
		})

		return destinationPath
	}

	const destinationPath = path.join(destinationDirectory, edited.fileName)
	await fse.copy(edited.filePath, destinationPath, {
		overwrite: true,
	})

	return destinationPath
}
