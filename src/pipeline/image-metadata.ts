import type { JsonObject } from 'type-fest'
import { defu } from 'defu'
import type { PhotoInfo } from '../utilities/image/aphex-swift-bridge'
import type { ImageTags } from '../utilities/image/tags'
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
	tagsToEdited: Array<keyof ImageTags>
	tagsToTarget: Array<keyof ImageTags>
	valid: boolean | undefined
}

/**
 * Manage metadata...
 */
export async function manageMetadata(
	identifier: PhotoInfo | string,
	targetFile: string,
	options?: Partial<ManageMetadataOptions>,
	aphexMetadata?: JsonObject,
): Promise<ManageMetadataResult> {
	const resolvedOptions = defu(options, defaultManageMetadataOptions)
	const photoInfo = await resolvePhotoIdentifier(identifier)

	let tagsToTarget: Array<keyof ImageTags> = []
	if (resolvedOptions.syncToTarget) {
		tagsToTarget = await cloneTags(
			photoInfo.original.filePath,
			targetFile,
			resolvedOptions.tagsToSync,
		)
	}

	let tagsToEdited: Array<keyof ImageTags> = []
	if (photoInfo.edited && resolvedOptions.syncToEdited) {
		tagsToEdited = await cloneTags(
			photoInfo.original.filePath,
			photoInfo.edited.filePath,
			resolvedOptions.tagsToSync,
		)
	}

	if (aphexMetadata !== undefined && resolvedOptions.writeAphexMetadata) {
		await setTags(targetFile, { aphexMetadata })
	}

	let valid: boolean | undefined
	if (resolvedOptions.validate) {
		valid = await validateTags(targetFile)
	}

	const result: ManageMetadataResult = {
		tagsToEdited,
		tagsToTarget,
		valid,
	}

	return result
}
