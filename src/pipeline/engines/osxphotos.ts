import { assert } from '@sindresorhus/is'
import { defu } from 'defu'
import { execa } from 'execa'
import fse from 'fs-extra'
import path from 'node:path'

export type ExportMode = 'export' | 'photokit' | 'photos-export'

export type ExportViaOsxphotosOptions = {
	filename?: string
	libraryPath?: string
	mode?: ExportMode
	original?: boolean
}

type OsxphotosExportReport = {
	cleanupDeletedDirectory: boolean
	cleanupDeletedFile: boolean
	convertedToJpeg: boolean
	dateTime: string
	error: string
	exiftoolError: string
	exiftoolWarning: string
	exifUpdated: boolean
	exported: boolean
	exportedAlbum: string
	extendedAttributesSkipped: boolean
	extendedAttributesWritten: boolean
	filename: string
	isNew: boolean
	missing: boolean
	sidecarExiftool: boolean
	sidecarJson: boolean
	sidecarUser: boolean
	sidecarUserError: string
	sidecarXmp: boolean
	skipped: boolean
	touched: boolean
	updated: boolean
	userError: string
	userSkipped: boolean
	userWritten: boolean
}

function assertOsxphotosExportReport(report: unknown): asserts report is OsxphotosExportReport[] {
	assert.array(report, assert.plainObject)
	assert.string(report[0].filename)
}

const defaultExportViaOsxphotosOptions: Required<
	Omit<ExportViaOsxphotosOptions, 'libraryPath' | 'reportPath'>
> = {
	filename: '{uuid}',
	mode: 'export',
	original: false,
}

/**
 * Export a photo using osxphotos with different export modes.
 * @param photoUuid - UUID or array of UUIDs of the photo(s) to export
 * @param destinationDirectory - Directory to export the photo to
 * @param options - Export options including mode and original preference
 * @returns Promise resolving to the exported file path(s)
 */
export async function exportViaOsxphotos(
	photoUuid: string | string[],
	destinationDirectory: string,
	options?: ExportViaOsxphotosOptions,
): Promise<string[]> {
	const { filename, libraryPath, mode, original } = defu(options, defaultExportViaOsxphotosOptions)

	// Get temp directory
	const tempDirectory = await fse.mkdtemp('osxphotos-export-')
	const reportPath = path.join(tempDirectory, 'report.json')

	await fse.mkdir(destinationDirectory, { recursive: true })

	// Build base arguments array
	const args = [
		'export',
		destinationDirectory,
		'--only-photos',
		'--jpeg-ext',
		'jpeg',
		'--no-exportdb',
		'--no-progress',
		'--filename',
		filename,
		'--report',
		reportPath,
	]

	// Add library path if provided
	if (libraryPath !== undefined) {
		args.push('--library', libraryPath)
	}

	// Add original/edited handling arguments
	if (original) {
		args.push('--skip-edited')
	} else {
		args.push('--skip-original-if-edited', '--edited-suffix', '')
	}

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

	// Add UUIDs - handle both string and string[] cases
	if (Array.isArray(photoUuid)) {
		// Prefix each entry with --uuid
		args.push(...photoUuid.flatMap((uuid) => ['--uuid', uuid]))
	} else {
		args.push('--uuid', photoUuid)
	}

	console.log('----------------------------------')
	console.log(args)

	await execa('osxphotos', args)

	// Parsing the stdout is a mess, so we write a report to a file and read that
	// eslint-disable-next-line ts/no-unsafe-assignment
	const report = await fse.readJSON(reportPath)
	assertOsxphotosExportReport(report)
	const exportedFiles = report.map((report) => report.filename)
	await fse.rm(tempDirectory, { force: true, recursive: true })

	return exportedFiles
}
