import type { PartialDeep } from 'type-fest'
import { execa } from 'execa'
import path from 'node:path'
import { mergeDefaults } from '../../utilities/defaults'
import { getTempDirectory } from '../../utilities/file'
import { getPackageAssetsPath } from '../../utilities/paths'

/**
 * Mirrors the export UI in Note that note that some options are contingent on
 * others.
 *
 * The AppleScript implementation is smart about only "clicking" the necessary
 * options in the GUI.
 */
export type ExportViaAppleScriptGuiOptions = {
	/** "Color Profile" Drop Down */
	colorProfile: 'AdobeRGB' | 'Display P3' | 'Most Compatible' | 'Original' | 'sRGB'
	/** "File Name" Drop Down */
	fileName: 'Album Name With Number' | 'Sequential' | 'Use File Name' | 'Use Title'
	/** "Include Location Information" Checkbox */
	includeLocation: boolean
	/** "Include Title, Keywords, and Caption" Checkbox */
	includeMetadata: boolean
	/**
	 * "JPEG Quality" Drop Down
	 *
	 * Only applies if `photoKind` is `JPEG`
	 */
	jpegQuality: 'High' | 'Low (smallest Size)' | 'Maximum' | 'Medium'
	/**
	 * "Size Max" Drop Down
	 *
	 * Only applies if `photoSize` is `Custom`
	 */
	maxSizeType: 'Dimension' | 'Height' | 'Width'
	/**
	 * "Size Max of" text field
	 *
	 * Only applies if `photoSize` is `Custom`
	 */
	maxSizeValue: number
	/** "Photo Kind" Drop Down */
	photoKind: 'HEIC' | 'JPEG' | 'PNG' | 'TIFF'
	/** "Size" Drop Down */
	photoSize: 'Custom' | 'Full Size' | 'Large' | 'Medium' | 'Small'
	/**
	 * "Sequential Prefix" Text Field
	 *
	 * Only applies if `fileName` is `Sequential`
	 */
	sequentialPrefix: string
	/** "Subfolder Format" Drop Down */
	subfolderFormat: 'Moment Name' | 'None'
	/**
	 * "16 Bit" Checkbox
	 *
	 * Only applies if `photoKind` is `TIFF`
	 */
	tiffBitDepth: 8 | 16
}

/** Apple's defaults, but these are overridden by Aphex by default */
const defaultExportViaAppleScriptGuiOptions: ExportViaAppleScriptGuiOptions = {
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
 * Export a photo via the Photos.app GUI to a temporary directory Clean up and
 * move the file as needed afterwards
 */
export async function exportViaAppleScriptGui(
	/**
	 * UUID of either a photo or an album
	 */
	uuid: string,
	options?: PartialDeep<ExportViaAppleScriptGuiOptions>,
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
	} = mergeDefaults(options, defaultExportViaAppleScriptGuiOptions)

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
