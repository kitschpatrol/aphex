#!/usr/bin/env -S pnpm tsx

import { globby } from 'globby'
import fs from 'node:fs/promises'
import { stripExtension } from '../src/utilities/file'
import { escapeRegExp } from '../src/utilities/general'
import { lookupImageMimeType } from '../src/utilities/image/mime'

/**
 * Keeps Markdown files in sync with anu changes to image file extensions across
 * exports.
 *
 * Updates the extensions of image paths in text files based on the provided
 * glob patterns.
 *
 * @param imageGlobs - An array of glob patterns to match image files.
 * @param fileGlobs - An array of glob patterns to match text files.
 *
 * @returns A promise that resolves to an array of file paths that were updated.
 *
 *   This function performs the following steps:
 *
 *   1. Uses the `globby` library to find image paths and text file paths based on
 *        the provided glob patterns.
 *   2. Filters the image paths to include only those with a valid MIME type and maps
 *        them to new paths.
 *   3. Creates an array of regular expressions to match the image paths in the text
 *        files.
 *   4. Reads each text file and replaces occurrences of the old image paths with the
 *        new paths.
 *   5. Writes the updated content back to the text files if any replacements were
 *        made.
 *   6. Returns an array of file paths that were updated.
 */
async function updateImageExtensions(imageGlobs: string[], fileGlobs: string[]): Promise<string[]> {
	const imagePaths = await globby(imageGlobs)

	const textFilePaths = await globby(fileGlobs)

	const newImagePaths = imagePaths
		.filter((filePath) => lookupImageMimeType(filePath) !== undefined)
		.map((filePath) => filePath.replace('../src/assets/', ''))

	const imagePathRegexArray = newImagePaths.map((filePath) => {
		const rawFileName = stripExtension(filePath)
		return new RegExp(String.raw`${escapeRegExp(rawFileName)}\.\w{3,4}`, 'gv')
	})

	const updatedFiles: string[] = []

	for (const textFilePath of textFilePaths) {
		const originalText = await fs.readFile(textFilePath, 'utf8')
		let text: string = originalText

		for (const imageRegex of imagePathRegexArray) {
			text = text.replace(imageRegex, (match) => {
				const rawMatch = `${stripExtension(match)}.`
				const newPath = newImagePaths.find((filePath) => filePath.includes(rawMatch))

				if (newPath === undefined) {
					console.warn(`No new path found for ${match}`)
					console.warn(`\tFrom raw match: ${rawMatch}`)
					console.warn(`\tFrom raw regex: ${imageRegex}`)
					return match
				}

				return newPath
			})
		}

		if (text !== originalText) {
			updatedFiles.push(textFilePath)
			await fs.writeFile(textFilePath, text)
		}
	}

	return updatedFiles
}

async function main() {
	const updated = await updateImageExtensions(
		['../src/assets/**/album/**/*', '!../src/assets/**/.*'],
		[
			'../src/**/*.ts',
			'../src/**/*.astro',
			'../src/**/*.md',
			'../src/**/*.mdx',
			'../src/**/*.json',
			'../src/**/*.js',
		],
	)

	console.log(`Updated image extensions in ${updated.length} files:`)
	for (const file of updated) {
		console.log(file)
	}
}

await main()
