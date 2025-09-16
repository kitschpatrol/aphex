import type { OmitDeep, Simplify } from 'type-fest'
import fse from 'fs-extra'
import type { ExportApplePhotoOptions, ExportApplePhotoResult } from './pipeline/image-export'
import type { ManageMetadataOptions, ManageMetadataResult } from './pipeline/image-metadata'
import type { ProcessImageOptions, ProcessImageResult } from './pipeline/image-process'
import type { SyncOptions, SyncResult } from './pipeline/image-sync'
import type { PhotoInfo } from './utilities/image/aphex-swift-bridge'
import {
	defaultExportApplePhotoOptions,
	exportApplePhoto,
	resolvePhotoIdentifier,
} from './pipeline/image-export'
import { defaultManageMetadataOptions, manageMetadata } from './pipeline/image-metadata'
import { defaultProcessImageOptions, processPhotos } from './pipeline/image-process'
import { getSyncPlanForImage } from './pipeline/image-sync'
import { mergeDefaults } from './utilities/defu'
import { ensureDirectoryExists, getTempDirectory } from './utilities/file'
import { assertSingleElement } from './utilities/general'

export type ExportOptions = {
	exportOptions: ExportApplePhotoOptions
	metadataOptions: 'disabled' | ManageMetadataOptions
	processOptions: 'disabled' | ProcessImageOptions
	syncOptions: 'disabled' | SyncOptions
}

// Needs to be here to avoid circular import
export const defaultSyncOptions: SyncOptions = {
	deleteOthers: false,
	deleteTarget: true,
	diffStrategies: [
		'file-name',
		'photo-info',
		'export-options',
		'process-options',
		'metadata-options',
		'exif-tags',
	],
	forceUpdate: false,
	matchStrategies: ['file-name'],
}

export const defaultExportOptions: ExportOptions = {
	exportOptions: defaultExportApplePhotoOptions,
	metadataOptions: defaultManageMetadataOptions,
	processOptions: defaultProcessImageOptions,
	syncOptions: defaultSyncOptions,
}

/** Some fields omitted for relevance...  */
type ExportResults = {
	exportResult: Simplify<Omit<ExportApplePhotoResult, 'exportOptions' | 'path'>>
	metadataResult: ManageMetadataResult | undefined
	processResult:
		| Simplify<OmitDeep<ProcessImageResult, 'input.path' | 'output.path' | 'path'>>
		| undefined
	syncResult: SyncResult | undefined
}

type ExportResult = {
	options: ExportOptions
	path: string
	results: ExportResults
}

/**
 * Export...
 */
export async function exportPhoto(
	identifier: PhotoInfo | string,
	destinationDirectory: string,
	options?: Partial<ExportOptions>,
): Promise<ExportResult> {
	const resolvedOptions: ExportOptions = options
		? mergeDefaults(options, defaultExportOptions)
		: defaultExportOptions
	const { exportOptions, metadataOptions, processOptions, syncOptions } = resolvedOptions
	const resolvedDestinationDirectory = await ensureDirectoryExists(destinationDirectory)
	const photoInfo = await resolvePhotoIdentifier(identifier)

	// Syncing
	let syncResult: SyncResult | undefined
	if (syncOptions !== 'disabled') {
		syncResult = await getSyncPlanForImage(
			photoInfo,
			resolvedDestinationDirectory,
			syncOptions,
			resolvedOptions,
		)

		// Execute sync plan...
		await Promise.all(syncResult.toDelete.map(async (file) => fse.rm(file, { force: true })))

		// Early exit if we're skipping
		if (syncResult.toWrite.length === 0) {
			assertSingleElement(syncResult.toKeep)
			const skipExportReport: ExportResult = {
				options: resolvedOptions,
				path: syncResult.toKeep[0],
				results: {
					exportResult: {
						exportEngine: 'skipped',
						photoInfo,
					},
					metadataResult: undefined,
					processResult: undefined,
					syncResult,
				},
			}

			return skipExportReport
		}
	}

	// Exporting from Photos.app
	const exportDirectory =
		processOptions === 'disabled'
			? resolvedDestinationDirectory
			: await getTempDirectory('export-photo')
	const exportResult = await exportApplePhoto(photoInfo, exportDirectory, exportOptions)

	// Processing
	let processResult: ProcessImageResult | undefined
	if (processOptions !== 'disabled') {
		const processResults = await processPhotos(
			[exportResult.path],
			destinationDirectory,
			processOptions,
		)
		assertSingleElement(processResults)
		processResult = processResults[0]

		// Clean up temp export directory
		console.log(`Cleaning up: ${exportDirectory}`)
		await fse.rm(exportDirectory, { force: true, recursive: true })
	}

	const finalImagePath = processResult?.path ?? exportResult.path

	// Metadata
	let metadataResult: ManageMetadataResult | undefined
	if (metadataOptions !== 'disabled') {
		metadataResult = await manageMetadata(
			exportResult.photoInfo,
			finalImagePath,
			metadataOptions,
			resolvedOptions,
		)
	}

	const exportReport: ExportResult = {
		options: resolvedOptions,
		path: finalImagePath,
		results: {
			exportResult: cleanExportResults(exportResult),
			metadataResult,
			processResult: cleanProcessResults(processResult),
			syncResult,
		},
	}

	return exportReport
}

function cleanExportResults(result: ExportApplePhotoResult): ExportResults['exportResult'] {
	return {
		exportEngine: result.exportEngine,
		photoInfo: result.photoInfo,
	}
}

function cleanProcessResults(
	result: ProcessImageResult | undefined,
): ExportResults['processResult'] {
	if (result === undefined) {
		return undefined
	}

	const { input, output, path, ...rest } = result
	const { path: inputPath, ...strippedInput } = input
	const { path: outputPath, ...strippedOutput } = output

	return {
		...rest,
		input: strippedInput,
		output: strippedOutput,
	}
}
