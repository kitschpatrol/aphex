import { assertString } from '@sindresorhus/is'
import { defu } from 'defu'
import fse from 'fs-extra'
import { slug as githubSlug } from 'github-slugger'
import os from 'node:os'
import path from 'node:path'
import type { PhotoInfo } from '../utilities/image/aphex-swift-bridge'
import type { ImageMimeType } from '../utilities/image/mime'
import type { ExportViaAppleScriptGuiOptions } from './engines/applescript-gui'
import type { ProcessImageOptions } from './process'
import { normalizeExtension } from '../utilities/file'
import { aphexAlbumInfo, aphexPhotoInfo, isPhotoInfo } from '../utilities/image/aphex-swift-bridge'
import { hasAlpha } from '../utilities/image/image'
import { lookupImageMimeType } from '../utilities/image/mime'
import { cloneTags, getTags } from '../utilities/image/tags'
import { exportViaAppleScriptGui } from './engines/applescript-gui'
import { exportViaFileSystem } from './engines/file-system'
import { exportViaSwiftPhotoKit } from './engines/swift-photokit'
import { defaultProcessImageOptions, processPhotos } from './process'

export type ExportEngine = 'file-system' | 'photos-gui' | 'swift-photokit'
export type ExportEngineOptions = ExportEngine | Partial<Record<ImageMimeType, ExportEngine>>

export type ExportPhotoOptions = {
	appleScriptGuiOptions: ExportViaAppleScriptGuiOptions
	engineEdited: ExportEngineOptions
	engineEditedAlpha: ExportEngineOptions
	engineOriginal: ExportEngineOptions
	engineOriginalAlpha: ExportEngineOptions
}

export type ExportedPhoto = {
	exportEngine: ExportEngine
	exportOptions: ExportPhotoOptions
	path: string
	photoInfo: PhotoInfo
	processOptions: ProcessImageOptions | undefined
}

export const defaultExportPhotoOptions: ExportPhotoOptions = {
	appleScriptGuiOptions: {
		colorProfile: 'sRGB',
		fileName: 'Use Title', // Falls back to filename if not found!
		includeLocation: false,
		includeMetadata: false,
		maxSizeType: undefined,
		maxSizeValue: undefined, // Pro Display XDR res is 6016x3384
		photoKind: 'PNG',
		photoSize: 'Full Size',
	},
	// If a single engine is passed, it's used for all cases regardless of the
	// '.[].path'` to find all original image formats in your library.
	engineEdited: 'photos-gui',
	// Photos-gui does not preserve alpha channels, so we need to always use osxphotos
	engineEditedAlpha: 'swift-photokit',
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
		avif: 'swift-photokit',
		cr2: 'photos-gui',
		cr3: 'photos-gui',
		crw: 'photos-gui',
		dng: 'photos-gui',
		gif: 'swift-photokit',
		heic: 'swift-photokit',
		heif: 'swift-photokit',
		jpeg: 'swift-photokit',
		nef: 'photos-gui',
		pef: 'photos-gui',
		png: 'photos-gui',
		psd: 'photos-gui',
		tiff: 'photos-gui',
		webp: 'swift-photokit',
	},
	// Photos-gui does not preserve alpha channels, so we need to always use osxphotos
	// TODO what about raw formats?
	engineOriginalAlpha: 'swift-photokit',
}

// ------------------------------

/**
 * Export a single photo
 */
export async function exportPhoto(
	identifier: PhotoInfo | string,
	destinationDirectory: string,
	options?: ExportPhotoOptions,
	processOptions?: Partial<ProcessImageOptions>,
): Promise<ExportedPhoto> {
	const resolvedOptions = defu(options, defaultExportPhotoOptions)
	const resolvedProcessOptions = processOptions
		? defu(processOptions, defaultProcessImageOptions)
		: undefined

	let photoInfo: PhotoInfo
	if (isPhotoInfo(identifier)) {
		photoInfo = identifier
	} else {
		const aphexPhotoInfoResult = await aphexPhotoInfo(identifier)
		if (aphexPhotoInfoResult.length === 0) {
			throw new Error(`No photo asset found for identifier "${identifier}"`)
		}
		if (aphexPhotoInfoResult.length > 1) {
			throw new Error(
				`Multiple photo assets found for identifier "${identifier} — is it an album?"`,
			)
		}
		photoInfo = aphexPhotoInfoResult[0]
	}

	const engine = await getEngineForPhoto(photoInfo, resolvedOptions)

	if (engine === undefined) {
		throw new Error(`No export engine found for photo "${photoInfo.uuid}"`)
	}

	const exportedPhoto: ExportedPhoto = {
		exportEngine: engine,
		exportOptions: resolvedOptions,
		path: '', // Will be set later
		photoInfo,
		processOptions: resolvedProcessOptions,
	}

	switch (engine) {
		case 'file-system': {
			const exportedPath = await exportViaFileSystem(photoInfo, destinationDirectory)
			exportedPhoto.path = exportedPath
			break
		}
		case 'photos-gui': {
			const [exportedPath] = await exportViaAppleScriptGui(
				photoInfo.uuid,
				destinationDirectory,
				resolvedOptions.appleScriptGuiOptions,
			)

			exportedPhoto.path = exportedPath

			// Copy relevant metadata from the original photo since photos-gui doesn't preserve it
			await cloneTags(photoInfo.original.filePath, exportedPhoto.path, [
				'credit',
				'creator',
				'preservedFileName',
			])

			break
		}
		case 'swift-photokit': {
			const exportedPath = await exportViaSwiftPhotoKit(photoInfo.uuid, destinationDirectory)
			exportedPhoto.path = exportedPath
			break
		}
	}

	if (resolvedProcessOptions !== undefined) {
		const [result] = await processPhotos(
			[exportedPhoto],
			destinationDirectory,
			resolvedProcessOptions,
		)

		exportedPhoto.path = result.output.path
	}

	return exportedPhoto
}

async function getEngineForPhoto(
	photoInfo: PhotoInfo,
	options: ExportPhotoOptions,
): Promise<ExportEngine | undefined> {
	const { engineEdited, engineEditedAlpha, engineOriginal, engineOriginalAlpha } = defu(
		options,
		defaultExportPhotoOptions,
	)

	// Original only
	if (!photoInfo.edited) {
		// Checks for actual transparency, not just the presence of a channel
		const alpha = await hasAlpha(photoInfo.original.filePath)
		// TODO get MIME from contentType field?
		const type = lookupImageMimeType(photoInfo.original.filePath, true)
		return alpha
			? typeof engineOriginalAlpha === 'string'
				? engineOriginalAlpha
				: engineOriginalAlpha[type]
			: typeof engineOriginal === 'string'
				? engineOriginal
				: engineOriginal[type]
	}

	// Has edits
	const alpha = await hasAlpha(photoInfo.edited.filePath)

	if (alpha) {
		console.warn(
			`Edited photo "${photoInfo.title}" has true transparency, it probably won't export correctly. Only un-edited files preserve transparency on export.`,
		)
	}

	const type = lookupImageMimeType(photoInfo.edited.filePath, true)
	// TODO get MIME from contentType field?
	return alpha
		? typeof engineEditedAlpha === 'string'
			? engineEditedAlpha
			: engineEditedAlpha[type]
		: typeof engineEdited === 'string'
			? engineEdited
			: engineEdited[type]
}

/**
 * Export a single album to a folder
 * Optionally sync the output directory with the album, deleting any images that are no longer in the album
 * Optionally audit the album for duplicate titles
 * Does NOT further process the images
 */
// eslint-disable-next-line complexity
export async function exportPhotoAlbum(
	identifier: string,
	exportDirectory: string,
	options?: Partial<ExportPhotoOptions>,
	processOptions?: Partial<ProcessImageOptions>,
	sync = false,
	audit = false,
): Promise<ExportedPhoto[]> {
	console.log(`Exporting from "${identifier}" to "${exportDirectory}"...`)

	const resolvedOptions = defu(options, defaultExportPhotoOptions)
	const resolvedProcessOptions = processOptions
		? defu(processOptions, defaultProcessImageOptions)
		: undefined

	const exportedPhotos: ExportedPhoto[] = []

	await fse.ensureDir(exportDirectory)

	// Needed for the metadata provided in the function's return value, and
	// for identifying edited images in the "slow path" mixing engines

	const [albumInfo] = await aphexAlbumInfo(identifier)
	const albumPhotoInfo = await aphexPhotoInfo(identifier)
	const albumPhotoCount = albumPhotoInfo.length

	if (albumPhotoCount === 0) {
		throw new Error(`No photos found in album "${albumInfo.title}"`)
	}

	if (audit) {
		// Audit title uniqueness
		const titleSet = new Set<string>()
		for (const photoInfo of albumPhotoInfo) {
			if (photoInfo.title === undefined || photoInfo.title.trim() === '') {
				throw new Error(`Photo missing title in album "${albumInfo.title}"`)
			}

			if (titleSet.has(photoInfo.title)) {
				throw new Error(`Duplicate title "${photoInfo.title}" in album "${albumInfo.title}"`)
			}

			titleSet.add(photoInfo.title)
		}
	}

	if (sync) {
		// Get existing image metadata
		const existingFiles = await fse.readdir(exportDirectory)

		// Delete stale and non-images
		for (const filename of existingFiles) {
			const shouldKeep = await shouldKeepImage(
				filename,
				exportDirectory,
				albumPhotoInfo,
				resolvedOptions,
				resolvedProcessOptions,
			)

			if (shouldKeep) {
				// Existing image must be identical, so remove from the output schedule
				const { processMetadata } = await getTags(path.join(exportDirectory, filename))
				const albumImageInfo = albumPhotoInfo.find(
					({ uuid }) => uuid === processMetadata?.photoInfo.uuid,
				)
				albumPhotoInfo.splice(albumPhotoInfo.indexOf(albumImageInfo!), 1)
			} else {
				await fse.rm(path.join(exportDirectory, filename))
			}
		}

		console.log(
			`Exporting ${albumPhotoInfo.length} new or updated / ${albumPhotoCount} total photos in "${albumInfo.title}"`,
		)
	}

	// Allocate photos to engines, note nuances around per-type overrides
	const fileSystemExports: PhotoInfo[] = []
	const swiftPhotokitExports: PhotoInfo[] = []
	const photosGuiExports: PhotoInfo[] = []
	const enginelessExports: PhotoInfo[] = []

	for (const photoInfo of albumPhotoInfo) {
		const engine = await getEngineForPhoto(photoInfo, resolvedOptions)

		switch (engine) {
			case 'file-system': {
				fileSystemExports.push(photoInfo)
				break
			}
			case 'photos-gui': {
				photosGuiExports.push(photoInfo)
				break
			}
			case 'swift-photokit': {
				swiftPhotokitExports.push(photoInfo)
				break
			}
			case undefined: {
				enginelessExports.push(photoInfo)
				break
			}
		}
	}

	if (enginelessExports.length > 0) {
		for (const photoInfo of enginelessExports) {
			console.log(
				`No export engine found for photo "${photoInfo.title}" in album "${albumInfo.title}"`,
			)
		}

		throw new Error(
			`Unallocated photos in album "${albumInfo.title}", make sure all file types are accounted for in the engine map options`,
		)
	}

	console.log(`Engine allocation:`)
	console.log(`fileSystemExports: ${fileSystemExports.length}`)
	console.log(`swiftPhotokitExports: ${swiftPhotokitExports.length}`)
	console.log(`photosGuiExports: ${photosGuiExports.length}`)

	if (photosGuiExports.length > 0) {
		// Exporting photos one-by one is often slower than just exporting everything in the album and then deleting, so we do that if there are more than a handful of images...
		if (photosGuiExports.length <= 3 && photosGuiExports.length !== albumPhotoCount) {
			const exportedPaths: string[] = []
			for (const photoInfo of photosGuiExports) {
				const exportedPath = await exportViaAppleScriptGui(
					photoInfo.uuid,
					exportDirectory,
					resolvedOptions.appleScriptGuiOptions,
				)
				exportedPaths.push(...exportedPath)
			}

			for (const exportPath of exportedPaths) {
				exportedPhotos.push({
					exportEngine: 'photos-gui',
					exportOptions: resolvedOptions,
					path: exportPath,
					photoInfo: findPhotoInfoByTitleFileName(exportPath, albumPhotoInfo)!,
					processOptions: resolvedProcessOptions,
				})
			}
		} else {
			// Export everything, and then prune...

			const tempDirectory = await fse.mkdtemp(
				path.join(
					os.tmpdir(),
					`com.kitschpatrol.aphex-${githubSlug(identifier)}.photos-gui-album-export.`,
				),
			)

			const exportedPaths = await exportViaAppleScriptGui(
				albumInfo.uuid,
				tempDirectory,
				resolvedOptions.appleScriptGuiOptions,
			)

			for (const exportPath of exportedPaths) {
				// Delete photos that weren't schedule for export with the photos-gui engine
				const photoInfo = findPhotoInfoByTitleFileName(exportPath, albumPhotoInfo)

				if (photoInfo === undefined || !photosGuiExports.includes(photoInfo)) {
					await fse.rm(exportPath, { force: true })
				} else {
					const destinationPath = path.join(exportDirectory, path.basename(exportPath))

					exportedPhotos.push({
						exportEngine: 'photos-gui',
						exportOptions: resolvedOptions,
						path: destinationPath,
						photoInfo,
						processOptions: resolvedProcessOptions,
					})

					await fse.move(exportPath, destinationPath)
				}
			}

			// Clean up temp directory
			await fse.rm(tempDirectory, { force: true, recursive: true })
		}
	}

	if (fileSystemExports.length > 0) {
		for (const photoInfo of fileSystemExports) {
			const exportedPath = await exportViaFileSystem(photoInfo, exportDirectory)
			exportedPhotos.push({
				exportEngine: 'file-system',
				exportOptions: resolvedOptions,
				path: exportedPath,
				photoInfo,
				processOptions: resolvedProcessOptions,
			})
		}
	}

	if (swiftPhotokitExports.length > 0) {
		for (const photoInfo of swiftPhotokitExports) {
			const exportedPath = await exportViaSwiftPhotoKit(photoInfo.uuid, exportDirectory)
			exportedPhotos.push({
				exportEngine: 'swift-photokit',
				exportOptions: resolvedOptions,
				path: exportedPath,
				photoInfo,
				processOptions: resolvedProcessOptions,
			})
		}
	}

	// Repair metadata in photos-gui exports, which loses the original filename
	// TODO do other engines need metadata repair as well?
	for (const exportedPhoto of exportedPhotos) {
		if (exportedPhoto.exportEngine === 'photos-gui') {
			// Copy relevant metadata from the original photo
			const clonedKeys = await cloneTags(
				exportedPhoto.photoInfo.original.filePath,
				exportedPhoto.path,
				['credit', 'creator', 'preservedFileName'],
			)

			console.log(`Cloned metadata keys for "${exportedPhoto.path}": ${clonedKeys.join(', ')}`)
		}

		// Normalize filename, doesn't touch the directory paths
		const cleanPath = normalizeExtension(exportedPhoto.path)
		await fse.rename(exportedPhoto.path, cleanPath)
		exportedPhoto.path = cleanPath
	}

	if (resolvedProcessOptions !== undefined) {
		const results = await processPhotos(exportedPhotos, exportDirectory, resolvedProcessOptions)

		// Update paths to reflect the new location
		for (const exportedPhoto of exportedPhotos) {
			exportedPhoto.path = results.find(
				({ input }) => input.path === exportedPhoto.path,
			)!.output.path
		}
	}

	console.log(`Exported ${exportedPhotos.length} photos from "${albumInfo.title}"`)
	return exportedPhotos
}

/**
 * Sync a single album to a folder, deleting any images that are no longer in the album
 *
 * TODO this could be much simpler? Needs dynamic exif metadata handling.
 */
async function shouldKeepImage(
	filename: string,
	exportDirectory: string,
	albumPhotoInfo: PhotoInfo[],
	exportOptions?: ExportPhotoOptions,
	processOptions?: ProcessImageOptions,
): Promise<boolean> {
	if (lookupImageMimeType(filename) === undefined) {
		console.log(`Detected non-image file "${filename}"`)
		return false
	}

	const existingImageTags = await getTags(path.join(exportDirectory, filename))

	const photoInfo = albumPhotoInfo.find(
		({ uuid }) => uuid === existingImageTags.processMetadata?.photoInfo.uuid,
	)

	// Delete images that aren't in the album
	if (photoInfo === undefined) {
		console.log(`Found non-album image: "${filename}"`)
		return false
	}

	// Delete images without  process metadata (should never happen, but helps type system)
	if (existingImageTags.processMetadata === undefined) {
		console.log(`Found unprocessed image: "${filename}"`)
		return false
	}

	// Delete images that have been modified or have different export or processing options
	if (existingImageTags.processMetadata.photoInfo.dateModified !== photoInfo.dateModified) {
		console.log(`Found outdated image: "${filename}"`)
		return false
	}

	if (
		JSON.stringify(existingImageTags.processMetadata.photoInfo.edited ?? {}) !==
		JSON.stringify(photoInfo.edited ?? {})
	) {
		console.log(`Found image with change in edit status: "${filename}"`)
		console.log(existingImageTags.processMetadata.photoInfo.edited)
		console.log(photoInfo.edited)
		return false
	}

	if (
		exportOptions !== undefined &&
		JSON.stringify(existingImageTags.processMetadata.options.export) !==
			JSON.stringify(exportOptions)
	) {
		console.log(`Found image with change in export options: "${filename}"`)
		return false
	}

	if (
		processOptions !== undefined &&
		JSON.stringify(existingImageTags.processMetadata.options.process) !==
			JSON.stringify(processOptions)
	) {
		console.log(`Found image with change in processing options: "${filename}"`)
		return false
	}

	// Finally, check for new metadata (in the original image)
	const albumImageTags = await getTags(photoInfo.original.filePath)
	if (
		existingImageTags.credit !== albumImageTags.credit ||
		existingImageTags.creator !== albumImageTags.creator ||
		existingImageTags.preservedFileName !== albumImageTags.preservedFileName
	) {
		console.log(`Found image with updated metadata: "${filename}"`)
		return false
	}

	console.log(`Found unchanged image: "${filename}"`)
	return true
}

// Titles MUST be present and MUST be unique
function findPhotoInfoByTitleFileName(
	titleFileName: string,
	photoInfoArray: PhotoInfo[],
): PhotoInfo | undefined {
	const titleFromFileName = path.basename(titleFileName, path.extname(titleFileName))
	const photoInfo = photoInfoArray.find(({ original, title }) => {
		assertString(title)
		return (
			titleFromFileName === title ||
			titleFromFileName === path.basename(original.fileName, path.extname(original.fileName))
		)
	})

	return photoInfo
}
