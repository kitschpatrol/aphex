/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable ts/no-restricted-types */
import { assert } from '@sindresorhus/is'
import camelcaseKeys from 'camelcase-keys'
import { execa } from 'execa'
import fse from 'fs-extra'
import path from 'node:path'
import { escapeRegExp } from '../general'

function assertPhotoInfoArray(jsonResult: unknown): asserts jsonResult is PhotoInfo[] {
	assert.array(jsonResult, assert.plainObject)
	// TODO more rigorous validation...
}

export async function getMockPhotoInfo(): Promise<PhotoInfo[]> {
	const result = await fse.readFile(`../../../scratch/results.json`, 'utf8')
	const jsonResult: unknown = JSON.parse(result.toString())
	assertPhotoInfoArray(jsonResult)
	return camelcaseKeys(jsonResult, { deep: true })
}

// Albums or individual photos...
export async function getPhotoInfoForUuid(uuid: string): Promise<PhotoInfo> {
	const result = await execa('osxphotos', ['query', '--uuid', uuid, '--json'])

	if (result.exitCode !== 0) {
		throw new Error(`Error exporting album or photo data for "${uuid}": ${result.stderr}`)
	}

	const jsonResult: unknown = JSON.parse(result.stdout.toString())
	assertPhotoInfoArray(jsonResult)
	return camelcaseKeys(jsonResult[0], { deep: true })
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
	assertPhotoInfoArray(jsonResult)
	return camelcaseKeys(jsonResult, { deep: true })
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
	title: null | string | undefined
	tzOffset: number
	uti: string
	utiEdited: null | string
	utiOriginal: string
	utiRaw: null | string
	uuid: string
	visible: boolean
	width: number
}

// Kinda slow
// async function validateAlbum(albumName: string) {
// 	try {
// 		const result = await execa('osxphotos', ['albums', '--json'])
// 		if (result.exitCode !== 0) {
// 			throw new Error(`Error getting album "${albumName}": ${result.stderr}`)
// 		}

// 		const { albums } = JSON.parse(result.stdout) as { albums: string[] }

// 		if (!Object.keys(albums).includes(albumName)) {
// 			throw new Error(`Album "${albumName}" not found`)
// 		}
// 	} catch (error) {
// 		throw new Error(`Error validating album "${albumName}": ${String(error)}`)
// 	}
// }
