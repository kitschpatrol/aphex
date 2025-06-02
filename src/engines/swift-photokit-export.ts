import { defu } from 'defu'
import { execa } from 'execa'
import fse from 'fs-extra'
import type { ExportOptions } from '.'
import { defaultExportOptions } from '.'

/**
 * Export a photo via a bespoke Swift script that uses the `requestimage` mode.
 */
export async function exportViaSwiftPhotoKit(
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
		'requestimage',
	])

	// Assuming output in PNG format
	return `${destinationDirectory}/${photoUuid}.png`
}
