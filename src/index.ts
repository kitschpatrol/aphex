import type { OmitDeep, Simplify } from 'type-fest'
import defu from 'defu'
import fse from 'fs-extra'
import type { ExportApplePhotoOptions, ExportApplePhotoResult } from './pipeline/image-export'
import type { ManageMetadataOptions, ManageMetadataResult } from './pipeline/image-metadata'
import type { ProcessImageOptions, ProcessImageResult } from './pipeline/image-process'
import type { PhotoInfo } from './utilities/image/aphex-swift-bridge'
import { defaultExportApplePhotoOptions, exportApplePhoto } from './pipeline/image-export'
import { defaultManageMetadataOptions, manageMetadata } from './pipeline/image-metadata'
import { defaultProcessImageOptions, processPhotos } from './pipeline/image-process'
import { ensureDirectoryExists, getTempDirectory } from './utilities/file'
import { assertSingleElement } from './utilities/general'

type SyncOptions = {
	deleteOthers: boolean
}

const defaultSyncOptions: ExportOptions['syncOptions'] = 'disabled'

type ExportOptions = {
	exportOptions: ExportApplePhotoOptions
	metadataOptions: 'disabled' | ManageMetadataOptions
	processOptions: 'disabled' | ProcessImageOptions
	syncOptions: 'disabled' | SyncOptions
}

const defaultExportOptions: ExportOptions = {
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
	// SyncResult: 'todo',
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
	const resolvedOptions: ExportOptions = defu(options, defaultExportOptions)
	const { exportOptions, metadataOptions, processOptions, syncOptions } = resolvedOptions

	const resolvedDestinationDirectory = await ensureDirectoryExists(destinationDirectory)

	if (syncOptions !== 'disabled') {
		console.log('Sync not implemented')
	}

	const exportDirectory =
		processOptions === 'disabled'
			? resolvedDestinationDirectory
			: await getTempDirectory('export-photo')
	const exportResult = await exportApplePhoto(identifier, exportDirectory, exportOptions)

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
