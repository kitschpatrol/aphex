import { defu } from 'defu'
import { execa } from 'execa'
import fse from 'fs-extra'
import type { ExportOptions } from '.'
import { defaultExportOptions } from '.'

/**
 * Export a photo via a bespoke Swift script that uses the `requestimagedataandorientation` mode.
 */
export async function exportViaSwiftPhotoKitOrientation(
	photoUuid: string,
	destinationDirectory: string,
	options?: ExportOptions,
): Promise<string> {
	const { original } = defu(options, defaultExportOptions)

	if (original !== defaultExportOptions.original) {
		console.warn("'original' option is not supported by 'exportViaSwiftPhotoKit'")
	}

	await fse.mkdir(destinationDirectory, { recursive: true })

	await execa('photos-album-exporter', [
		'--photo-uuid',
		photoUuid,
		'--destination-directory',
		destinationDirectory,
		'--filename',
		photoUuid,
		'--mode',
		'requestimagedataandorientation',
	])

	// Assuming output in PNG format
	return `${destinationDirectory}/${photoUuid}.png`
}
