import { execa } from 'execa'
import path from 'node:path'
import { getTempDirectory } from '../../utilities/file'

// @case-police-ignore appleScript

// https://github.com/RhetTbull/PhotoScript/blob/0501c48d9e56a1bdd840abf8166d3cd9da120953/photoscript/__init__.py#L32
const UUID_SUFFIX_PHOTO = '/L0/001'
// const UUID_SUFFIX_ALBUM = '/L0/040'
// const UUID_SUFFIX_FOLDER = '/L0/020'

function escapeForAppleScript(text: string): string {
	// eslint-disable-next-line unicorn/prefer-string-raw
	return text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

/**
 * Export a photo via AppleScript using the Photos app's scripting dictionary
 *
 * @param photoUuid - UUID of the photo to export
 * @param forceOriginal - Whether to force export of original version
 *
 * @returns Promise<string> - Path to the exported file
 */
export async function exportViaAppleScript(
	photoUuid: string,
	forceOriginal = false,
): Promise<string> {
	const tempDirectory = await getTempDirectory('engine', 'applescript')

	// Choose AppleScript export flag
	const exportFlag = forceOriginal ? 'with originals' : 'without originals'

	const escapedUuid = escapeForAppleScript(`${photoUuid}${UUID_SUFFIX_PHOTO}`)
	const escapedDirectory = escapeForAppleScript(tempDirectory)

	// AppleScript to export photo using Photos app dictionary
	const appleScript = `
    tell application "Photos"
      -- Find the media item by UUID
      set targetPhoto to (first media item whose id is "${escapedUuid}")

      -- Export the photo to temp directory
      export {targetPhoto} to POSIX file "${escapedDirectory}" ${exportFlag}

      -- Get the exported file name
      set photoFilename to filename of targetPhoto

      -- Return the filename for path construction
      return photoFilename
    end tell
  `

	try {
		// Execute AppleScript via osascript
		const { stdout } = await execa('osascript', ['-e', appleScript])

		// The AppleScript returns the filename, construct full path
		const exportedFileName = stdout.trim()
		const exportedFilePath = path.join(tempDirectory, exportedFileName)

		return exportedFilePath
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		throw new Error(`Failed to export photo via AppleScript: ${errorMessage}`, { cause: error })
	}
}
