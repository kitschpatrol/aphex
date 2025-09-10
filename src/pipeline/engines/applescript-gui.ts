import { defu } from 'defu'
import { execa } from 'execa'
import fse from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import { normalizeExtension } from '../../utilities/file'

export type ExportViaAppleScriptGuiOptions = {
	colorProfile?: 'AdobeRGB' | 'Display P3' | 'Most Compatible' | 'Original' | 'sRGB'
	fileName?: 'Album Name With Number' | 'Sequential' | 'Use File Name' | 'Use Title'
	includeLocation?: boolean
	includeMetadata?: boolean
	jpegQuality?: 'High' | 'Low (smallest Size)' | 'Maximum' | 'Medium'
	maxSizeType?: 'Dimension' | 'Height' | 'Width'
	maxSizeValue?: number
	photoKind?: 'HEIC' | 'JPEG' | 'PNG' | 'TIFF'
	photoSize?: 'Custom' | 'Full Size' | 'Large' | 'Medium' | 'Small'
	sequentialPrefix?: string
	subfolderFormat?: 'Moment Name' | 'None'
	tiffBitDepth?: 8 | 16
}

const defaultExportViaAppleScriptGuiOptions: Required<ExportViaAppleScriptGuiOptions> = {
	colorProfile: 'Most Compatible',
	fileName: 'Use File Name',
	includeLocation: true,
	includeMetadata: true,
	jpegQuality: 'High',
	maxSizeType: 'Dimension',
	maxSizeValue: 2048,
	photoKind: 'JPEG',
	photoSize: 'Large',
	sequentialPrefix: '',
	subfolderFormat: 'None',
	tiffBitDepth: 8,
}

/**
 * Export a photo via the Photos.app GUI.
 */
export async function exportViaAppleScriptGui(
	/**
	 * UUID of either a photo or an album
	 */
	uuid: string,
	exportDirectory: string,
	options?: ExportViaAppleScriptGuiOptions,
): Promise<string[]> {
	const {
		colorProfile,
		fileName,
		includeLocation,
		includeMetadata,
		jpegQuality,
		maxSizeType,
		maxSizeValue,
		photoKind,
		photoSize,
		sequentialPrefix,
		subfolderFormat,
		tiffBitDepth,
	} = defu(options, defaultExportViaAppleScriptGuiOptions)

	// Passed in order of appearance in the UI
	// Due to the nature of the implementation, there's no streaming output, just
	// a report at the end

	await fse.ensureDir(exportDirectory)

	// Get temp directory
	const tempDirectory = await fse.mkdtemp(path.join(os.tmpdir(), `com.kitschpatrol.aphex.`))

	const appleScriptPath = path.join(import.meta.dirname, './applescript-gui.applescript')

	const { failed, stderr } = await execa('osascript', [
		appleScriptPath,
		uuid,
		tempDirectory,
		photoKind,
		jpegQuality,
		tiffBitDepth.toString(),
		colorProfile,
		photoSize,
		maxSizeType,
		maxSizeValue.toString(),
		includeMetadata.toString(),
		includeLocation.toString(),
		fileName,
		sequentialPrefix,
		subfolderFormat,
	])

	if (failed) {
		throw new Error(`Error exporting album "${uuid}": ${stderr}`)
	}

	// Osascript logs to stderr...
	const results = stderr.split('\n').filter((line) => line.trim() !== '')
	if (results.length === 0) {
		throw new Error(`No photos exported for album "${uuid}"`)
	}

	if (typeof results[0] !== 'string') {
		throw new TypeError(`Unexpected export results for album "${uuid}": ${JSON.stringify(results)}`)
	}

	const cleanPaths: string[] = []
	for (const exportedPath of results) {
		// Normalize filename and move to destination directory
		const cleanPath = path.join(exportDirectory, path.basename(normalizeExtension(exportedPath)))

		cleanPaths.push(cleanPath)
		await fse.move(exportedPath, cleanPath)

		// Copy relevant metadata from the original photo since photos-gui doesn't preserve it?
		// Can't do this without original image path, which has to come from the osxphotos photo info?
	}

	await fse.rm(tempDirectory, { force: true, recursive: true })

	return cleanPaths
}
