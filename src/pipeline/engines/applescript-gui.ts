import { execa } from 'execa'
import path from 'node:path'
import { mergeDefaults } from '../../utilities/defaults'
import { getPackageAssetsPath } from '../../utilities/paths'
import { getTempDirectory } from '../../utilities/file'

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
 * Export a photo via the Photos.app GUI to a temporary directory
 * Clean up and move the file as needed afterwards
 */
export async function exportViaAppleScriptGui(
	/**
	 * UUID of either a photo or an album
	 */
	uuid: string,
	options?: ExportViaAppleScriptGuiOptions,
): Promise<string[]> {
	const tempDirectory = await getTempDirectory('engine', 'applescript-gui')

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
	} = options
		? mergeDefaults(options, defaultExportViaAppleScriptGuiOptions)
		: defaultExportViaAppleScriptGuiOptions

	// Passed in order of appearance in the UI
	// Due to the nature of the implementation, there's no streaming output, just
	// a report at the end
	const appleScriptPath = path.join(
		getPackageAssetsPath(import.meta),
		'applescript-gui.applescript',
	)
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

	return results
}
