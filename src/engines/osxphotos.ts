import { defu } from 'defu'
import { execa } from 'execa'
import fse from 'fs-extra'

export type ExportMode = 'export' | 'photokit' | 'photos-export'

export type ExportOptions = {
	mode?: ExportMode
	original?: boolean
}

const defaultExportOptions: Required<ExportOptions> = {
	mode: 'export',
	original: false,
}

/**
 * Export a photo using osxphotos with different export modes.
 * @param photoUuid - UUID of the photo to export
 * @param destinationDirectory - Directory to export the photo to
 * @param options - Export options including mode and original preference
 * @returns Promise resolving to the exported file path
 */
export async function exportViaOsxphotos(
	photoUuid: string,
	destinationDirectory: string,
	options?: ExportOptions,
): Promise<string> {
	const { mode, original } = defu(options, defaultExportOptions)

	await fse.mkdir(destinationDirectory, { recursive: true })

	// Build base arguments array
	const args = [
		'export',
		destinationDirectory,
		'--only-photos',
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
	]

	// Add mode-specific arguments
	switch (mode) {
		case 'export': {
			// No additional flags for basic export mode
			break
		}
		case 'photokit': {
			args.push('--use-photos-export', '--use-photokit')
			break
		}
		case 'photos-export': {
			args.push('--use-photos-export')
			break
		}
	}

	// Add original/edited handling arguments
	if (original) {
		args.push('--skip-edited')
	} else {
		args.push('--skip-original-if-edited', '--edited-suffix', '')
	}

	const { stdout } = await execa('osxphotos', args)

	return /^export filepath: (.+)$/im.exec(stdout)![1]
}
