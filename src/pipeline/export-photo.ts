import { assert } from '@sindresorhus/is'
import camelcaseKeys from 'camelcase-keys'
import { execa } from 'execa'
import fse from 'fs-extra'
import { slug as githubSlug } from 'github-slugger'
import os from 'node:os'
import path from 'node:path'
import type { ExportViaAppleScriptGuiOptions } from '../engines/applescript-gui'
import type { OsxphotosExportReport, PhotoInfo } from '../utilities/image/apple-photos'
import type { ImageMimeType } from '../utilities/image/mime'
import type { ProcessImageOptions } from './process-photo'
import { exportViaAppleScriptGui } from '../engines/applescript-gui'
import { normalizeExtension } from '../utilities/file'
import {
	findPhotoInfoByTitleFilename,
	getAlbumIdFromPhotoInfo,
	getPhotoInfoForAlbum,
} from '../utilities/image/apple-photos'
import { hasAlpha } from '../utilities/image/image'
import { lookupImageMimeType } from '../utilities/image/mime'
import { cloneTags, getTags } from '../utilities/image/tags'

export type ExportEngine = 'osxphotos' | 'photos-gui' // TODO: Add more?
export type ExportEngineOptions = ExportEngine | Partial<Record<ImageMimeType, ExportEngine>>

export type ExportPhotoOptions = {
	appleScriptGuiOptions?: ExportViaAppleScriptGuiOptions
	engineEdited: ExportEngineOptions
	engineEditedAlpha: ExportEngineOptions
	engineOriginal: ExportEngineOptions
	engineOriginalAlpha: ExportEngineOptions
	preserveTags?: boolean
}

export type ExportedPhoto = {
	exportEngine: ExportEngine
	exportOptions: ExportPhotoOptions
	path: string
	photoInfo: PhotoInfo
}

export const defaultExportPhotoOptions: ExportPhotoOptions = {
	appleScriptGuiOptions: {
		colorProfile: 'sRGB',
		fileName: 'Use Title',
		includeLocation: false,
		includeMetadata: false,
		maxSizeType: 'Dimension',
		maxSizeValue: 6016, // Pro Display XDR res is 6016x3384
		photoKind: 'PNG',
		photoSize: 'Custom',
	},
	// If a single engine is passed, it's used for all cases regardless of the
	// '.[].path'` to find all original image formats in your library.
	engineEdited: 'photos-gui',
	// Photos-gui does not preserve alpha channels, so we need to always use osxphotos
	engineEditedAlpha: 'osxphotos',
	// This is tricky but important:
	// If an object mapping file formats to engines is passed, the image source
	// is lossless, and likely to end up as a PNG, then we can pass that to
	// photos-gui instead to take care of resizing and color profile assignment
	// during export instead of processing, possibly saving quality. (But note
	// that the resulting PNG might be bigger than the original.)
	//
	// For compressed formats like JPEG, we want to keep them in that format,
	// which means osxphotos is preferred in case there's a chance that they
	// won't need further processing.
	//
	// If an original image is found that doesn't match these mime types, it
	// will trigger an error. Run `osxphotos query --only-photos --json | jq
	// In those cases...
	engineOriginal: {
		arw: 'photos-gui',
		avif: 'osxphotos',
		cr2: 'photos-gui',
		cr3: 'photos-gui',
		crw: 'photos-gui',
		dng: 'photos-gui',
		gif: 'osxphotos',
		heic: 'osxphotos',
		heif: 'osxphotos',
		jpeg: 'osxphotos',
		nef: 'photos-gui',
		pef: 'photos-gui',
		png: 'photos-gui',
		psd: 'photos-gui',
		tiff: 'photos-gui',
		webp: 'osxphotos',
	},
	// Photos-gui does not preserve alpha channels, so we need to always use osxphotos
	engineOriginalAlpha: 'osxphotos',
	preserveTags: false, // We handle this ourselves later
}

// ------------------------------

// export async function exportPhoto(
// 	uuid: string,
// 	destinationDirectory: string,
// 	exportOptions?: ExportPhotoOptions,
// 	processOptions?: ProcessImageOptions,
// ): Promise<ExportedPhoto> {

// 	return ''
// }

/**
 * Export a single album
 */
// eslint-disable-next-line complexity
export async function exportPhotoAlbum(
	albumName: string,
	exportDirectory: string,
	options: ExportPhotoOptions,
	/** Used for change detection only */
	processOptions?: ProcessImageOptions,
): Promise<ExportedPhoto[]> {
	console.log(`Exporting from "${albumName}" to "${exportDirectory}"...`)

	const {
		appleScriptGuiOptions,
		engineEdited,
		engineEditedAlpha,
		engineOriginal,
		engineOriginalAlpha,
		preserveTags,
	} = options
	const exportedPhotos: ExportedPhoto[] = []

	// Needed for the metadata provided in the function's return value, and
	// for identifying edited images in the "slow path" mixing engines
	const albumPhotoInfo = await getPhotoInfoForAlbum(albumName)
	const albumPhotoCount = albumPhotoInfo.length

	if (albumPhotoCount === 0) {
		throw new Error(`No photos found in album "${albumName}"`)
	}

	// Audit title uniqueness
	const titleSet = new Set<string>()
	for (const photoInfo of albumPhotoInfo) {
		if (
			photoInfo.title === undefined ||
			photoInfo.title === null ||
			photoInfo.title.trim() === ''
		) {
			throw new Error(`Photo missing title in album "${albumName}"`)
		}

		if (titleSet.has(photoInfo.title)) {
			throw new Error(`Duplicate title "${photoInfo.title}" in album "${albumName}"`)
		}

		titleSet.add(photoInfo.title)
	}

	// Get existing image metadata
	const existingFiles = await fse.readdir(exportDirectory)

	// Delete stale and non-images
	for (const filename of existingFiles) {
		if (lookupImageMimeType(filename) === undefined) {
			console.log(`Deleting non-image file "${filename}"`)
			await fse.rm(path.join(exportDirectory, filename))
			continue
		}

		const existingImageTags = await getTags(path.join(exportDirectory, filename))

		// Delete images that aren't in the album
		const albumImageInfo = albumPhotoInfo.find(
			({ uuid }) => uuid === existingImageTags.processMetadata?.uuid,
		)

		if (albumImageInfo === undefined) {
			console.log(`Deleting non-album image: "${filename}"`)
			await fse.rm(path.join(exportDirectory, filename))
			continue
		}

		// Delete images without  process metadata (should never happen, but helps type system)
		if (existingImageTags.processMetadata === undefined) {
			console.log(`Deleting unprocessed image: "${filename}"`)
			await fse.rm(path.join(exportDirectory, filename))
			continue
		}

		// Delete images that have been modified or have different export or processing options
		if (existingImageTags.processMetadata.dateModified !== albumImageInfo.dateModified) {
			console.log(`Deleting outdated image: "${filename}"`)
			await fse.rm(path.join(exportDirectory, filename))
			continue
		}

		if (existingImageTags.processMetadata.edited !== (albumImageInfo.pathEdited !== null)) {
			console.log(`Deleting image with change in edit status: "${filename}"`)
			console.log(existingImageTags.processMetadata.edited)
			console.log(albumImageInfo.pathEdited)
			await fse.rm(path.join(exportDirectory, filename))
			continue
		}

		if (
			JSON.stringify(existingImageTags.processMetadata.options.export) !== JSON.stringify(options)
		) {
			console.log(`Deleting image with change in export options: "${filename}"`)
			await fse.rm(path.join(exportDirectory, filename))
			continue
		}

		if (
			processOptions !== undefined &&
			JSON.stringify(existingImageTags.processMetadata.options.process) !==
				JSON.stringify(processOptions)
		) {
			console.log(`Deleting image with change in processing options: "${filename}"`)
			await fse.rm(path.join(exportDirectory, filename))
			continue
		}

		// Finally, check for new metadata (in the original image)
		const albumImageTags = await getTags(albumImageInfo.path)
		if (
			existingImageTags.credit !== albumImageTags.credit ||
			existingImageTags.creator !== albumImageTags.creator ||
			existingImageTags.preservedFileName !== albumImageTags.preservedFileName
		) {
			console.log(`Deleting image with updated metadata: "${filename}"`)
			await fse.rm(path.join(exportDirectory, filename))
			continue
		}

		// Existing image must be identical, so remove from the output
		albumPhotoInfo.splice(albumPhotoInfo.indexOf(albumImageInfo), 1)
	}

	console.log(
		`Exporting ${albumPhotoInfo.length} new or updated / ${albumPhotoCount} total photos in "${albumName}"`,
	)

	// Allocate photos to engines, note nuances around per-type overrides
	const osxphotosExports: PhotoInfo[] = []
	const photosGuiExports: PhotoInfo[] = []

	// Temp for validation
	const enginelessExports: PhotoInfo[] = []

	for (const photoInfo of albumPhotoInfo) {
		if (photoInfo.pathEdited === null) {
			// Original only
			// Checks for actual transparency, not just the presence of a channel
			const alpha = await hasAlpha(photoInfo.path)
			const type = lookupImageMimeType(photoInfo.path, true)
			const engine = alpha
				? typeof engineOriginalAlpha === 'string'
					? engineOriginalAlpha
					: engineOriginalAlpha[type]
				: typeof engineOriginal === 'string'
					? engineOriginal
					: engineOriginal[type]

			if (engine === 'osxphotos') {
				osxphotosExports.push(photoInfo)
			} else if (engine === 'photos-gui') {
				photosGuiExports.push(photoInfo)
			} else {
				enginelessExports.push(photoInfo)
			}
		} else {
			// Has edits
			const alpha = await hasAlpha(photoInfo.pathEdited)

			if (alpha) {
				console.warn(
					`Edited photo "${photoInfo.title}" has true transparency, it probably won't export correctly. Only un-edited files preserve transparency on export.`,
				)
			}

			const type = lookupImageMimeType(photoInfo.pathEdited, true)
			const engine = alpha
				? typeof engineEditedAlpha === 'string'
					? engineEditedAlpha
					: engineEditedAlpha[type]
				: typeof engineEdited === 'string'
					? engineEdited
					: engineEdited[type]

			if (engine === 'osxphotos') {
				osxphotosExports.push(photoInfo)
			} else if (engine === 'photos-gui') {
				photosGuiExports.push(photoInfo)
			} else {
				enginelessExports.push(photoInfo)
			}
		}
	}

	if (enginelessExports.length > 0) {
		for (const photoInfo of enginelessExports) {
			console.log(`No export engine found for photo "${photoInfo.title}" in album "${albumName}"`)
		}

		throw new Error(
			`Unallocated photos in album "${albumName}", make sure all file types are accounted for in the engine map options`,
		)
	}

	console.log(`Engine allocation:`)
	console.log(`osxphotosExports: ${osxphotosExports.length}`)
	console.log(`photosGuiExports: ${photosGuiExports.length}`)

	if (photosGuiExports.length > 0) {
		// Exporting photos one-by one is often slower than just exporting everything in the album and then deleting, so we do that if there are more than a handful of images...
		if (photosGuiExports.length <= 3 && photosGuiExports.length !== albumPhotoCount) {
			const exportedPaths: string[] = []
			for (const photoInfo of photosGuiExports) {
				const exportedPath = await exportViaAppleScriptGui(
					photoInfo.uuid,
					exportDirectory,
					appleScriptGuiOptions,
				)
				exportedPaths.push(...exportedPath)
			}

			for (const exportPath of exportedPaths) {
				exportedPhotos.push({
					exportEngine: 'photos-gui',
					exportOptions: options,
					path: exportPath,
					photoInfo: findPhotoInfoByTitleFilename(exportPath, albumPhotoInfo),
				})
			}
		} else {
			// Export everything, and then prune...
			const albumId = getAlbumIdFromPhotoInfo(albumName, albumPhotoInfo[0])

			const tempDirectory = await fse.mkdtemp(
				path.join(
					os.tmpdir(),
					`com.ericmika.apple-photos-export..${githubSlug(albumName)}.photos-gui-album-export.`,
				),
			)

			const exportedPaths = await exportViaAppleScriptGui(
				albumId,
				tempDirectory,
				appleScriptGuiOptions,
			)

			for (const exportPath of exportedPaths) {
				// Delete photos that weren't schedule for export with the photos-gui engine
				const titleFromFilename = path.basename(exportPath, path.extname(exportPath))
				if (photosGuiExports.some(({ title }) => title === titleFromFilename)) {
					const destinationPath = path.join(exportDirectory, path.basename(exportPath))

					exportedPhotos.push({
						exportEngine: 'photos-gui',
						exportOptions: options,
						path: destinationPath,
						photoInfo: findPhotoInfoByTitleFilename(exportPath, albumPhotoInfo),
					})

					await fse.move(exportPath, destinationPath)
				} else {
					await fse.rm(exportPath)
				}
			}

			// Clean up temp directory
			await fse.rm(tempDirectory, { force: true, recursive: true })
		}
	}

	// Osxphotos
	if (osxphotosExports.length > 0) {
		// Parsing the stdout is a mess, so we write a report to a file and read that
		const osxphotosExportReportPath = path.join(exportDirectory, 'osxphotos-report.json')
		const osxphotosUuids = osxphotosExports.map(({ uuid }) => ['--uuid', uuid])

		await execa('osxphotos', [
			'export',
			exportDirectory,
			'--library',
			'/Users/mika/Pictures/Photos Library.photoslibrary',
			'--only-photos',
			'--jpeg-ext',
			'jpeg',
			'--skip-original-if-edited',
			'--no-exportdb',
			'--no-progress',
			'--edited-suffix',
			'',
			'--filename',
			'{title}',
			...osxphotosUuids.flat(),
			'--report',
			osxphotosExportReportPath,
		])

		const exportReportJson: unknown = await fse.readJSON(osxphotosExportReportPath)
		assert.plainObject(exportReportJson)
		// eslint-disable-next-line ts/no-unsafe-type-assertion
		const exportReport = camelcaseKeys(exportReportJson, {
			deep: true,
		}) as unknown as OsxphotosExportReport[]

		for (const { filename } of exportReport) {
			exportedPhotos.push({
				exportEngine: 'osxphotos',
				exportOptions: options,
				path: filename,
				photoInfo: findPhotoInfoByTitleFilename(filename, albumPhotoInfo),
			})
		}

		await fse.rm(osxphotosExportReportPath)
	}

	// Repair metadata in photos-gui exports, which loses the original filename
	for (const exportedPhoto of exportedPhotos) {
		if (exportedPhoto.exportEngine === 'photos-gui' && preserveTags) {
			// Copy relevant metadata from the original photo
			const clonedKeys = await cloneTags(exportedPhoto.photoInfo.path, exportedPhoto.path, [
				'credit',
				'creator',
				'preservedFileName',
			])

			console.log(`Cloned metadata keys for "${exportedPhoto.path}": ${clonedKeys.join(', ')}`)
		}

		// Normalize filename, doesn't touch the directory paths
		const cleanPath = normalizeExtension(exportedPhoto.path)
		await fse.rename(exportedPhoto.path, cleanPath)
		exportedPhoto.path = cleanPath
	}

	console.log(`Exported ${exportedPhotos.length} photos from "${albumName}"`)
	return exportedPhotos
}

/**
 * Process albums
 *
 * One project can reference multiple albums. Will attempt to update existing assets unless forceUpdate is true.
 */
// export async function processPhotoAlbums(
// 	albums: string[],
// 	outputDirectory: string,
// 	forceUpdate = false,
// ) {
// 	if (forceUpdate) {
// 		await fse.rm(outputDirectory, { force: true, recursive: true })
// 	}

// 	await fse.ensureDir(outputDirectory)

// 	for (const album of albums) {
// 		await processPhotoAlbum(album, path.join(outputDirectory, githubSlug(path.basename(album))))
// 	}
// }

// Always better not to touch the image, but don't get ridiculous...
// Note some PSD features are not supported
