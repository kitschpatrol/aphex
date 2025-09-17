import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { aphexPhotoInfo } from '../src/aphex-swift/cli-bridge'
import { getColorProfile } from '../src/utilities/image/color'
import {
	calculatePSNR,
	getTwoIdenticallySizedPng,
	isIdenticalSize,
} from '../src/utilities/image/compare'
import { hasAlpha } from '../src/utilities/image/image'
import { validateTags } from '../src/utilities/image/tags'
import { testFiles, testFiles2 } from './shared'
import { tempDirectoryFixture } from './utilities/temp-directory'

async function getColorProfileArray(files: string[], directory = ''): Promise<string[]> {
	return Promise.all(
		files.map(async (file) => {
			const colorProfile = await getColorProfile(path.join(directory, file))
			return `${file}: ${colorProfile}`
		}),
	)
}

async function getExifArray(files: string[], directory = ''): Promise<string[]> {
	return Promise.all(
		files.map(async (file) => {
			const validExif = await validateTags(path.join(directory, file))
			return `${file}: ${validExif ? 'valid' : 'invalid'}`
		}),
	)
}

async function getAlphaArray(files: string[], directory = ''): Promise<string[]> {
	return Promise.all(
		files.map(async (file) => {
			const hasAlphaChannel = await hasAlpha(path.join(directory, file))
			return `${file}: ${hasAlphaChannel ? 'Yes' : 'No'}`
		}),
	)
}

describe('quality', () => {
	it('calculates PSNR correctly', { timeout: 600_000 }, async () => {
		const results: string[] = []
		for (const fileA of testFiles2) {
			for (const fileB of testFiles2) {
				const psnr = await calculatePSNR(fileA, fileB)
				results.push(`${path.basename(fileA)} vs ${path.basename(fileB)}: ${psnr}`)
			}
		}

		expect(results).toMatchInlineSnapshot(`
			[
			  "test-no-profile-jpg.jpg vs test-no-profile-jpg.jpg: 0",
			  "test-no-profile-jpg.jpg vs test-no-profile-tif.tif: 50.497683",
			  "test-no-profile-jpg.jpg vs test-no-profile-webp.webp: 50.502154",
			  "test-no-profile-jpg.jpg vs test-p3-webp.webp: 31.099632",
			  "test-no-profile-jpg.jpg vs test-srgb-avif.avif: 48.129863",
			  "test-no-profile-jpg.jpg vs test-srgb-heic.heic: 47.610358",
			  "test-no-profile-tif.tif vs test-no-profile-jpg.jpg: 50.497683",
			  "test-no-profile-tif.tif vs test-no-profile-tif.tif: 0",
			  "test-no-profile-tif.tif vs test-no-profile-webp.webp: 53.514349",
			  "test-no-profile-tif.tif vs test-p3-webp.webp: 30.917705",
			  "test-no-profile-tif.tif vs test-srgb-avif.avif: 48.03083",
			  "test-no-profile-tif.tif vs test-srgb-heic.heic: 47.249393",
			  "test-no-profile-webp.webp vs test-no-profile-jpg.jpg: 50.502154",
			  "test-no-profile-webp.webp vs test-no-profile-tif.tif: 53.514349",
			  "test-no-profile-webp.webp vs test-no-profile-webp.webp: 0",
			  "test-no-profile-webp.webp vs test-p3-webp.webp: 30.918083",
			  "test-no-profile-webp.webp vs test-srgb-avif.avif: 48.032596",
			  "test-no-profile-webp.webp vs test-srgb-heic.heic: 47.252612",
			  "test-p3-webp.webp vs test-no-profile-jpg.jpg: 31.099632",
			  "test-p3-webp.webp vs test-no-profile-tif.tif: 30.917705",
			  "test-p3-webp.webp vs test-no-profile-webp.webp: 30.918083",
			  "test-p3-webp.webp vs test-p3-webp.webp: 0",
			  "test-p3-webp.webp vs test-srgb-avif.avif: 31.279063",
			  "test-p3-webp.webp vs test-srgb-heic.heic: 31.28891",
			  "test-srgb-avif.avif vs test-no-profile-jpg.jpg: 48.129863",
			  "test-srgb-avif.avif vs test-no-profile-tif.tif: 48.03083",
			  "test-srgb-avif.avif vs test-no-profile-webp.webp: 48.032596",
			  "test-srgb-avif.avif vs test-p3-webp.webp: 31.279063",
			  "test-srgb-avif.avif vs test-srgb-avif.avif: 0",
			  "test-srgb-avif.avif vs test-srgb-heic.heic: 48.449293",
			  "test-srgb-heic.heic vs test-no-profile-jpg.jpg: 47.610358",
			  "test-srgb-heic.heic vs test-no-profile-tif.tif: 47.249393",
			  "test-srgb-heic.heic vs test-no-profile-webp.webp: 47.252612",
			  "test-srgb-heic.heic vs test-p3-webp.webp: 31.28891",
			  "test-srgb-heic.heic vs test-srgb-avif.avif: 48.449293",
			  "test-srgb-heic.heic vs test-srgb-heic.heic: 0",
			]
		`)
	})
})

describe('test files are valid', () => {
	it('has valid exif data', async () => {
		expect(await getExifArray(testFiles)).toMatchInlineSnapshot(`
			[
			  "./test/assets/images/test-no-profile-avif.avif: valid",
			  "./test/assets/images/test-no-profile-heic.heic: valid",
			  "./test/assets/images/test-no-profile-jpg.jpg: valid",
			  "./test/assets/images/test-no-profile-png.png: valid",
			  "./test/assets/images/test-no-profile-psd.psd: valid",
			  "./test/assets/images/test-no-profile-tif.tif: valid",
			  "./test/assets/images/test-no-profile-webp.webp: valid",
			  "./test/assets/images/test-p3-alpha-png.png: valid",
			  "./test/assets/images/test-p3-alpha-psd.psd: valid",
			  "./test/assets/images/test-p3-alpha-webp.webp: valid",
			  "./test/assets/images/test-p3-avif.avif: valid",
			  "./test/assets/images/test-p3-heic.heic: valid",
			  "./test/assets/images/test-p3-jpg.jpg: valid",
			  "./test/assets/images/test-p3-png.png: valid",
			  "./test/assets/images/test-p3-psd.psd: valid",
			  "./test/assets/images/test-p3-tif.tif: valid",
			  "./test/assets/images/test-p3-webp.webp: valid",
			  "./test/assets/images/test-srgb-avif.avif: valid",
			  "./test/assets/images/test-srgb-heic.heic: valid",
			  "./test/assets/images/test-srgb-jpg.jpg: valid",
			  "./test/assets/images/test-srgb-png.png: valid",
			  "./test/assets/images/test-srgb-psd.psd: valid",
			  "./test/assets/images/test-srgb-tif.tif: valid",
			  "./test/assets/images/test-srgb-webp.webp: valid",
			]
		`)
	})

	it('has the correct color profile', async () => {
		expect(await getColorProfileArray(testFiles)).toMatchInlineSnapshot(`
			[
			  "./test/assets/images/test-no-profile-avif.avif: sRGB IEC61966-2.1",
			  "./test/assets/images/test-no-profile-heic.heic: sRGB IEC61966-2.1",
			  "./test/assets/images/test-no-profile-jpg.jpg: sRGB IEC61966-2.1",
			  "./test/assets/images/test-no-profile-png.png: None",
			  "./test/assets/images/test-no-profile-psd.psd: None",
			  "./test/assets/images/test-no-profile-tif.tif: None",
			  "./test/assets/images/test-no-profile-webp.webp: None",
			  "./test/assets/images/test-p3-alpha-png.png: Display P3",
			  "./test/assets/images/test-p3-alpha-psd.psd: Display P3",
			  "./test/assets/images/test-p3-alpha-webp.webp: Display P3",
			  "./test/assets/images/test-p3-avif.avif: Display P3",
			  "./test/assets/images/test-p3-heic.heic: Display P3",
			  "./test/assets/images/test-p3-jpg.jpg: Display P3",
			  "./test/assets/images/test-p3-png.png: Display P3",
			  "./test/assets/images/test-p3-psd.psd: Display P3",
			  "./test/assets/images/test-p3-tif.tif: Display P3",
			  "./test/assets/images/test-p3-webp.webp: Display P3",
			  "./test/assets/images/test-srgb-avif.avif: sRGB IEC61966-2.1",
			  "./test/assets/images/test-srgb-heic.heic: sRGB IEC61966-2.1",
			  "./test/assets/images/test-srgb-jpg.jpg: sRGB IEC61966-2.1",
			  "./test/assets/images/test-srgb-png.png: sRGB IEC61966-2.1",
			  "./test/assets/images/test-srgb-psd.psd: sRGB IEC61966-2.1",
			  "./test/assets/images/test-srgb-tif.tif: sRGB IEC61966-2.1",
			  "./test/assets/images/test-srgb-webp.webp: sRGB IEC61966-2.1",
			]
		`)
	})

	it('has transparency', async () => {
		expect(await getAlphaArray(testFiles)).toMatchInlineSnapshot(`
			[
			  "./test/assets/images/test-no-profile-avif.avif: No",
			  "./test/assets/images/test-no-profile-heic.heic: No",
			  "./test/assets/images/test-no-profile-jpg.jpg: No",
			  "./test/assets/images/test-no-profile-png.png: No",
			  "./test/assets/images/test-no-profile-psd.psd: No",
			  "./test/assets/images/test-no-profile-tif.tif: No",
			  "./test/assets/images/test-no-profile-webp.webp: No",
			  "./test/assets/images/test-p3-alpha-png.png: Yes",
			  "./test/assets/images/test-p3-alpha-psd.psd: Yes",
			  "./test/assets/images/test-p3-alpha-webp.webp: Yes",
			  "./test/assets/images/test-p3-avif.avif: No",
			  "./test/assets/images/test-p3-heic.heic: No",
			  "./test/assets/images/test-p3-jpg.jpg: No",
			  "./test/assets/images/test-p3-png.png: No",
			  "./test/assets/images/test-p3-psd.psd: No",
			  "./test/assets/images/test-p3-tif.tif: No",
			  "./test/assets/images/test-p3-webp.webp: No",
			  "./test/assets/images/test-srgb-avif.avif: No",
			  "./test/assets/images/test-srgb-heic.heic: No",
			  "./test/assets/images/test-srgb-jpg.jpg: No",
			  "./test/assets/images/test-srgb-png.png: No",
			  "./test/assets/images/test-srgb-psd.psd: No",
			  "./test/assets/images/test-srgb-tif.tif: No",
			  "./test/assets/images/test-srgb-webp.webp: No",
			]
		`)
	})
})

describe('photo-info', () => {
	it('gets photo info for uuid', { timeout: 20_000 }, async () => {
		const photoInfo = await aphexPhotoInfo('77758382-025A-446E-91C6-88A0BCAFDA91')

		/* Spell-checker: disable */

		expect(Object.keys(photoInfo)).toMatchInlineSnapshot(`
			[
			  "adjustments",
			  "albumInfo",
			  "albums",
			  "burst",
			  "burstAlbumInfo",
			  "burstAlbums",
			  "burstDefaultPick",
			  "burstKey",
			  "burstPhotos",
			  "burstSelected",
			  "cloudGuid",
			  "cloudMetadata",
			  "cloudOwnerHashedId",
			  "comments",
			  "date",
			  "dateAdded",
			  "dateModified",
			  "dateOriginal",
			  "dateTrashed",
			  "description",
			  "exifInfo",
			  "externalEdit",
			  "faceInfo",
			  "favorite",
			  "filename",
			  "fingerprint",
			  "folders",
			  "hasRaw",
			  "hasadjustments",
			  "hdr",
			  "height",
			  "hidden",
			  "importInfo",
			  "incloud",
			  "intrash",
			  "iscloudasset",
			  "ismissing",
			  "ismovie",
			  "isphoto",
			  "israw",
			  "isreference",
			  "keywords",
			  "labels",
			  "labelsNormalized",
			  "latitude",
			  "library",
			  "likes",
			  "livePhoto",
			  "location",
			  "longitude",
			  "orientation",
			  "originalFilename",
			  "originalFilesize",
			  "originalHeight",
			  "originalOrientation",
			  "originalWidth",
			  "owner",
			  "panorama",
			  "path",
			  "pathDerivatives",
			  "pathEdited",
			  "pathEditedLivePhoto",
			  "pathLivePhoto",
			  "pathRaw",
			  "personInfo",
			  "persons",
			  "place",
			  "portrait",
			  "projectInfo",
			  "rating",
			  "rawOriginal",
			  "savedToLibrary",
			  "score",
			  "screenRecording",
			  "screenshot",
			  "searchInfo",
			  "searchInfoNormalized",
			  "selfie",
			  "shared",
			  "sharedLibrary",
			  "sharedMoment",
			  "slowMo",
			  "syndicated",
			  "timeLapse",
			  "title",
			  "tzname",
			  "tzoffset",
			  "uti",
			  "utiEdited",
			  "utiOriginal",
			  "utiRaw",
			  "uuid",
			  "visible",
			  "width",
			]
		`)

		/* Spell-checker: enable */
	})
})

describe('resize', () => {
	tempDirectoryFixture(`matches size correctly`, { timeout: 600_000 }, async () => {
		const file1 = './test/assets/size/test.png'
		const file2 = './test/assets/size/test-small.png'

		const { image1Png, image2Png } = await getTwoIdenticallySizedPng(file1, file2)
		const identical = await isIdenticalSize(image1Png, image2Png)
		expect(identical).toBe(true)
	})
})
