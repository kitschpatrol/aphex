import { execa } from 'execa'
import fse from 'fs-extra'
import { slug as githubSlug } from 'github-slugger'
import os from 'node:os'
import path from 'node:path'

/**
 * Removes the file extension from a file path
 */
export function stripExtension(filePath: string) {
	return path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)))
}

/**
 * Gets the size of a file in bytes
 */
export async function getSizeBytes(filePath: string): Promise<number> {
	const { size } = await fse.stat(filePath)
	return size
}

/**
 * Normalizes file extensions, particularly for image files
 * Converts to lowercase.
 * Converts .jpg to .jpeg and .tif to .tiff
 */
export function normalizeExtension(filePath: string): string {
	const directory = path.dirname(filePath)
	const fileExtension = path.extname(filePath).toLowerCase()
	const fileBase = path.basename(filePath, path.extname(filePath))

	switch (fileExtension) {
		case '.jpg': {
			return path.join(directory, `${fileBase}.jpeg`)
		}

		case '.tif': {
			return path.join(directory, `${fileBase}.tiff`)
		}

		default: {
			return path.join(directory, `${fileBase}${fileExtension}`)
		}
	}
}

/**
 * Converts a filename to a GitHub-style slug format
 * @param filePath - The path of the file
 * @returns The slug version of the filename without extension
 */
export function getSlugFilename(filePath: string): string {
	return githubSlug(path.basename(filePath, path.extname(filePath)))
}

/**
 * Converts a filename within a path to a slug format while preserving the directory and extension
 * @param filePath - The path of the file
 * @returns The file path with the filename portion converted to slug format
 */
export function sluggifyFilenameInPath(filePath: string): string {
	const directory = path.dirname(filePath)
	const fileExtension = path.extname(filePath)
	const fileName = path.basename(filePath, fileExtension)
	const slug = githubSlug(fileName)
	return path.join(directory, `${slug}${fileExtension}`)
}

/**
 * Retrieves the creation date of a file
 * @throws {Error} if the file doesn't exist or can't be accessed
 */
export async function getFileCreationTime(filePath: string): Promise<Date> {
	try {
		const { birthtime } = await fse.stat(filePath)
		return birthtime
	} catch (error) {
		console.error('Error retrieving creation date:', error)
		throw error // Propagate the error to be handled by the caller
	}
}

/**
 * Copies the creation time from one file to another
 */
export async function cloneFileCreationTime(
	originalFile: string,
	targetFile: string,
): Promise<void> {
	// Await execa('touch', ['-r', originalFile, targetFile])

	// Also need to set creation time explicitly
	const { stdout: creationTimeEpoch } = await execa('stat', ['-f', '%B', originalFile])
	const { stdout: formattedTime } = await execa('date', ['-r', creationTimeEpoch, '+%Y%m%d%H%M.%S'])
	await execa('touch', ['-t', formattedTime, targetFile])

	// Set the modified time to now
	// await execa('touch', [targetFile])
}

/**
 * Gets a list of full paths to JSON files in a directory
 */
export function getJsonFilesInDirectory(directory: string): string[] {
	return fse
		.readdirSync(directory)
		.filter((file) => file.endsWith('json'))
		.map((file) => `${directory}/${file}`)
}

/**
 * Checks if two files have matching creation dates
 */
export async function creationDatesMatch(file1: string, file2: string): Promise<boolean> {
	const file1CreationDate = await getFileCreationTime(file1)
	const file2CreationDate = await getFileCreationTime(file2)

	// Sometimes a file's creation date is off by a few milliseconds?
	return String(file1CreationDate) === String(file2CreationDate)
}

/**
 * Verifies if all provided file paths exist
 * @throws {Error} If any file path doesn't exist
 */
export function assertPathsExist(...filePaths: string[]): void {
	for (const filePath of filePaths) {
		if (!fse.existsSync(filePath)) {
			throw new Error(`File not found: ${filePath}`)
		}
	}
}

/**
 * Ensures the directory for a given file path exists, creating it if necessary.
 * Expands '~' to the user's home directory.
 * @param filePath - The full file path for which to ensure the directory exists
 * @returns The fully expanded directory path which definitely exists
 */
export async function ensureDirectoryExists(filePath: string): Promise<string> {
	// Expand home directory for the entire file path
	const expandedDirectory = filePath.startsWith('~')
		? path.join(os.homedir(), filePath.slice(1))
		: filePath

	await fse.ensureDir(expandedDirectory)
	return expandedDirectory
}

/**
 * Creates a temporary directory with an optional custom prefix based on provided labels
 */
export async function getTempDirectory(...labels: string[]): Promise<string> {
	const prefix =
		labels.length > 0
			? `com.kitschpatrol.aphex.${labels.map((l) => l.toLowerCase()).join('.')}.`
			: 'com.kitschpatrol.aphex.'

	return fse.mkdtemp(path.join(os.tmpdir(), prefix))
}
