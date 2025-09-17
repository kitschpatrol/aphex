/* eslint-disable complexity */

import { deepEqual } from 'fast-equals'
import fse from 'fs-extra'
import path from 'node:path'
import type { AlbumInfo, PhotoInfo } from '../aphex-swift/cli-bridge'
import type { ExportOptions } from '../index'
import type { ImageTags } from '../utilities/image/tags'
import { resolveIdentifiers, resolvePhotoIdentifier } from '../aphex-swift/identifiers'
import { defaultExportOptions, defaultSyncOptions } from '../index'
import { mergeDefaults } from '../utilities/defu'
import { stripExtension } from '../utilities/file'
import { getTags } from '../utilities/image/tags'
import { getImagePathWithFileName } from './image-export'

// Diff strategy compares the matched file in the destination directory
// to the file under export consideration in Photos.app
// TODO more strategies...
// | 'modifiedTime' | 'visual'
export type DiffStrategy =
	| 'exif-tags'
	| 'export-options'
	| 'file-name'
	| 'force-update' // Special case
	| 'metadata-options'
	| 'photo-info'
	| 'process-options'

export type SyncOptions = {
	deleteOthers: boolean
	deleteTarget: boolean
	diffStrategies: DiffStrategy[]
	forceUpdate: boolean
}

export type SyncResult = {
	plan: Array<{
		diffedVia: DiffStrategy | undefined
		matchFilePath: string | undefined
		photoInfo: PhotoInfo
		status: 'changed' | 'new' | 'unchanged'
	}>
	toDelete: string[]
}

/**
 * Create a sync plan for a single photo
 */
export async function getSyncPlanForImage(
	identifier: PhotoInfo | string,
	destinationDirectory: string,
	options?: Partial<SyncOptions>,
	exportOptions?: Partial<ExportOptions>,
): Promise<SyncResult> {
	return getSyncPlanForImages(
		[await resolvePhotoIdentifier(identifier)],
		destinationDirectory,
		options,
		exportOptions,
	)
}

type DestinationFile = {
	filePath: string
	tags: ImageTags | undefined
}

// TODO theoretically limit to file name matches to do fewer tag lookups, but not really worth it...
async function getDestinationFiles(destinationDirectory: string): Promise<DestinationFile[]> {
	const entries = await fse.readdir(destinationDirectory, { withFileTypes: true })
	const files = entries.filter((entry) => entry.isFile())

	return Promise.all(
		files.map(async (file): Promise<DestinationFile> => {
			const filePath = path.join(destinationDirectory, file.name)
			return {
				filePath,
				tags: await getTags(filePath),
			}
		}),
	)
}

/**
 * Create a sync plan
 *
 * TODO how to handle non-image files?
 */
export async function getSyncPlanForImages(
	identifiers: Array<AlbumInfo | PhotoInfo | string>,
	destinationDirectory: string,
	options?: Partial<SyncOptions>,
	/** Need whole export options configuration for effective diffing */
	exportOptions?: Partial<ExportOptions>,
): Promise<SyncResult> {
	const resolvedOptions = options ? mergeDefaults(options, defaultSyncOptions) : defaultSyncOptions
	const resolvedExportOptions = exportOptions
		? mergeDefaults(exportOptions, defaultExportOptions)
		: defaultExportOptions

	const photoInfos = await resolveIdentifiers(identifiers)

	const syncResult: SyncResult = {
		plan: [],
		toDelete: [],
	}

	// Get files in the destination directory and their tag data...
	const destinationFiles = await getDestinationFiles(destinationDirectory)

	for (const sourcePhotoInfo of photoInfos) {
		const matchingDestinationFile = destinationFiles.find(
			(file) => file.tags?.aphexMetadata?.photoInfo.uuid === sourcePhotoInfo.uuid,
		)

		// No file name matches, return early
		// TODO more aggressive metadata UUID scraping strategy?
		if (matchingDestinationFile === undefined) {
			syncResult.plan.push({
				diffedVia: undefined,
				matchFilePath: undefined,
				photoInfo: sourcePhotoInfo,
				status: 'new',
			})
			continue
		}

		const sourcePhotoFileBaseName = stripExtension(
			getImagePathWithFileName(
				sourcePhotoInfo,
				'', // Skip full path
				resolvedExportOptions.exportOptions.fileNameSluggify,
				resolvedExportOptions.exportOptions.fileNameNormalizeExtensions,
				resolvedExportOptions.exportOptions.fileNamePrecedence,
			),
		)

		const differenceFound = await isDifferent(
			resolvedOptions.diffStrategies,
			sourcePhotoInfo,
			sourcePhotoFileBaseName,
			matchingDestinationFile.filePath,
			matchingDestinationFile.tags,
			resolvedExportOptions,
			resolvedOptions.forceUpdate,
		)

		if (differenceFound) {
			if (resolvedOptions.deleteTarget) {
				syncResult.toDelete.push(matchingDestinationFile.filePath)
			}
			syncResult.plan.push({
				diffedVia: differenceFound,
				matchFilePath: matchingDestinationFile.filePath,
				photoInfo: sourcePhotoInfo,
				status: 'changed',
			})
			continue
		}

		syncResult.plan.push({
			diffedVia: undefined,
			matchFilePath: matchingDestinationFile.filePath,
			photoInfo: sourcePhotoInfo,
			status: 'unchanged',
		})
	}

	// Figure out deletion
	if (resolvedOptions.deleteOthers) {
		syncResult.toDelete = [
			...syncResult.toDelete,
			...destinationFiles
				.filter((file) => !syncResult.plan.some((plan) => plan.matchFilePath === file.filePath))
				.map((file) => file.filePath),
		]
	}

	// Ensure toDelete is unique
	syncResult.toDelete = [...new Set(syncResult.toDelete)]

	return syncResult
}

/**
 * See if there's a difference between the source image and the target image
 * @returns Undefined if the, or the reason for the difference if found
 */
async function isDifferent(
	diffStrategies: DiffStrategy[],
	sourcePhotoInfo: PhotoInfo,
	sourcePhotoFileBaseName: string,
	matchPhotoFilePath: string,
	matchPhotoTags: ImageTags | undefined,
	exportOptions: ExportOptions,
	forceUpdate: boolean,
): Promise<DiffStrategy | false> {
	// Soft memoization...
	let sourceTags: ImageTags | undefined

	if (forceUpdate) {
		return 'force-update'
	}

	for (const diffStrategy of diffStrategies) {
		switch (diffStrategy) {
			case 'exif-tags': {
				sourceTags ??= await getTags(sourcePhotoInfo.original.filePath)

				if (
					matchPhotoTags === undefined ||
					sourceTags.credit !== matchPhotoTags.credit ||
					sourceTags.creator !== matchPhotoTags.creator ||
					sourceTags.preservedFileName !== matchPhotoTags.preservedFileName ||
					sourceTags.label !== matchPhotoTags.label
				) {
					return diffStrategy
				}

				break
			}

			case 'export-options': {
				if (
					matchPhotoTags === undefined ||
					!deepEqual(
						exportOptions.exportOptions,
						matchPhotoTags.aphexMetadata?.exportOptions.exportOptions,
					)
				) {
					return diffStrategy
				}
				break
			}

			case 'file-name': {
				// Ignore extension because it's too much work to figure out the final file extension
				// But this can still change if the "title" changes in a source photo...
				if (stripExtension(path.basename(matchPhotoFilePath)) !== sourcePhotoFileBaseName) {
					return diffStrategy
				}
				break
			}

			case 'force-update': {
				// Special case... normally handled by flag instead
				return diffStrategy
			}

			case 'metadata-options': {
				sourceTags ??= await getTags(sourcePhotoInfo.original.filePath)
				if (
					matchPhotoTags === undefined ||
					!deepEqual(
						exportOptions.metadataOptions,
						matchPhotoTags.aphexMetadata?.exportOptions.metadataOptions,
					)
				) {
					return diffStrategy
				}
				break
			}

			case 'photo-info': {
				if (
					matchPhotoTags === undefined ||
					!deepEqual(sourcePhotoInfo, matchPhotoTags.aphexMetadata?.photoInfo)
				) {
					return diffStrategy
				}
				break
			}

			case 'process-options': {
				// We skip sync options since they shouldn't affect the exported image!
				if (
					matchPhotoTags === undefined ||
					!deepEqual(
						exportOptions.processOptions,
						matchPhotoTags.aphexMetadata?.exportOptions.processOptions,
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
