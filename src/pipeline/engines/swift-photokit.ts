import fse from 'fs-extra'
import { aphexExport } from '../../utilities/image/aphex-swift-bridge'

/**
 * Export a photo via aphex-swift command line tool using PhotoKit
 */
export async function exportViaSwiftPhotoKit(
	photoUuid: string,
	destinationDirectory: string,
): Promise<string> {
	await fse.mkdir(destinationDirectory, { recursive: true })

	const [result] = await aphexExport(photoUuid, destinationDirectory)
	return result
}
