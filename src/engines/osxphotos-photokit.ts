import { defu } from 'defu'
import { execa } from 'execa'
import fse from 'fs-extra'
import type { ExportOptions } from '.'
import { defaultExportOptions } from '.'

/**
 * Export a photo by using the `osxphotos export --use-photokit` command.
 */
export async function exportViaOsxphotosPhotoKit(
	photoUuid: string,
	destinationDirectory: string,
	options?: ExportOptions,
): Promise<string> {
	const { original } = defu(options, defaultExportOptions)

	await fse.mkdir(destinationDirectory, { recursive: true })

	const { stdout } = await execa(
		'osxphotos',
		[
			'export',
			destinationDirectory,
			'--only-photos',
			original ? '--skip-edited' : undefined,
			'--no-exportdb',
			'--no-progress',
			'--post-command',
			'exported',
			'echo Export Filepath: {filepath|shell_quote}',
			'--jpeg-ext',
			'jpeg',
			'--uuid',
			photoUuid,
			'--filename',
			photoUuid,
			'--use-photos-export', // Keep this?
			'--use-photokit',
			...(original ? [undefined] : ['--skip-original-if-edited', '--edited-suffix', '']),
		].filter((v) => v !== undefined),
	)

	return /^export filepath: (.+)$/im.exec(stdout)![1]
}
