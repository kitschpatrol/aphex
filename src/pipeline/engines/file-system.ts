import { assert } from '@sindresorhus/is'
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
	const [{ editedFilename, editedFilePath, originalFilename, originalFilePath }] = isPhotoInfo(
		photoUuid,
	)
		? [photoUuid]
		: await aphexPhotoInfo(photoUuid)

	assert.string(originalFilePath)
	assert.string(originalFilename)

	if (forceOriginal || editedFilePath === undefined || editedFilename === undefined) {
		const destinationPath = path.join(destinationDirectory, originalFilename)
		await fse.copy(originalFilePath, destinationPath, {
			overwrite: true,
		})

		return destinationPath
	}

	const destinationPath = path.join(destinationDirectory, editedFilename)
	await fse.copy(editedFilePath, destinationPath, {
		overwrite: true,
	})

	return destinationPath
}
