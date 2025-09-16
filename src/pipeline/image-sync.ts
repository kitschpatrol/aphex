/* eslint-disable complexity */

import { deepEqual } from 'fast-equals'
import fse from 'fs-extra'
import path from 'node:path'
import type { ExportOptions } from '../index'
import type { PhotoInfo } from '../utilities/image/aphex-swift-bridge'
import type { ImageTags } from '../utilities/image/tags'
import { defaultExportOptions, defaultSyncOptions } from '../index'
import { mergeDefaults } from '../utilities/defu'
import { stripExtension } from '../utilities/file'
import { getTags } from '../utilities/image/tags'
import { getImagePathWithFileName, resolvePhotoIdentifier } from './image-export'

// Match strategy finds the existing target file to perform the diff on
// fro the files in the destination directory
// TODO actually implement, currently only file-name
export type MatchStrategy = 'file-name' | 'uuid'

// Diff strategy compares the matched file in the destination directory
// to the file under export consideration in Photos.app
// TODO more strategies...
// | 'modifiedTime' | 'visual'
export type DiffStrategy =
	| 'exif-tags'
	| 'export-options'
	| 'file-name'
	| 'metadata-options'
	| 'photo-info'
	| 'process-options'

export type SyncOptions = {
	deleteOthers: boolean
	deleteTarget: boolean
	diffStrategies: DiffStrategy[]
	forceUpdate: boolean
	matchStrategies: MatchStrategy[]
}

export type SyncResult = {
	// TODO implement
	diffedVia: DiffStrategy | undefined
	matchedVia: MatchStrategy | undefined
	toDelete: string[]
	toKeep: string[]
	toWrite: PhotoInfo[]
}

/**
 * Create a sync plan
 */
export async function getSyncPlanForImage(
	identifier: PhotoInfo | string,
	destinationDirectory: string,
	options?: Partial<SyncOptions>,
	/** Need whole export options configuration for effective diffing */
	exportOptions?: Partial<ExportOptions>,
): Promise<SyncResult> {
	const resolvedOptions = options ? mergeDefaults(options, defaultSyncOptions) : defaultSyncOptions
	const resolvedExportOptions = exportOptions
		? mergeDefaults(exportOptions, defaultExportOptions)
		: defaultExportOptions

	const syncResult: SyncResult = {
		diffedVia: undefined,
		matchedVia: undefined,
		toDelete: [],
		toKeep: [],
		toWrite: [],
	}

	// Figure out final name of current file
	const sourcePhotoInfo = await resolvePhotoIdentifier(identifier)
	const sourcePhotoFileName = getImagePathWithFileName(
		sourcePhotoInfo,
		'', // Skip full path
		resolvedExportOptions.exportOptions.fileNameSluggify,
		resolvedExportOptions.exportOptions.fileNameNormalizeExtensions,
		resolvedExportOptions.exportOptions.fileNamePrecedence,
	)

	// Compare to files in the destination directory...
	const destinationFiles = await fse.readdir(destinationDirectory, { withFileTypes: true })
	const destinationFilePaths = destinationFiles
		.filter((file) => file.isFile())
		.map((file) => path.join(file.parentPath, file.name))

	const matchResult = await findTarget(
		resolvedOptions.matchStrategies,
		sourcePhotoInfo,
		sourcePhotoFileName,
		destinationFilePaths,
	)

	if (resolvedOptions.deleteOthers) {
		syncResult.toDelete = matchResult
			? destinationFilePaths.filter((file) => file !== matchResult.targetPhotoFilePath)
			: destinationFilePaths
	}

	// No file name matches, return early
	// TODO more aggressive metadata UUID scraping strategy?
	if (matchResult === undefined) {
		syncResult.toWrite.push(sourcePhotoInfo)
		return syncResult
	}

	const { matchStrategy, targetPhotoFilePath } = matchResult
	syncResult.matchedVia = matchStrategy

	console.log(resolvedOptions.diffStrategies)
	const differenceFound = await isDifferent(
		resolvedOptions.diffStrategies,
		sourcePhotoInfo,
		resolvedExportOptions,
		sourcePhotoFileName,
		targetPhotoFilePath,
	)

	if (differenceFound) {
		syncResult.toWrite.push(sourcePhotoInfo)
		syncResult.toDelete.push(targetPhotoFilePath)
		syncResult.diffedVia = differenceFound
	} else {
		syncResult.toKeep.push(targetPhotoFilePath)
	}

	return syncResult
}

async function findTarget(
	matchStrategies: MatchStrategy[],
	sourcePhotoInfo: PhotoInfo,
	sourcePhotoFileName: string,
	targetDirectoryFiles: string[],
): Promise<
	| undefined
	| {
			matchStrategy: MatchStrategy
			targetPhotoFilePath: string
	  }
> {
	for (const matchStrategy of matchStrategies) {
		switch (matchStrategy) {
			case 'file-name': {
				const sourcePhotoBaseName = stripExtension(sourcePhotoFileName)
				const targetPhotoFilePath = targetDirectoryFiles.find(
					(file) => stripExtension(path.basename(file)) === sourcePhotoBaseName,
				)

				if (targetPhotoFilePath !== undefined) {
					return {
						matchStrategy,
						targetPhotoFilePath,
					}
				}

				break
			}
			case 'uuid': {
				// Probably slow...
				for (const targetPhotoFilePath of targetDirectoryFiles) {
					const { aphexMetadata } = await getTags(targetPhotoFilePath)

					if (aphexMetadata?.photoInfo.uuid === sourcePhotoInfo.uuid) {
						return {
							matchStrategy,
							targetPhotoFilePath,
						}
					}
				}

				break
			}
		}
	}

	return undefined
}

/**
 * See if there's a difference between the source image and the target image
 * @returns Undefined if the, or the reason for the difference if found
 */
async function isDifferent(
	diffStrategies: DiffStrategy[],
	sourcePhotoInfo: PhotoInfo,
	exportOptions: ExportOptions,
	sourcePhotoFileName: string,
	targetPhotoFilePath: string,
): Promise<DiffStrategy | false> {
	// Soft memoization...
	let sourceTags: ImageTags | undefined
	let targetTags: ImageTags | undefined

	for (const diffStrategy of diffStrategies) {
		switch (diffStrategy) {
			case 'exif-tags': {
				targetTags ??= await getTags(targetPhotoFilePath)
				sourceTags ??= await getTags(sourcePhotoInfo.original.filePath)

				if (
					sourceTags.credit !== targetTags.credit ||
					sourceTags.creator !== targetTags.creator ||
					sourceTags.preservedFileName !== targetTags.preservedFileName ||
					sourceTags.label !== targetTags.label
				) {
					return diffStrategy
				}

				break
			}

			case 'export-options': {
				targetTags ??= await getTags(targetPhotoFilePath)
				if (
					!deepEqual(
						exportOptions.exportOptions,
						targetTags.aphexMetadata?.exportOptions.exportOptions,
					)
				) {
					return diffStrategy
				}
				break
			}

			case 'file-name': {
				// Ignore extension because it's too much work to figure out the final file extension
				// after processing. This means that until there are
				if (stripExtension(path.basename(targetPhotoFilePath)) !== sourcePhotoFileName) {
					return diffStrategy
				}
				break
			}

			case 'metadata-options': {
				targetTags ??= await getTags(targetPhotoFilePath)
				if (
					!deepEqual(
						exportOptions.processOptions,
						targetTags.aphexMetadata?.exportOptions.processOptions,
					)
				) {
					return diffStrategy
				}
				break
			}

			case 'photo-info': {
				targetTags ??= await getTags(targetPhotoFilePath)
				if (!deepEqual(sourcePhotoInfo, targetTags.aphexMetadata?.photoInfo)) {
					return diffStrategy
				}
				break
			}

			case 'process-options': {
				targetTags ??= await getTags(targetPhotoFilePath)
				// We skip sync options since they shouldn't affect the exported image!
				if (
					!deepEqual(
						exportOptions.processOptions,
						targetTags.aphexMetadata?.exportOptions.processOptions,
					)
				) {
					return diffStrategy
				}
				break
			}
		}
	}

	return false
}
