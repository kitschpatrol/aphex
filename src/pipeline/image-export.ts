import type { PartialDeep } from 'type-fest'
import { isNonEmptyStringAndNotWhitespace } from '@sindresorhus/is'
import fse from 'fs-extra'
import { slug as githubSlug } from 'github-slugger'
import path from 'node:path'
import type { AlbumInfo, PhotoInfo } from '../aphex-swift/cli-bridge'
import type { ImageMimeType } from '../utilities/image/mime'
import type { ExportViaAppleScriptGuiOptions } from './engines/applescript-gui'
import { resolveIdentifiers, resolvePhotoIdentifier } from '../aphex-swift/identifiers'
import { mergeDefaults } from '../utilities/defaults'
import { ensureDirectoryExists, normalizeExtension } from '../utilities/file'
import { assertSingleElement } from '../utilities/general'
import { hasAlpha } from '../utilities/image/image'
import { lookupImageMimeType } from '../utilities/image/mime'
import { log } from '../utilities/log'
import { exportViaAppleScript } from './engines/applescript'
import { exportViaAppleScriptGui } from './engines/applescript-gui'
import { exportViaFileSystem } from './engines/file-system'
import { exportViaSwiftPhotoKit } from './engines/swift-photokit'

export type ExportEngine = 'applescript' | 'file-system' | 'photos-gui' | 'swift-photokit'
export type ExportEngineOptions = ExportEngine | Partial<Record<ImageMimeType, ExportEngine>>

export type ExportApplePhotoOptions = {
	appleScriptGuiOptions: ExportViaAppleScriptGuiOptions
	engineEdited: ExportEngineOptions
	engineEditedAlpha: ExportEngineOptions
	engineOriginal: ExportEngineOptions
	engineOriginalAlpha: ExportEngineOptions
	/**
	 * Append a few digits from the image's local identifier in Photos.app, useful
	 * to avoid name collisions if exporting multiple album-worth of photos. Only
	 * applies to `FileNameOptions` `title` or `uuid`. This is NOT the same as a
	 * content hash.
	 */
	fileNameAppendUuidFragment: boolean
	fileNameNormalizeExtensions: boolean
	fileNamePrecedence: FileNameOptions[]
	fileNameSluggify: boolean
}

export type ExportApplePhotoResult = {
	exportEngine: ExportEngine
	exportOptions: ExportApplePhotoOptions
	path: string
	photoInfo: PhotoInfo
}

export const defaultExportApplePhotoOptions: ExportApplePhotoOptions = {
	appleScriptGuiOptions: {
		colorProfile: 'sRGB',
		fileName: 'Use File Name',
		includeLocation: false,
		includeMetadata: false,
		jpegQuality: 'Maximum',
		maxSizeType: 'Dimension',
		// Pro Display XDR res is 6016x3384
		maxSizeValue: Number.MAX_SAFE_INTEGER,
		photoKind: 'PNG',
		photoSize: 'Full Size',
		sequentialPrefix: '',
		subfolderFormat: 'None',
		tiffBitDepth: 8,
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
	// Photos-gui does not preserve alpha channels, so we need to always use photokit?
	// TODO what about raw formats?
	engineOriginalAlpha: 'swift-photokit',
	fileNameAppendUuidFragment: false,
	fileNameNormalizeExtensions: true,
	fileNamePrecedence: ['title', 'fileName', 'uuid'],
	fileNameSluggify: true,
}

/**
 * Basic export for a single photo, no processing or metadata continuity
 */
export async function exportApplePhoto(
	identifier: PhotoInfo | string,
	destinationDirectory: string,
	options?: ExportApplePhotoOptions,
): Promise<ExportApplePhotoResult> {
	const result = await exportApplePhotos(
		[await resolvePhotoIdentifier(identifier)],
		destinationDirectory,
		options,
	)
	assertSingleElement(result)
	return result[0]
}

/**
 * Export a batch of photos
 */
export async function exportApplePhotos(
	identifiers: Array<AlbumInfo | PhotoInfo | string>,
	destinationDirectory: string,
	options?: PartialDeep<ExportApplePhotoOptions>,
): Promise<ExportApplePhotoResult[]> {
	const resolvedOptions = mergeDefaults(options, defaultExportApplePhotoOptions)
	const photoInfos = await resolveIdentifiers(identifiers)
	const exportedPhotos: ExportApplePhotoResult[] = []

	// TODO batch / album optimization...
	for (const photoInfo of photoInfos) {
		const engine = await getEngineForPhoto(photoInfo, resolvedOptions)

		const exportedPhoto: ExportApplePhotoResult = {
			exportEngine: engine,
			exportOptions: resolvedOptions,
			path: '', // Will be set later
			photoInfo,
		}

		switch (engine) {
			case 'applescript': {
				exportedPhoto.path = await exportViaAppleScript(photoInfo.uuid)
				break
			}

			case 'file-system': {
				exportedPhoto.path = await exportViaFileSystem(photoInfo)
				break
			}

			case 'photos-gui': {
				const [exportedPath] = await exportViaAppleScriptGui(
					photoInfo.uuid,
					resolvedOptions.appleScriptGuiOptions,
				)

				exportedPhoto.path = exportedPath

				// TODO necessary?
				// Copy relevant metadata from the original photo since photos-gui doesn't preserve it
				// await cloneTags(photoInfo.original.filePath, exportedPhoto.path, [
				// 	'credit',
				// 	'creator',
				// 	'preservedFileName',
				// ])
				break
			}

			case 'swift-photokit': {
				exportedPhoto.path = await exportViaSwiftPhotoKit(photoInfo.uuid)
				break
			}
		}

		// Normalize and move to final destination...
		const resolvedDestinationDirectory = await ensureDirectoryExists(destinationDirectory)
		const normalizedDestinationPath = getImagePathWithFileName(
			photoInfo,
			path.join(resolvedDestinationDirectory, path.basename(exportedPhoto.path)),
			resolvedOptions.fileNameSluggify,
			resolvedOptions.fileNameAppendUuidFragment,
			resolvedOptions.fileNameNormalizeExtensions,
			resolvedOptions.fileNamePrecedence,
		)

		await fse.rename(exportedPhoto.path, normalizedDestinationPath)

		// Clean up temp directory
		const tempDirectory = path.dirname(exportedPhoto.path)
		await fse.rm(tempDirectory, { force: true, recursive: true })

		exportedPhoto.path = normalizedDestinationPath
		exportedPhotos.push(exportedPhoto)
	}

	return exportedPhotos
}

type FileNameOptions = 'fileName' | 'title' | 'uuid'

/** Also normalizes */
export function getImagePathWithFileName(
	photoInfo: PhotoInfo,
	filePath: string,
	sluggify = true,
	fileNameAppendUuidFragment = false,
	normalizeExtensions = true,
	namingStrategyPrecedence: FileNameOptions[] = ['title', 'fileName', 'uuid'],
): string {
	const normalizedPath = normalizeExtensions ? normalizeExtension(filePath) : filePath
	const basePath = path.dirname(normalizedPath)
	const extension = path.extname(normalizedPath)

	for (const option of namingStrategyPrecedence) {
		switch (option) {
			case 'fileName': {
				const nameWithoutExtension = path.basename(
					photoInfo.original.fileName,
					path.extname(photoInfo.original.fileName),
				)
				const uuidFragment = fileNameAppendUuidFragment ? `-${photoInfo.uuid.slice(-8)}` : ''
				const processedName = sluggify
					? githubSlug(`${nameWithoutExtension}${uuidFragment}`)
					: `${nameWithoutExtension}${uuidFragment}`
				return path.join(basePath, `${processedName}${extension}`)
			}

			case 'title': {
				if (isNonEmptyStringAndNotWhitespace(photoInfo.title)) {
					const title = sluggify ? githubSlug(photoInfo.title) : photoInfo.title
					const uuidFragment = fileNameAppendUuidFragment ? `-${photoInfo.uuid.slice(-8)}` : ''
					const processedTitle = sluggify
						? githubSlug(`${title}${uuidFragment}`)
						: `${title}${uuidFragment}`
					return path.join(basePath, `${processedTitle}${extension}`)
				}

				break
			}

			case 'uuid': {
				// Don't append UUID fragment if the filename is already a UUID
				const processedUuid = sluggify ? githubSlug(photoInfo.uuid) : photoInfo.uuid
				return path.join(basePath, `${processedUuid}${extension}`)
			}
		}
	}

	throw new Error("No valid filename option found, can't name image")
}

async function getEngineForPhoto(
	photoInfo: PhotoInfo,
	options: ExportApplePhotoOptions,
): Promise<ExportEngine> {
	const { engineEdited, engineEditedAlpha, engineOriginal, engineOriginalAlpha } = mergeDefaults(
		options,
		defaultExportApplePhotoOptions,
	)

	// Original only
	if (!photoInfo.edited) {
		// Checks for actual transparency, not just the presence of a channel
		const alpha = await hasAlpha(photoInfo.original.filePath)
		// TODO get MIME from contentType field?
		const type = lookupImageMimeType(photoInfo.original.filePath, true)
		const engine = alpha
			? typeof engineOriginalAlpha === 'string'
				? engineOriginalAlpha
				: engineOriginalAlpha[type]
			: typeof engineOriginal === 'string'
				? engineOriginal
				: engineOriginal[type]

		if (engine === undefined) {
			throw new Error(
				`No export engine found for original photo "${photoInfo.title}" of type "${type}"${
					alpha ? ' with alpha channel' : ''
				}`,
			)
		}

		return engine
	}

	// Has edits
	const alpha = await hasAlpha(photoInfo.edited.filePath)

	if (alpha) {
		log.warn(
			`Edited photo "${photoInfo.title}" has true transparency, it probably won't export correctly. Only un-edited files preserve transparency on export.`,
		)
	}

	const type = lookupImageMimeType(photoInfo.edited.filePath, true)
	// TODO get MIME from contentType field?
	const engine = alpha
		? typeof engineEditedAlpha === 'string'
			? engineEditedAlpha
			: engineEditedAlpha[type]
		: typeof engineEdited === 'string'
			? engineEdited
			: engineEdited[type]

	if (engine === undefined) {
		throw new Error(
			`No export engine found for edited photo "${photoInfo.title}" of type "${type}"${
				alpha ? ' with alpha channel' : ''
			}`,
		)
	}

	return engine
}

/**
 * Export a single album to a folder Optionally sync the output directory with
 * the album, deleting any images that are no longer in the album Optionally
 * audit the album for duplicate titles Does NOT further process the images
 */
// export async function exportPhotoAlbum(
// 	identifier: string,
// 	exportDirectory: string,
// 	options?: Partial<ExportApplePhotoOptions>,
// 	processOptions?: Partial<ProcessImageOptions>,
// 	sync = false,
// 	audit = false,
// ): Promise<ExportedPhoto[]> {
// 	log.info(`Exporting from "${identifier}" to "${exportDirectory}"...`)

// 	const resolvedOptions = options
// 		? mergeDefaults(options, defaultExportApplePhotoOptions)
// 		: defaultExportApplePhotoOptions
// 	const resolvedProcessOptions = processOptions
// 		? mergeDefaults(processOptions, defaultProcessImageOptions)
// 		: undefined

// 	const exportedPhotos: ExportedPhoto[] = []

// 	await fse.ensureDir(exportDirectory)

// 	// Needed for the metadata provided in the function's return value, and
// 	// for identifying edited images in the "slow path" mixing engines

// 	const [albumInfo] = await aphexAlbumInfo(identifier)
// 	const albumPhotoInfo = await aphexPhotoInfo(identifier)
// 	const albumPhotoCount = albumPhotoInfo.length

// 	if (albumPhotoCount === 0) {
// 		throw new Error(`No photos found in album "${albumInfo.title}"`)
// 	}

// 	if (audit) {
// 		// Audit title uniqueness
// 		const titleSet = new Set<string>()
// 		for (const photoInfo of albumPhotoInfo) {
// 			if (photoInfo.title === undefined || photoInfo.title.trim() === '') {
// 				throw new Error(`Photo missing title in album "${albumInfo.title}"`)
// 			}

// 			if (titleSet.has(photoInfo.title)) {
// 				throw new Error(`Duplicate title "${photoInfo.title}" in album "${albumInfo.title}"`)
// 			}

// 			titleSet.add(photoInfo.title)
// 		}
// 	}

// 	if (sync) {
// 		// Get existing image metadata
// 		const existingFiles = await fse.readdir(exportDirectory)

// 		// Delete stale and non-images
// 		for (const filename of existingFiles) {
// 			const shouldKeep = await shouldKeepImage(
// 				filename,
// 				exportDirectory,
// 				albumPhotoInfo,
// 				resolvedOptions,
// 				resolvedProcessOptions,
// 			)

// 			if (shouldKeep) {
// 				// Existing image must be identical, so remove from the output schedule
// 				const { aphexMetadata } = await getTags(path.join(exportDirectory, filename))
// 				const albumImageInfo = albumPhotoInfo.find(
// 					({ uuid }) => uuid === aphexMetadata?.photoInfo.uuid,
// 				)
// 				albumPhotoInfo.splice(albumPhotoInfo.indexOf(albumImageInfo!), 1)
// 			} else {
// 				await fse.rm(path.join(exportDirectory, filename))
// 			}
// 		}

// 		log.info(
// 			`Exporting ${albumPhotoInfo.length} new or updated / ${albumPhotoCount} total photos in "${albumInfo.title}"`,
// 		)
// 	}

// 	// Allocate photos to engines, note nuances around per-type overrides
// 	const fileSystemExports: PhotoInfo[] = []
// 	const swiftPhotokitExports: PhotoInfo[] = []
// 	const photosGuiExports: PhotoInfo[] = []
// 	const enginelessExports: PhotoInfo[] = []

// 	for (const photoInfo of albumPhotoInfo) {
// 		const engine = await getEngineForPhoto(photoInfo, resolvedOptions)

// 		switch (engine) {
// 			case 'file-system': {
// 				fileSystemExports.push(photoInfo)
// 				break
// 			}
// 			case 'photos-gui': {
// 				photosGuiExports.push(photoInfo)
// 				break
// 			}
// 			case 'swift-photokit': {
// 				swiftPhotokitExports.push(photoInfo)
// 				break
// 			}
// 		}
// 	}

// 	if (enginelessExports.length > 0) {
// 		for (const photoInfo of enginelessExports) {
// 			log.info(
// 				`No export engine found for photo "${photoInfo.title}" in album "${albumInfo.title}"`,
// 			)
// 		}

// 		throw new Error(
// 			`Unallocated photos in album "${albumInfo.title}", make sure all file types are accounted for in the engine map options`,
// 		)
// 	}

// 	log.info(`Engine allocation:`)
// 	log.info(`fileSystemExports: ${fileSystemExports.length}`)
// 	log.info(`swiftPhotokitExports: ${swiftPhotokitExports.length}`)
// 	log.info(`photosGuiExports: ${photosGuiExports.length}`)

// 	if (photosGuiExports.length > 0) {
// 		// Exporting photos one-by one is often slower than just exporting everything in the album and then deleting, so we do that if there are more than a handful of images...
// 		if (photosGuiExports.length <= 3 && photosGuiExports.length !== albumPhotoCount) {
// 			const exportedPaths: string[] = []
// 			for (const photoInfo of photosGuiExports) {
// 				const exportedPath = await exportViaAppleScriptGui(
// 					photoInfo.uuid,
// 					exportDirectory,
// 					resolvedOptions.appleScriptGuiOptions,
// 				)
// 				exportedPaths.push(...exportedPath)
// 			}

// 			for (const exportPath of exportedPaths) {
// 				exportedPhotos.push({
// 					exportEngine: 'photos-gui',
// 					exportOptions: resolvedOptions,
// 					path: exportPath,
// 					photoInfo: findPhotoInfoByTitleFileName(exportPath, albumPhotoInfo)!,
// 					processOptions: resolvedProcessOptions,
// 				})
// 			}
// 		} else {
// 			// Export everything, and then prune...

// 			const tempDirectory = await fse.mkdtemp(
// 				path.join(
// 					os.tmpdir(),
// 					`com.kitschpatrol.aphex-${githubSlug(identifier)}.photos-gui-album-export.`,
// 				),
// 			)

// 			const exportedPaths = await exportViaAppleScriptGui(
// 				albumInfo.uuid,
// 				tempDirectory,
// 				resolvedOptions.appleScriptGuiOptions,
// 			)

// 			for (const exportPath of exportedPaths) {
// 				// Delete photos that weren't schedule for export with the photos-gui engine
// 				const photoInfo = findPhotoInfoByTitleFileName(exportPath, albumPhotoInfo)

// 				if (photoInfo === undefined || !photosGuiExports.includes(photoInfo)) {
// 					await fse.rm(exportPath, { force: true })
// 				} else {
// 					const destinationPath = path.join(exportDirectory, path.basename(exportPath))

// 					exportedPhotos.push({
// 						exportEngine: 'photos-gui',
// 						exportOptions: resolvedOptions,
// 						path: destinationPath,
// 						photoInfo,
// 						processOptions: resolvedProcessOptions,
// 					})

// 					await fse.move(exportPath, destinationPath)
// 				}
// 			}

// 			// Clean up temp directory
// 			await fse.rm(tempDirectory, { force: true, recursive: true })
// 		}
// 	}

// 	if (fileSystemExports.length > 0) {
// 		for (const photoInfo of fileSystemExports) {
// 			const exportedPath = await exportViaFileSystem(photoInfo, exportDirectory)
// 			exportedPhotos.push({
// 				exportEngine: 'file-system',
// 				exportOptions: resolvedOptions,
// 				path: exportedPath,
// 				photoInfo,
// 				processOptions: resolvedProcessOptions,
// 			})
// 		}
// 	}

// 	if (swiftPhotokitExports.length > 0) {
// 		for (const photoInfo of swiftPhotokitExports) {
// 			const exportedPath = await exportViaSwiftPhotoKit(photoInfo.uuid, exportDirectory)
// 			exportedPhotos.push({
// 				exportEngine: 'swift-photokit',
// 				exportOptions: resolvedOptions,
// 				path: exportedPath,
// 				photoInfo,
// 				processOptions: resolvedProcessOptions,
// 			})
// 		}
// 	}

// 	// Repair metadata in photos-gui exports, which loses the original filename
// 	// TODO do other engines need metadata repair as well?
// 	for (const exportedPhoto of exportedPhotos) {
// 		if (exportedPhoto.exportEngine === 'photos-gui') {
// 			// Copy relevant metadata from the original photo
// 			const clonedKeys = await cloneTags(
// 				exportedPhoto.photoInfo.original.filePath,
// 				exportedPhoto.path,
// 				['credit', 'creator', 'preservedFileName'],
// 			)

// 			log.info(`Cloned metadata keys for "${exportedPhoto.path}": ${clonedKeys.join(', ')}`)
// 		}

// 		// Normalize filename, doesn't touch the directory paths
// 		const cleanPath = normalizeExtension(exportedPhoto.path)
// 		await fse.rename(exportedPhoto.path, cleanPath)
// 		exportedPhoto.path = cleanPath
// 	}

// 	if (resolvedProcessOptions !== undefined) {
// 		const results = await processPhotos(exportedPhotos, exportDirectory, resolvedProcessOptions)

// 		// Update paths to reflect the new location
// 		for (const exportedPhoto of exportedPhotos) {
// 			exportedPhoto.path = results.find(
// 				({ input }) => input.path === exportedPhoto.path,
// 			)!.output.path
// 		}
// 	}

// 	log.info(`Exported ${exportedPhotos.length} photos from "${albumInfo.title}"`)
// 	return exportedPhotos
// }

// // Titles MUST be present and MUST be unique
// function findPhotoInfoByTitleFileName(
// 	titleFileName: string,
// 	photoInfoArray: PhotoInfo[],
// ): PhotoInfo | undefined {
// 	const titleFromFileName = path.basename(titleFileName, path.extname(titleFileName))
// 	const photoInfo = photoInfoArray.find(({ original, title }) => {
// 		assertNonEmptyStringAndNotWhitespace(title)
// 		return (
// 			titleFromFileName === title ||
// 			titleFromFileName === path.basename(original.fileName, path.extname(original.fileName))
// 		)
// 	})

// 	return photoInfo
// }
