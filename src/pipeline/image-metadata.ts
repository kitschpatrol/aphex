import type { ExportOptions } from '..'
import type { PhotoInfo } from '../aphex-swift/cli-bridge'
import type { AphexMetadata, ImageTags, ValidateTagsResult } from '../utilities/image/tags'
import { resolveIdentifiers, resolvePhotoIdentifier } from '../aphex-swift/identifiers'
import { mergeDefaults } from '../utilities/defu'
import { cloneTags, setTags, validateTags } from '../utilities/image/tags'

export type ManageMetadataOptions = {
	syncToEdited: boolean
	syncToTarget: boolean
	tagsToSync: Array<keyof ImageTags>
	validate: boolean
	writeAphexMetadata: boolean
}

export const defaultManageMetadataOptions: ManageMetadataOptions = {
	syncToEdited: true,
	syncToTarget: true,
	tagsToSync: ['label', 'preservedFileName', 'creator', 'credit'],
	validate: true,
	writeAphexMetadata: true,
}

export type ManageMetadataResult = {
	photoInfo: PhotoInfo
	tagsToEdited: Array<keyof ImageTags> | undefined
	tagsToTarget: Array<keyof ImageTags> | undefined
	validationResult: undefined | ValidateTagsResult
}

/**
 * Manage metadata for a batch of photos
 */
export async function manageMetadataBatch(
	identifiers: Array<PhotoInfo | string>,
	targetFilePaths: string[],
	options?: Partial<ManageMetadataOptions>,
	exportOptions?: ExportOptions,
): Promise<ManageMetadataResult[]> {
	const photoInfos = await resolveIdentifiers(identifiers)

	if (photoInfos.length !== targetFilePaths.length) {
		throw new Error('Photo infos and target files length mismatch')
	}

	return Promise.all(
		photoInfos.map(async (photoInfo, index) =>
			manageMetadata(photoInfo, targetFilePaths[index], options, exportOptions),
		),
	)
}

/**
 * Manage metadata...
 */
export async function manageMetadata(
	identifier: PhotoInfo | string,
	targetFilePath: string,
	options?: Partial<ManageMetadataOptions>,
	/** For Aphex Metadata object */
	exportOptions?: ExportOptions,
): Promise<ManageMetadataResult> {
	const resolvedOptions = options
		? mergeDefaults(options, defaultManageMetadataOptions)
		: defaultManageMetadataOptions
	const photoInfo = await resolvePhotoIdentifier(identifier)

	let tagsToTarget: Array<keyof ImageTags> | undefined
	if (resolvedOptions.syncToTarget) {
		tagsToTarget = await cloneTags(
			photoInfo.original.filePath,
			targetFilePath,
			resolvedOptions.tagsToSync,
		)
	}

	let tagsToEdited: Array<keyof ImageTags> | undefined
	if (photoInfo.edited && resolvedOptions.syncToEdited) {
		tagsToEdited = await cloneTags(
			photoInfo.original.filePath,
			photoInfo.edited.filePath,
			resolvedOptions.tagsToSync,
		)
	}

	if (exportOptions !== undefined && resolvedOptions.writeAphexMetadata) {
		const aphexMetadata: AphexMetadata = {
			exportOptions,
			photoInfo,
		}

		await setTags(targetFilePath, { aphexMetadata })
	}

	let validationResult: undefined | ValidateTagsResult
	if (resolvedOptions.validate) {
		validationResult = await validateTags(targetFilePath)
	}

	const result: ManageMetadataResult = {
		photoInfo,
		tagsToEdited,
		tagsToTarget,
		validationResult,
	}

	return result
}
