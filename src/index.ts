import type { OmitDeep, Simplify } from 'type-fest'
import fse from 'fs-extra'
import path from 'node:path'
import type { AlbumInfo, PhotoInfo } from './aphex-swift/cli-bridge'
import type { ExportApplePhotoOptions, ExportApplePhotoResult } from './pipeline/image-export'
import type { ManageMetadataOptions, ManageMetadataResult } from './pipeline/image-metadata'
import type { ProcessImageOptions, ProcessImageResult } from './pipeline/image-process'
import type { SyncOptions, SyncResult } from './pipeline/image-sync'
import { resolveIdentifiers, resolvePhotoIdentifier } from './aphex-swift/identifiers'
import { defaultExportApplePhotoOptions, exportApplePhotos } from './pipeline/image-export'
import { defaultManageMetadataOptions, manageMetadataBatch } from './pipeline/image-metadata'
import { defaultProcessImageOptions, processPhotos } from './pipeline/image-process'
import { getSyncPlanForImages } from './pipeline/image-sync'
import { mergeDefaults } from './utilities/defaults'
import { ensureDirectoryExists, getTempDirectory, stripExtension } from './utilities/file'
import { assertSingleElement } from './utilities/general'

export {
	aphexAlbumInfo as getAlbumInfo,
	aphexPhotoInfo as getPhotoInfo,
} from './aphex-swift/cli-bridge'

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
}

export const defaultExportOptions: ExportOptions = {
	exportOptions: defaultExportApplePhotoOptions,
	metadataOptions: defaultManageMetadataOptions,
	processOptions: defaultProcessImageOptions,
	syncOptions: defaultSyncOptions,
}

/** Some fields omitted for relevance...  */

type ExportResults = {
	exportResult:
		| Simplify<Omit<ExportApplePhotoResult, 'exportOptions' | 'path' | 'photoInfo'>>
		| undefined
	metadataResult: Simplify<Omit<ManageMetadataResult, 'photoInfo'>> | undefined
	processResult:
		| Simplify<OmitDeep<ProcessImageResult, 'input.path' | 'output.path' | 'path'>>
		| undefined
	syncResult: Simplify<Omit<SyncResult['plan'][number], 'photoInfo'>> | undefined
}

type ExportResult = {
	options: ExportOptions
	path: string
	photoInfo: PhotoInfo
	results: ExportResults
}

/**
 * Export a single photo
 */
export async function exportPhoto(
	identifier: PhotoInfo | string,
	destinationDirectory: string,
	options?: Partial<ExportOptions>,
): Promise<ExportResult> {
	const photoInfo = await resolvePhotoIdentifier(identifier)

	const result = await exportPhotos([photoInfo], destinationDirectory, options)
	assertSingleElement(result)
	return result[0]
}

/**
 * Export photos
 */
export async function exportPhotos(
	identifiers: Array<AlbumInfo | PhotoInfo | string>,
	destinationDirectory: string,
	options?: Partial<ExportOptions>,
): Promise<ExportResult[]> {
	const resolvedOptions: ExportOptions = options
		? mergeDefaults(options, defaultExportOptions)
		: defaultExportOptions
	const { exportOptions, metadataOptions, processOptions, syncOptions } = resolvedOptions
	const resolvedDestinationDirectory = await ensureDirectoryExists(destinationDirectory)
	const photoInfos = await resolveIdentifiers(identifiers)

	// ------------------------------------------------------------

	// Syncing
	let syncResult: SyncResult | undefined
	if (syncOptions !== 'disabled') {
		syncResult = await getSyncPlanForImages(
			photoInfos,
			resolvedDestinationDirectory,
			syncOptions,
			resolvedOptions,
		)

		// Execute sync deletions...
		await Promise.all(syncResult.toDelete.map(async (file) => fse.rm(file, { force: true })))

		// Sanity check
		if (syncResult.plan.length !== photoInfos.length) {
			throw new Error('Sync plan length does not match photos length')
		}
	}

	// Prep export results and reconcile sync results if applicable
	const exportResults: ExportResult[] = photoInfos.map((photoInfo, index) => {
		const syncPlan = syncResult?.plan[index]
		const exportResult: ExportResult = {
			options: resolvedOptions,
			path: syncPlan?.status === 'unchanged' ? (syncPlan.matchFilePath ?? '') : '', // May be set later
			photoInfo,
			results: {
				exportResult: undefined, // May be set later
				metadataResult: undefined, // May be set later
				processResult: undefined, // May be set later
				syncResult: syncPlan ? cleanSyncResult(syncPlan) : undefined,
			},
		}

		return exportResult
	})

	// Early exit if everything is unchanged
	if (
		exportResults.every((exportResult) => exportResult.results.syncResult?.status === 'unchanged')
	) {
		return exportResults
	}

	// TODO what about name collisions?

	// ------------------------------------------------------------

	// Exporting from Photos.app
	const exportDirectory =
		processOptions === 'disabled'
			? resolvedDestinationDirectory
			: await getTempDirectory('export-photo')

	const applePhotosExportResults = await exportApplePhotos(
		// Get subset of photos we're actually working with based on sync results
		exportResults
			.filter((exportResult) => exportResult.results.syncResult?.status !== 'unchanged')
			.map((exportResult) => exportResult.photoInfo),
		exportDirectory,
		exportOptions,
	)

	// Update export results with the exported paths
	for (const exportResult of exportResults) {
		const matchingExportResult = applePhotosExportResults.find(
			(photoExportResult) => photoExportResult.photoInfo.uuid === exportResult.photoInfo.uuid,
		)

		if (matchingExportResult) {
			exportResult.path = matchingExportResult.path
			exportResult.results.exportResult = cleanExportResults(matchingExportResult)
		}
	}

	// ------------------------------------------------------------

	// Processing
	let processResults: ProcessImageResult[] | undefined
	if (processOptions !== 'disabled') {
		processResults = await processPhotos(
			exportResults
				.filter((exportResult) => exportResult.results.syncResult?.status !== 'unchanged')
				.map((exportResult) => exportResult.path),
			destinationDirectory,
			processOptions,
		)

		// Clean up temp export directory
		await fse.rm(exportDirectory, { force: true, recursive: true })

		// Update export results with the processed paths
		for (const exportResult of exportResults) {
			const matchingProcessResult = processResults.find(
				(processResult) =>
					stripExtension(path.basename(processResult.path)) ===
					stripExtension(path.basename(exportResult.path)),
			)

			if (matchingProcessResult) {
				exportResult.path = matchingProcessResult.path
				exportResult.results.processResult = cleanProcessResults(matchingProcessResult)
			}
		}
	}

	// ------------------------------------------------------------

	// Metadata
	let metadataResults: ManageMetadataResult[] | undefined

	if (metadataOptions !== 'disabled') {
		const targetPhotos = exportResults.filter(
			(exportResult) => exportResult.results.syncResult?.status !== 'unchanged',
		)

		metadataResults = await manageMetadataBatch(
			targetPhotos.map((exportResult) => exportResult.photoInfo),
			targetPhotos.map((exportResult) => exportResult.path),
			metadataOptions,
			resolvedOptions,
		)

		// Update export results with the exported paths
		for (const exportResult of exportResults) {
			const matchingMetadataResult = metadataResults.find(
				(photoExportResult) => photoExportResult.photoInfo.uuid === exportResult.photoInfo.uuid,
			)

			if (matchingMetadataResult) {
				exportResult.results.metadataResult = cleanMetadataResults(matchingMetadataResult)
			}
		}
	}

	// ------------------------------------------------------------

	return exportResults
}

function cleanExportResults(result: ExportApplePhotoResult): ExportResults['exportResult'] {
	return {
		exportEngine: result.exportEngine,
	}
}

function cleanMetadataResults(result: ManageMetadataResult): ExportResults['metadataResult'] {
	const { photoInfo, ...rest } = result

	return {
		...rest,
	}
}

function cleanSyncResult(result: SyncResult['plan'][number]): ExportResults['syncResult'] {
	const { photoInfo, ...rest } = result
	return { ...rest }
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
