/* eslint-disable ts/no-unnecessary-condition */
/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable ts/no-restricted-types */
import { assert } from '@sindresorhus/is'
import camelcaseKeys from 'camelcase-keys'
import { execa } from 'execa'
import fse from 'fs-extra'
import { slug as githubSlug } from 'github-slugger'
import os from 'node:os'
import path from 'node:path'
import type { ExportViaAppleScriptGuiOptions } from '../../engines/applescript-gui'
import type { ImageMimeType } from './mime'
import type { ProcessImageOptions } from './process'
import { exportViaAppleScriptGui } from '../../engines/applescript-gui'
import { normalizeExtension } from '../file'
import { escapeRegExp } from '../general'
import { hasAlpha } from './image'
import { lookupImageMimeType } from './mime'
import { cloneTags, getTags } from './tags'

export async function getMockPhotoInfo(): Promise<PhotoInfo[]> {
	const result = await fse.readFile(`../../../scratch/results.json`, 'utf8')
	const jsonResult: unknown = JSON.parse(result.toString())
	assert.plainObject(jsonResult)
	// eslint-disable-next-line ts/no-unsafe-type-assertion
	return camelcaseKeys(jsonResult, { deep: true }) as unknown as PhotoInfo[]
}

// Albums or individual photos...
export async function getPhotoInfoForUuid(uuid: string): Promise<PhotoInfo[]> {
	const result = await execa('osxphotos', ['query', '--uuid', uuid, '--json'])

	if (result.exitCode !== 0) {
		throw new Error(`Error exporting album or photo data for "${uuid}": ${result.stderr}`)
	}

	const jsonResult: unknown = JSON.parse(result.stdout.toString())
	assert.plainObject(jsonResult)
	// eslint-disable-next-line ts/no-unsafe-type-assertion
	return camelcaseKeys(jsonResult, { deep: true }) as unknown as PhotoInfo[]
}

export async function getPhotoInfoForAlbum(albumName: string): Promise<PhotoInfo[]> {
	const result = await execa('osxphotos', [
		'query',
		'--only-photos',
		'--regex',
		`^${escapeRegExp(albumName)}$`, // Anchors enforce an exact match
		'{folder_album}',
		'--json',
	])

	if (result.exitCode !== 0) {
		throw new Error(`Error getting data for album "${albumName}": ${result.stderr}`)
	}

	const jsonResult: unknown = JSON.parse(result.stdout.toString())
	assert.plainObject(jsonResult)
	// eslint-disable-next-line ts/no-unsafe-type-assertion
	return camelcaseKeys(jsonResult, { deep: true }) as unknown as PhotoInfo[]
}

// Assumes folder path in albumName
export function getAlbumIdFromPhotoInfo(albumName: string, photoInfo: PhotoInfo): string {
	for (const album of photoInfo.albumInfo) {
		const fullAlbumPath = path.join(...album.folderNames, album.title)

		if (fullAlbumPath === albumName) {
			return album.uuid
		}
	}

	throw new Error(`Album "${albumName}" not found`)
}

export type ExportEngine = 'osxphotos' | 'photos-gui'
export type ExportedPhoto = {
	exportEngine: ExportEngine
	path: string
	photoInfo: PhotoInfo
}

export type ExportEngineOptions = ExportEngine | Partial<Record<ImageMimeType, ExportEngine>>

export type ExportPhotoAlbumOptions = {
	appleScriptGuiOptions?: ExportViaAppleScriptGuiOptions
	engineEdited: ExportEngineOptions
	engineEditedAlpha: ExportEngineOptions
	engineOriginal: ExportEngineOptions
	engineOriginalAlpha: ExportEngineOptions
	preserveTags?: boolean
}

// Titles MUST be present and MUST be unique
export function findPhotoInfoByTitleFilename(
	titleFilename: string,
	photoInfoArray: PhotoInfo[],
): PhotoInfo {
	const titleFromFilename = path.basename(titleFilename, path.extname(titleFilename))
	const photoInfo = photoInfoArray.find(({ title }) => title === titleFromFilename)

	if (photoInfo === undefined) {
		throw new Error(`Photo info not found for title "${titleFilename}"`)
	}

	return photoInfo
}

// eslint-disable-next-line complexity
export async function exportPhotoAlbum(
	albumName: string,
	exportDirectory: string,
	options: ExportPhotoAlbumOptions,
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
					path: exportPath,
					photoInfo: findPhotoInfoByTitleFilename(exportPath, albumPhotoInfo),
				})
			}
		} else {
			// Export everything, and then prune...
			const albumId = getAlbumIdFromPhotoInfo(albumName, albumPhotoInfo[0])

			const tempDirectory = await fse.mkdtemp(
				path.join(os.tmpdir(), `com.ericmika.${githubSlug(albumName)}.photos-gui-album-export.`),
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

// From GPT
type AlbumInfo = {
	creationDate: string
	endDate: string
	folderList: string[]
	folderNames: string[]
	owner: null
	parent: string
	sortOrder: null
	startDate: string
	title: string
	uuid: string
}

type SearchInfo = {
	activities: string[]
	bodiesOfWater: string[]
	camera: string
	city: string
	country: string
	detectedText: string[]
	holidays: string[]
	labels: string[]
	localityNames: string[]
	mediaTypes: string[]
	month: string
	neighborhoods: string[]
	placeNames: string[]
	season: string
	source: string
	state: string
	stateAbbreviation: string
	streets: string[]
	venues: string[]
	venueTypes: string[]
	year: string
}

export type PhotoInfo = {
	adjustments: object
	albumInfo: AlbumInfo[]
	albums: string[]
	burst: boolean
	burstAlbumInfo: AlbumInfo[]
	burstAlbums: string[]
	burstDefaultPick: boolean
	burstKey: boolean
	burstPhotos: string[]
	burstSelected: boolean
	cloudGuid: null | string
	cloudMetadata: object
	cloudOwnerHashedId: null | string
	comments: string[]
	date: string
	dateAdded: string
	dateModified: null | string
	dateTrashed: null | string
	description: null | string
	exifInfo: {
		aperture: null
		bitRate: null
		cameraMake: null
		cameraModel: null
		codec: null
		duration: null
		exposureBias: null
		flashFired: boolean
		focalLength: null
		fps: null
		iso: null
		latitude: null
		lensModel: null
		longitude: null
		meteringMode: null
		sampleRate: null
		shutterSpeed: null
		trackFormat: null
		whiteBalance: null
	}
	externalEdit: boolean
	faceInfo: object[]
	favorite: boolean
	filename: string
	fingerprint: null | string
	folders: Record<string, string[]>
	hasAdjustments: boolean
	hasRaw: boolean
	hdr: boolean
	height: number
	hidden: boolean
	importInfo: {
		creationDate: string
		endDate: string
		startDate: string
		title: null | string
		uuid: string
	}
	inCloud: null | string
	inTrash: boolean
	isCloudAsset: boolean
	isMissing: boolean
	isMovie: boolean
	isPhoto: boolean
	isRaw: boolean
	isReference: boolean
	keywords: string[]
	labels: string[]
	labelsNormalized: string[]
	latitude: null | number
	library: string
	likes: string[]
	livePhoto: boolean
	location: Array<null | number>
	longitude: null | number
	orientation: number
	originalFilename: string
	originalFilesize: number
	originalHeight: number
	originalOrientation: number
	originalWidth: number
	owner: null | string
	panorama: boolean
	path: string
	pathDerivatives: string[]
	pathEdited: null | string
	pathEditedLivePhoto: null | string
	pathLivePhoto: null | string
	pathRaw: null | string
	personInfo: object[]
	persons: string[]
	place: object
	portrait: boolean
	projectInfo: object[]
	rating: number
	rawOriginal: boolean
	savedToLibrary: boolean
	score: {
		behavioral: number
		curation: number
		failure: number
		harmoniousColor: number
		highlightVisibility: number
		immersiveness: number
		interaction: number
		interestingSubject: number
		intrusiveObjectPresence: number
		livelyColor: number
		lowLight: number
		noise: number
		overall: number
		pleasantCameraTilt: number
		pleasantComposition: number
		pleasantLighting: number
		pleasantPattern: number
		pleasantPerspective: number
		pleasantPostProcessing: number
		pleasantReflection: number
		pleasantSymmetry: number
		promotion: number
		sharplyFocusedSubject: number
		tastefullyBlurred: number
		wellChosenSubject: number
		wellFramedSubject: number
		wellTimedShot: number
	}
	screenshot: boolean
	searchInfo: SearchInfo
	searchInfoNormalized: SearchInfo
	selfie: boolean
	shared: boolean
	sharedLibrary: boolean
	sharedMoment: boolean
	slowMo: boolean
	syndicated: boolean
	timeLapse: boolean
	title: string
	tzOffset: number
	uti: string
	utiEdited: null | string
	utiOriginal: string
	utiRaw: null | string
	uuid: string
	visible: boolean
	width: number
}

type OsxphotosExportReport = {
	cleanupDeletedDirectory: boolean
	cleanupDeletedFile: boolean
	convertedToJpeg: boolean
	dateTime: string
	error: string
	exiftoolError: string
	exiftoolWarning: string
	exifUpdated: boolean
	exported: boolean
	exportedAlbum: string
	extendedAttributesSkipped: boolean
	extendedAttributesWritten: boolean
	filename: string
	isNew: boolean
	missing: boolean
	sidecarExiftool: boolean
	sidecarJson: boolean
	sidecarUser: boolean
	sidecarUserError: string
	sidecarXmp: boolean
	skipped: boolean
	touched: boolean
	updated: boolean
	userError: string
	userSkipped: boolean
	userWritten: boolean
}
