import { assert } from '@sindresorhus/is'
import { defu } from 'defu'
import { execa } from 'execa'
import fse from 'fs-extra'
import path from 'node:path'

export type ExportOptions = {
	original?: boolean
}

const defaultExportOptions: Required<ExportOptions> = {
	original: false,
}

/**
 * Export a photo by copying it directly from the Photos.app library file system to the destination directory.
 */
export async function exportViaFileSystem(
	photoUuid: string,
	destinationDirectory: string,
	options?: ExportOptions,
): Promise<string> {
	const { original } = defu(options, defaultExportOptions)

	await fse.mkdir(destinationDirectory, { recursive: true })

	const { stdout: json } = await execa('osxphotos', [
		'query',
		'--only-photos',
		'--uuid',
		photoUuid,
		'--json',
	])

	const jsonOutput: unknown = JSON.parse(json)
	assert.array(jsonOutput)

	const photoInfo = jsonOutput[0]
	assert.plainObject(photoInfo)

	// Fall back to original path if edited path is not available
	const filePath = original ? photoInfo.path : (photoInfo.path_edited ?? photoInfo.path)
	assert.string(filePath)

	const destinationPath = path.join(destinationDirectory, `${photoUuid}${path.extname(filePath)}`)
	await fse.copyFile(filePath, destinationPath)
	return destinationPath
}
