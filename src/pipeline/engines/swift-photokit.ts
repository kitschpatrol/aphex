/**
 * Currently unused!
 */

import { defu } from 'defu'
import { execa } from 'execa'
import fse from 'fs-extra'
import path from 'node:path'
import { packageDirectory } from 'package-directory'

export type ExportOptions = {
	mode?: 'requestimage' | 'requestimagedataandorientation'
}

const defaultExportOptions: Required<ExportOptions> = {
	mode: 'requestimage',
}

/**
 * Export a photo via a bespoke Swift script that uses the `requestimage` mode.
 */
export async function exportViaSwiftPhotoKit(
	photoUuid: string,
	destinationDirectory: string,
	options?: ExportOptions,
): Promise<string> {
	const { mode } = defu(options, defaultExportOptions)

	await fse.mkdir(destinationDirectory, { recursive: true })

	const packageRoot = await packageDirectory()

	if (!packageRoot) {
		throw new Error('Package root not found')
	}

	await execa(
		'./photokit-export',
		[
			'--photo-uuid',
			photoUuid,
			'--destination-directory',
			destinationDirectory,
			'--filename',
			photoUuid,
			'--mode',
			mode,
		],
		{
			cwd: path.join(packageRoot, 'dist'),
		},
	)

	// Assuming output in PNG format
	return `${destinationDirectory}/${photoUuid}.png`
}
