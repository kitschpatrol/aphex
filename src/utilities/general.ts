import type { Result } from 'execa'
import is from '@sindresorhus/is'
import { execa } from 'execa'
import fse from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import prettier from 'prettier'
import { getSlugFilename } from './file'

/**
 * Use prettier to format a JSON object into a string according to the package's configuration
 */
export async function formatJson(json: Record<string, unknown>): Promise<string> {
	const prettierConfig = await prettier.resolveConfig(process.cwd())

	// Disable plugins since we're just formatting JSON,
	// and tailwind plugin seems to crash at the moment...
	if (prettierConfig) {
		prettierConfig.plugins = []
	}

	return prettier.format(JSON.stringify(json), { ...prettierConfig, parser: 'json' })
}

/**
 * Escape special characters in a string to be used in a regular expression
 * TODO is there a built-in function for this?
 */
export function escapeRegExp(string: string): string {
	return string.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
}

/**
 * Recursively sorts the keys of an object or array.
 */
export function sortKeys(object: unknown): unknown {
	if (is.array(object)) {
		return object.map((element) => sortKeys(element))
	}

	if (is.plainObject(object)) {
		const sortedEntries = Object.keys(object)
			.sort((a, b) => a.localeCompare(b))
			.map((key) => [key, sortKeys(object[key])])
		return Object.fromEntries(sortedEntries)
	}

	return object
}

/**
 * True if the arrays have at least one element in common
 */
export function arraysIntersect<T>(a: T[], b: T[]): boolean {
	return a.some((item) => b.includes(item))
}

/**
 * Pause execution
 */
export async function sleep(ms: number) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms)
	})
}

/**
 * True if we have access to the binary
 */
export async function isBinaryOnPath(binaryName: string): Promise<boolean> {
	try {
		await execa('which', [binaryName])
		return true // Binary exists
	} catch {
		return false // Binary does not exist
	}
}

/**
 * Adjusts the given source dimensions to fit within the specified maximum width and height while preserving the aspect ratio.
 *
 * If the source dimensions are already within the maximum bounds, the original dimensions are returned.
 * Otherwise, the function calculates the new dimensions by comparing the aspect ratios of the source and target areas,
 * ensuring the result fits inside the maximum dimensions provided.
 * @param sourceWidth - The original width of the source.
 * @param sourceHeight - The original height of the source.
 * @param maxWidth - The maximum allowable width.
 * @param maxHeight - The maximum allowable height.
 * @returns An object containing the width and height that the source is scaled to.
 */
export function fitInside(
	sourceWidth: number,
	sourceHeight: number,
	maxWidth: number,
	maxHeight: number,
): { height: number; width: number } {
	if (sourceWidth <= maxWidth && sourceHeight <= maxHeight) {
		return {
			width: sourceWidth,
			height: sourceHeight,
		}
	}

	const aspectRatio = sourceWidth / sourceHeight
	const targetAspectRatio = maxWidth / maxHeight

	if (aspectRatio > targetAspectRatio) {
		return {
			width: maxWidth,
			height: Math.round(maxWidth / aspectRatio),
		}
	}

	return {
		width: Math.round(maxHeight * aspectRatio),
		height: maxHeight,
	}
}

/**
 * DOES NOT work for sips, sips does not respect this TMPDIR
 */
export async function execaWithTempCleanup(
	file: string | URL,
	args?: readonly string[],
): Promise<Result<Record<string, unknown>>> {
	const fileName = typeof file === 'string' ? file : path.basename(file.pathname)

	const tempDirectory = await fse.mkdtemp(
		path.join(os.tmpdir(), `com.ericmika.execa.${getSlugFilename(fileName)}.`),
	)

	const result = await execa(file, args, {
		// eslint-disable-next-line ts/naming-convention
		env: { TMPDIR: tempDirectory },
	})

	await fse.rm(tempDirectory, { force: true, recursive: true })

	return result
}

/**
 * Sips makes a mess of the temp folder and does not respect TMPDIR,
 * so we need to clean up after it ourselves
 */
export async function sipsTempCleanup(): Promise<number> {
	const tempFiles = fse.readdirSync(os.tmpdir())

	const uuidRegex = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
	const uuidFiles = tempFiles.filter((file) => uuidRegex.test(file))

	let cleanCount = 0
	for (const file of uuidFiles) {
		const filePath = path.join(os.tmpdir(), file)
		const { stdout } = await execa('file', ['-b', '--mime', filePath])
		if (stdout.startsWith('image/')) {
			await fse.rm(filePath, { force: true })
			cleanCount += 1
		}
	}

	return cleanCount
}
