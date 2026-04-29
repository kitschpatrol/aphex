import fse from 'fs-extra'
import path from 'node:path'
import type { PhotoInfo } from '../../aphex-swift/cli-bridge'
import { aphexPhotoInfo, isPhotoInfo } from '../../aphex-swift/cli-bridge'
import { getTempDirectory } from '../../utilities/file'

/**
 * Export a photo via direct file system copy of the original or edited file to
 * a temporary directory Clean up and move the file as needed afterwards
 */
export async function exportViaFileSystem(
	photoUuid: PhotoInfo | string,
	forceOriginal = false,
): Promise<string> {
	const [{ edited, original }] = isPhotoInfo(photoUuid)
		? [photoUuid]
		: await aphexPhotoInfo(photoUuid)

	const tempDirectory = await getTempDirectory('engine', 'file-system')

	if (forceOriginal || edited === undefined) {
		const destinationPath = path.join(tempDirectory, original.fileName)
		await fse.copy(original.filePath, destinationPath, {
			overwrite: true,
		})

		return destinationPath
	}

	const destinationPath = path.join(tempDirectory, edited.fileName)
	await fse.copy(edited.filePath, destinationPath, {
		overwrite: true,
	})

	return destinationPath
}
