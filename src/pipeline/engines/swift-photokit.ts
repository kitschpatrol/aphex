import { aphexExport } from '../../aphex-swift/cli-bridge'
import { getTempDirectory } from '../../utilities/file'

/**
 * Export a photo via aphex-swift command line tool using PhotoKit
 */
export async function exportViaSwiftPhotoKit(photoUuid: string): Promise<string> {
	const tempDirectory = await getTempDirectory('engine', 'swift-photokit')
	const [result] = await aphexExport(photoUuid, tempDirectory)
	return result
}
