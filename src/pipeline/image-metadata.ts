import type { ExportOptions } from '..'
import type { PhotoInfo } from '../utilities/image/aphex-swift-bridge'
import type { AphexMetadata, ImageTags, ValidateTagsResult } from '../utilities/image/tags'
import { mergeDefaults } from '../utilities/defu'
import { cloneTags, setTags, validateTags } from '../utilities/image/tags'
import { resolvePhotoIdentifier } from './image-export'

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
	tagsToEdited: Array<keyof ImageTags> | undefined
	tagsToTarget: Array<keyof ImageTags> | undefined
	validationResult: undefined | ValidateTagsResult
}

/**
 * Manage metadata...
 */
export async function manageMetadata(
	identifier: PhotoInfo | string,
	targetFile: string,
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
			targetFile,
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

		await setTags(targetFile, { aphexMetadata })
	}

	let validationResult: undefined | ValidateTagsResult
	if (resolvedOptions.validate) {
		validationResult = await validateTags(targetFile)
	}

	const result: ManageMetadataResult = {
		tagsToEdited,
		tagsToTarget,
		validationResult,
	}

	return result
}
