import type { Tags } from 'exiftool-vendored'
import type { PhotoInfo } from '../../aphex-swift/cli-bridge'
import type { ExportOptions } from '../../index'
import { getExiftool } from '../exiftool'
import { log } from '../log'
import { lookupImageMimeType } from './mime'

export const VALID_LABELS = [
	'animation',
	'diagram',
	'illustration',
	'image',
	'photo',
	'render',
	'screenshot',
	'video',
] as const

type Label = (typeof VALID_LABELS)[number]

function isValidLabel(value: string): value is Label {
	return (VALID_LABELS as readonly string[]).includes(value)
}

export type TagsPlusXmp = Tags & {
	'XMP:Creator'?: string | string[] | undefined
	'XMP:Credit'?: string | undefined
	'XMP:Description'?: string | undefined
	'XMP:PreservedFileName'?: string | undefined
	'XMP:UserComment'?: string | undefined
}

/**
 * Strip all metadata from an image
 */
export async function stripTags(imagePath: string): Promise<void> {
	const mime = lookupImageMimeType(imagePath, true)

	if (mime === 'avif') {
		// Note that imagemagick's -strip is destructive
		// Preserve ICC
		await getExiftool().write(
			imagePath,
			{},
			{
				writeArgs: ['-all=', '--icc_profile:all', '-overwrite_original_in_place'],
			},
		)
	} else {
		// Also strips ICC, which we can't re-insert in AVIF files without loss!
		await getExiftool().write(
			imagePath,
			{},
			{
				writeArgs: ['-all=', '-overwrite_original_in_place'],
			},
		)
	}
}

/**
 * Get the number of tags in an image
 */
export async function getTagCount(imagePath: string): Promise<number> {
	const data = await getExiftool().read(imagePath)
	return Object.keys(data).length
}

export type ValidateTagsResult = {
	issues: string[]
	valid: boolean
}

/**
 * Validate that an image has the required tags
 */
export async function validateTags(
	imagePathOrTags: ImageTags | string,
	/** Must have all of these keys */
	andKeys?: Array<keyof ImageTags>,
	/** Must have at least one of these keys */
	orKeys?: Array<keyof ImageTags>,
	logWarnings = true,
): Promise<ValidateTagsResult> {
	const result: ValidateTagsResult = {
		issues: [],
		valid: true,
	}

	const tags =
		typeof imagePathOrTags === 'string' ? await getTags(imagePathOrTags) : imagePathOrTags

	// Check all keys if no "and" or "or" keys are specified
	if (orKeys === undefined && andKeys === undefined) {
		const allKeys = ['creator', 'credit', 'label', 'preservedFileName'] as Array<keyof ImageTags>
		const keysUnseen = allKeys.filter((key) => tags[key] === undefined)

		if (keysUnseen.length > 0) {
			result.issues.push(`Tags are missing keys: ${keysUnseen.join(', ')}`)
			if (logWarnings) {
				log.warn(result.issues.at(-1))
			}

			result.valid = false
		}
	}

	if (orKeys !== undefined && orKeys.length > 0) {
		const orKeysSeen = orKeys.filter((key) => tags[key] !== undefined)

		if (orKeysSeen.length === 0) {
			result.issues.push(`Tags should have at least one of the keys: ${orKeys.join(', ')}`)
			if (logWarnings) {
				log.warn(result.issues.at(-1))
			}

			result.valid = false
		}
	}

	if (andKeys !== undefined && andKeys.length > 0) {
		const andKeysUnseen = andKeys.filter((key) => tags[key] === undefined)

		if (andKeysUnseen.length > 0) {
			result.issues.push(`Tags are missing the keys: ${andKeysUnseen.join(', ')}`)
			if (logWarnings) {
				log.warn(result.issues.at(-1))
			}

			result.valid = false
		}
	}

	// Check labels if no value check is defined
	if (tags.label !== undefined && !VALID_LABELS.includes(tags.label)) {
		result.issues.push(`Tag value for 'label' is invalid: ${tags.label}`)
		if (logWarnings) {
			log.warn(result.issues.at(-1))
		}

		result.valid = false
	}

	return result
}

export type AphexMetadata = {
	exportOptions: ExportOptions
	photoInfo: PhotoInfo
}

// Custom subset that we actually use
export type ImageTags = {
	aphexMetadata?: AphexMetadata | undefined
	/** Human Name */
	creator?: string | undefined
	/** Organization */
	credit?: string | undefined
	/** Description, used as alt text in HTML content */
	description?: string | undefined
	/**
	 * Image Type, e.g. 'animation', 'diagram', 'illustration', 'screenshot',
	 * 'image', 'photo', 'render', 'video'
	 */
	label?: Label | undefined
	preservedFileName?: string | undefined
}

/**
 * Get the preserved file name of an image
 */
export function getPreservedFileName(photoInfo: PhotoInfo): string | undefined {
	return photoInfo.original.fileName
}

/**
 * Get the artist tag from an image
 */
export async function getLegacyArtistTag(imagePath: string): Promise<string | undefined> {
	const { Artist: artist } = await getExiftool().read(imagePath)
	return artist
}

/**
 * Clear the artist tag from an image
 */
export async function clearLegacyArtistTag(imagePath: string): Promise<void> {
	await getExiftool().write(
		imagePath,
		// eslint-disable-next-line ts/naming-convention
		{ Artist: '' },
		{
			writeArgs: ['-overwrite_original_in_place'],
		},
	)
}

/**
 * Get the tags from an image
 */
export async function getTags(imagePath: string): Promise<ImageTags> {
	// We explicitly use XMP metadata because it's compatible across all file types and not clobbered by Apple Photos

	const raw = (await getExiftool().readRaw(imagePath, {
		readArgs: ['-g', '-xmp:all'],
	})) as {
		// eslint-disable-next-line ts/naming-convention
		XMP?: {
			// eslint-disable-next-line ts/naming-convention
			Creator?: string | string[] | undefined
			// eslint-disable-next-line ts/naming-convention
			Credit?: string | undefined
			// eslint-disable-next-line ts/naming-convention
			Description?: string | undefined
			// eslint-disable-next-line ts/naming-convention
			Label?: string | undefined
			// eslint-disable-next-line ts/naming-convention
			PreservedFileName?: string | undefined
			// eslint-disable-next-line ts/naming-convention
			UserComment?: string | undefined
		}
	}

	const {
		Creator: creator,
		Credit: credit,
		Description: description,
		Label: label,
		PreservedFileName: preservedFileName,
		UserComment: userComment,
	} = raw.XMP ?? {}

	return {
		aphexMetadata: parseUserComment(userComment),
		creator: creator === undefined ? undefined : typeof creator === 'string' ? creator : creator[0],
		credit,
		description,
		label: label !== undefined && isValidLabel(label) ? label : undefined,
		preservedFileName,
	}
}

function dateReviver(key: string, value: unknown) {
	if (
		typeof value === 'string' &&
		['dateCreated', 'dateEnd', 'dateModified', 'dateStart'].includes(key)
	) {
		return value.length > 0 ? new Date(value) : undefined
	}

	return value
}

function isAphexMetadata(value: unknown): value is AphexMetadata {
	if (typeof value !== 'object' || value === null) {
		return false
	}

	const maybeObject = value as Record<string, unknown>
	return (
		typeof maybeObject.exportOptions === 'object' &&
		maybeObject.exportOptions !== null &&
		typeof maybeObject.photoInfo === 'object' &&
		maybeObject.photoInfo !== null
	)
}

function parseUserComment(userComment: string | undefined): AphexMetadata | undefined {
	if (userComment === undefined) {
		return undefined
	}

	try {
		const parsed: unknown = JSON.parse(userComment, dateReviver)
		if (!isAphexMetadata(parsed)) {
			log.warn(`UserComment JSON does not match AphexMetadata shape: ${userComment}`)
			return undefined
		}

		return parsed
	} catch (error) {
		log.withError(error).error(`Error parsing UserComment JSON: ${userComment}`)
		return undefined
	}
}

/**
 * Set the tags on an image
 */
export async function setTags(imagePath: string, imageTags: ImageTags) {
	const { aphexMetadata, creator, credit, description, label, preservedFileName } = imageTags
	const userComment = aphexMetadata ? JSON.stringify(aphexMetadata) : undefined

	// We explicitly use XMP metadata because it's compatible across all file types and not clobbered by Apple Photos
	// Values explicitly passed as undefined will "erase" the value
	// Does an empty string work, or do we have to pass null?
	const tags: TagsPlusXmp = {
		...('creator' in imageTags && { 'XMP:Creator': creator ?? '' }),
		...('description' in imageTags && { 'XMP:Description': description ?? '' }),
		...('credit' in imageTags && { 'XMP:Credit': credit ?? '' }),
		...('label' in imageTags && { 'XMP:Label': label ?? '' }),
		...('preservedFileName' in imageTags && { 'XMP:PreservedFileName': preservedFileName ?? '' }),
		...('aphexMetadata' in imageTags && { 'XMP:UserComment': userComment ?? '' }),
	}

	await getExiftool().write(imagePath, tags, {
		writeArgs: ['-overwrite_original_in_place'],
	})
}

/**
 * Clone tags from one image to another
 */
export async function cloneTags(
	sourceImagePath: string,
	destinationImagePath: string,
	/** If undefined, all tags are included. Undefined values are set to nothing. */
	includeKeys?: Array<keyof ImageTags>,
	force = false,
): Promise<Array<keyof ImageTags>> {
	// Full clone
	// Await execa('exiftool', [
	// 	'-overwrite_original_in_place',
	// 	'-TagsFromFile',
	// 	sourceImagePath,
	// 	destinationImagePath,
	// ])

	const sourceTags = await getTags(sourceImagePath)
	const destinationTags = await getTags(destinationImagePath)

	const keys =
		includeKeys ??
		(['creator', 'credit', 'description', 'label', 'preservedFileName', 'aphexMetadata'] as Array<
			keyof ImageTags
		>)

	let tagsToAssign: ImageTags = {}
	for (const key of keys) {
		const sourceValue = sourceTags[key]
		const destinationValue = destinationTags[key]

		if (sourceValue !== destinationValue || force) {
			tagsToAssign = {
				...tagsToAssign,
				[key]: sourceValue,
			}
		}
	}

	// Write the metadata we want
	if (Object.keys(tagsToAssign).length > 0) {
		await setTags(destinationImagePath, tagsToAssign)
	}

	return Object.keys(tagsToAssign) as Array<keyof ImageTags>
}
