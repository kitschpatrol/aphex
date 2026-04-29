#!/usr/bin/env -S pnpm tsx

/**
 * Interactive metadata sync for images in a Photos.app album
 *
 * The script uses the `aphex-swift` CLI to query Photos.app data and the
 * `exiftool` package to read and write metadata programmatically, and
 * MetaImage.app to edit metadata interactively.
 *
 * This script guides the user through picking a a Photos.app album name as
 * input and performs the following steps:
 *
 * 1. Load the list of photos with their metadata from the specified album
 * 2. Write the filename metadata to the original files
 * 3. Interactively edit credit and creator metadata with MetaImage.app, if needed
 * 4. Sync metadata from original files to edited versions
 */

import { confirm, log, select, spinner, text } from '@clack/prompts'
import { globby } from 'globby'
import open from 'open'
import type { PhotoInfo } from '../src/aphex-swift/cli-bridge'
import { aphexPhotoInfo } from '../src/aphex-swift/cli-bridge'
import { endExiftool } from '../src/utilities/exiftool'
import {
	cloneTags,
	// Legacy:
	// getPreservedFileName,
	getTags,
	// Legacy:
	// setTags,
	validateTags,
} from '../src/utilities/image/tags'

// eslint-disable-next-line complexity
async function imageCredits() {
	log.step('Step 1: Load Photos.app album data')

	const albumPath = await text({
		message: 'Enter the path to the album',
		validate(value) {
			if (value === undefined || value.length === 0) {
				return `Path is required!`
			}
		},
	})

	// Why can text return a symbol?
	if (typeof albumPath !== 'string') {
		log.error('No album path provided')
		return
	}

	const s = spinner()
	s.start('Looking up photos in album...')

	const photos = await aphexPhotoInfo(albumPath)

	const photosWithInvalidTags: PhotoInfo[] = []

	if (photos.length === 0) {
		s.stop(`No photos found in album "${albumPath}"`)
		return
	}

	s.stop(`Found ${photos.length} photos in album "${albumPath}"`)

	// --------------------------------------------------------------------------

	log.step('Step 2: Write filename metadata to original files')

	for (const photo of photos) {
		const { filePath } = photo.original

		// Temp clean up code...
		// const legacyTags = await getTags(path)

		// console.log(`existing tags: ${JSON.stringify(legacyTags, undefined, 2)}`)

		// const legacyArtistTag = await getLegacyArtistTag(path)
		// if (legacyArtistTag !== undefined) {
		// 	console.log(`Found legacy artist tag: ${legacyArtistTag}`)

		// 	if (legacyTags.credit === undefined) {
		// 		console.warn(`TODO TEMPORARY... Migrating legacy artist tag: ${legacyArtistTag}`)
		// 		await setTags(path, { credit: legacyArtistTag })
		// 	}

		// 	console.warn(`TODO TEMPORARY... Clearing legacy artist tag: ${legacyArtistTag}`)
		// 	await clearLegacyArtistTag(path)
		// }

		// if (legacyTags.preservedFileName === undefined) {
		// 	const foundPreservedFileName = await getPreservedFileName(photo)
		// 	if (foundPreservedFileName === undefined) {
		// 		throw new Error(`PreservedFileName not found for "${path}"`)
		// 	}

		// 	log.info(`TODO TEMPORARY Setting "PreservedFileName" to "${foundPreservedFileName}".`)
		// 	await setTags(path, { preservedFileName: foundPreservedFileName })
		// }

		// Keep stuff below -------------------
		const tags = await getTags(filePath)
		const { valid } = await validateTags(
			tags,
			['preservedFileName', 'label'],
			['creator', 'credit'],
			false,
		)

		if (!valid) {
			photosWithInvalidTags.push(photo)
		}
	}

	// --------------------------------------------------------------------------

	log.step('Step 3: Interactively edit credit and creator metadata with MetaImage.app')

	const whatToOpen = await select({
		message: [
			photosWithInvalidTags.length > 0
				? `${photosWithInvalidTags.length} / ${photos.length} photos are missing credit or creator metadata`
				: `All ${photos.length} photos have valid metadata.`,
			'What would you like to do?',
		].join(' '),
		options: [
			{ label: 'Open only photos without credit or creator in MetaImage.app', value: 'some' },
			{ label: 'Open all photos in MetaImage.app', value: 'all' },
			{ label: 'Skip editing metadata', value: 'none' },
		].filter(({ value }) =>
			photosWithInvalidTags.length > 0 && photosWithInvalidTags.length !== photos.length
				? true
				: value !== 'some',
		),
	})

	if (whatToOpen === 'none') {
		log.warn('Skipping all...')
	} else {
		log.info('Opening:')
		let logAccumulator = ''
		for (const { original } of photos) {
			if (
				whatToOpen === 'some' &&
				photosWithInvalidTags.every((photo) => photo.original.filePath !== original.filePath)
			) {
				continue
			}

			logAccumulator += `${original.filePath}\n`

			await open(original.filePath, { app: { name: 'metaimage' } })
		}

		log.message(logAccumulator)

		const shouldContinue = await confirm({
			message: 'Is all the original metadata set?',
		})

		if (shouldContinue) {
			log.success('Continuing...')
		} else {
			log.warning('Exiting early.')
			return
		}
	}

	// --------------------------------------------------------------------------

	// Ignore "path_derivatives" in Photos photo info
	log.step('Step 4: Sync metadata from original files to edited version')

	for (const photo of photos) {
		const { edited, original } = photo

		if (edited === undefined) {
			log.warning(`No edited version found for:\n${original.filePath}`)
			continue
		}

		log.message(
			`Syncing metadata from original to edited:\nFrom: ${original.filePath}\nTo: ${edited.filePath}`,
			{
				symbol: '🔄',
			},
		)

		const clonedKeys = await cloneTags(original.filePath, edited.filePath, [
			'credit',
			'preservedFileName',
			'creator',
			'label',
		])

		if (clonedKeys.length === 0) {
			log.success(`Already synced`)
		} else {
			log.info(`Synced keys: ${clonedKeys.join(', ')}`)
		}
	}

	// --------------------------------------------------------------------------

	log.step('Step 5: Sync metadata from original files to processed images')

	const albumName = albumPath.split('/').pop()
	if (albumName === undefined) {
		log.error(`Could not find album name from album path: ${albumPath}`)
		return
	}

	const processedImagesSearchPath = await text({
		message: 'Enter the path to the processed images (e.g. album/processed-images/*.*)',
		validate(value) {
			if (value === undefined || value.length === 0) {
				return `Path is required!`
			}
		},
	})

	if (typeof processedImagesSearchPath !== 'string') {
		log.error('No processed images path provided')
		return
	}

	const processedImagePaths = await globby(processedImagesSearchPath)

	if (processedImagePaths.length === 0) {
		log.error(`No images found in "${processedImagesSearchPath}"`)
		return
	}

	let processedImagesUpdated = 0
	let processedImagesFound = 0
	for (const processedImagePath of processedImagePaths) {
		const { aphexMetadata } = await getTags(processedImagePath)

		if (aphexMetadata === undefined) {
			log.warn(`No process metadata found for processed image: ${processedImagePath}`)
			continue
		}

		const { photoInfo } = aphexMetadata

		// if (photoInfo.uuid === undefined) {
		// 	log.warn(`Photos UUId not found for processed image: ${processedImagePath}`)
		// 	continue
		// }

		// Get matching photo
		const photo = photos.find((photo) => photo.uuid === photoInfo.uuid)

		if (photo === undefined) {
			log.warn(`Could not find photo with UUID ${photoInfo.uuid} in Photos album`)
			continue
		}

		processedImagesFound += 1

		const { original } = photo

		log.message(
			`Syncing metadata from original to processed:\nFrom: ${original.filePath}\nTo: ${processedImagePath}`,
			{
				symbol: '🔄',
			},
		)

		const clonedKeys = await cloneTags(original.filePath, processedImagePath, [
			'credit',
			'creator',
			'label',
			'preservedFileName',
		])

		if (clonedKeys.length === 0) {
			log.success(`Already synced`)
		} else {
			log.info(`Synced keys: ${clonedKeys.join(', ')}`)
			processedImagesUpdated += 1
		}
	}

	if (processedImagesFound === photos.length) {
		log.info(`All ${photos.length} album images have been processed`)
	} else {
		log.warn(
			`Only ${processedImagesFound} / ${photos.length} album images have been processed.\nYou may need to run "image-update-album-interactive"`,
		)
	}

	if (processedImagesUpdated > 0) {
		log.info(`Updated metadata for ${processedImagesUpdated} processed images.`)
	} else {
		log.success('All processed images were already in sync.')
	}

	log.success('📸 Done!')
}

async function main() {
	await imageCredits()
	await endExiftool()
}

await main()
