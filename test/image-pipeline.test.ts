import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getColorProfile } from '../src/utilities/image/color'
import {
	calculatePSNR,
	getTwoIdenticallySizedPng,
	isIdenticalSize,
} from '../src/utilities/image/compare'
import { getImageDimensions, hasAlpha } from '../src/utilities/image/image'
import { processImage } from '../src/utilities/image/process'
import { validateTags } from '../src/utilities/image/tags'
import { itTempDirectory } from './utilities/temp-directory'

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

const testFiles2 = [
	'./test/assets/images/test-no-profile-jpg.jpg',
	'./test/assets/images/test-no-profile-tif.tif',
	'./test/assets/images/test-no-profile-webp.webp',
	'./test/assets/images/test-p3-webp.webp',
	'./test/assets/images/test-srgb-avif.avif',
	'./test/assets/images/test-srgb-heic.heic',
]

const testFiles = [
	'./test/assets/images/test-no-profile-avif.avif',
	'./test/assets/images/test-no-profile-heic.heic',
	'./test/assets/images/test-no-profile-jpg.jpg',
	'./test/assets/images/test-no-profile-png.png',
	'./test/assets/images/test-no-profile-psd.psd',
	'./test/assets/images/test-no-profile-tif.tif',
	'./test/assets/images/test-no-profile-webp.webp',
	'./test/assets/images/test-p3-alpha-png.png',
	'./test/assets/images/test-p3-alpha-psd.psd',
	'./test/assets/images/test-p3-alpha-webp.webp',
	'./test/assets/images/test-p3-avif.avif',
	'./test/assets/images/test-p3-heic.heic',
	'./test/assets/images/test-p3-jpg.jpg',
	'./test/assets/images/test-p3-png.png',
	'./test/assets/images/test-p3-psd.psd',
	'./test/assets/images/test-p3-tif.tif',
	'./test/assets/images/test-p3-webp.webp',
	'./test/assets/images/test-srgb-avif.avif',
	'./test/assets/images/test-srgb-heic.heic',
	'./test/assets/images/test-srgb-jpg.jpg',
	'./test/assets/images/test-srgb-png.png',
	'./test/assets/images/test-srgb-psd.psd',
	'./test/assets/images/test-srgb-tif.tif',
	'./test/assets/images/test-srgb-webp.webp',
]

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

// Describe('photo library export', () => {
// 	itTempDirectory(
// 		'exports all photos in an album',
// 		{ timeout: 30_000 },
// 		async ({ tempDirectory }) => {
// 			await exportPhotoAlbum('test', tempDirectory, {
// 				engineEdited: 'photos-gui',
// 				engineOriginal: 'osxphotos',
// 			})

// 			const files = await fs.readdir(tempDirectory)
// 			expect(files).toMatchInlineSnapshot()

// 			// Expect files to have retained their metadata
// 			expect(getExifArray(files)).toMatchInlineSnapshot()

// 			// Expect files to have retained their color profile

// 			expect(getColorProfileArray(files)).toMatchInlineSnapshot()

// 			// Expect files to have retained their creation dates
// 			const creationDates = await Promise.all(
// 				files.map(async (file) => {
// 					const creationDate = await getFileCreationTime(path.join(tempDirectory, file))
// 					return `${file}: ${String(creationDate)}`
// 				}),
// 			)
// 			expect(creationDates).toMatchInlineSnapshot()
// 		},
// 	)
// })

describe('image processing', () => {
	itTempDirectory(
		`processes test images correctly`,
		{ timeout: 600_000 },
		async ({ tempDirectory }) => {
			const filePairs: string[][] = []
			const pathPairs: string[][] = []
			for (const file of testFiles) {
				const result = await processImage(file, tempDirectory, {
					defaultColorProfile: 'sRGB IEC61966-2.1',
					forceCompression: true,
					logSimilarity: true,
					losslessFormat: 'webp',
					losslessFormatAlpha: 'webp',
					lossyFormat: 'jpeg', // Toss up with webp
					lossyFormatAlpha: 'webp',
					lossyQuality: 96, // See Compression Analysis.numbers
					maxDimensionsPixels: {
						width: 6016, // Pro Display XDR res is 6016x3384
						height: 6016, // Pro Display XDR res is 6016x3384
					},
					maxFileSizeBytes: 6_000_000,
					nearLosslessFormat: 'webp',
					nearLosslessFormatAlpha: 'webp',
					passthroughFormats: ['webp', 'avif', 'jpeg'], // Compress PNGs
					preserveColorProfiles: [
						'ProPhoto RGB',
						'Display P3',
						'sRGB IEC61966-2.1',
						'Adobe RGB (1998)',
					],
					preserveTags: false,
				})
				filePairs.push([path.basename(file), path.basename(result.output.path)])
				pathPairs.push([file, result.output.path])
			}

			// Expect appropriate conversions / retentions
			expect(filePairs).toMatchInlineSnapshot(`
				[
				  [
				    "test-no-profile-avif.avif",
				    "test-no-profile-avif.avif",
				  ],
				  [
				    "test-no-profile-heic.heic",
				    "test-no-profile-heic.webp",
				  ],
				  [
				    "test-no-profile-jpg.jpg",
				    "test-no-profile-jpg.jpg",
				  ],
				  [
				    "test-no-profile-png.png",
				    "test-no-profile-png.webp",
				  ],
				  [
				    "test-no-profile-psd.psd",
				    "test-no-profile-psd.webp",
				  ],
				  [
				    "test-no-profile-tif.tif",
				    "test-no-profile-tif.webp",
				  ],
				  [
				    "test-no-profile-webp.webp",
				    "test-no-profile-webp.webp",
				  ],
				  [
				    "test-p3-alpha-png.png",
				    "test-p3-alpha-png.webp",
				  ],
				  [
				    "test-p3-alpha-psd.psd",
				    "test-p3-alpha-psd.webp",
				  ],
				  [
				    "test-p3-alpha-webp.webp",
				    "test-p3-alpha-webp.webp",
				  ],
				  [
				    "test-p3-avif.avif",
				    "test-p3-avif.avif",
				  ],
				  [
				    "test-p3-heic.heic",
				    "test-p3-heic.webp",
				  ],
				  [
				    "test-p3-jpg.jpg",
				    "test-p3-jpg.jpg",
				  ],
				  [
				    "test-p3-png.png",
				    "test-p3-png.webp",
				  ],
				  [
				    "test-p3-psd.psd",
				    "test-p3-psd.webp",
				  ],
				  [
				    "test-p3-tif.tif",
				    "test-p3-tif.webp",
				  ],
				  [
				    "test-p3-webp.webp",
				    "test-p3-webp.webp",
				  ],
				  [
				    "test-srgb-avif.avif",
				    "test-srgb-avif.avif",
				  ],
				  [
				    "test-srgb-heic.heic",
				    "test-srgb-heic.webp",
				  ],
				  [
				    "test-srgb-jpg.jpg",
				    "test-srgb-jpg.jpg",
				  ],
				  [
				    "test-srgb-png.png",
				    "test-srgb-png.webp",
				  ],
				  [
				    "test-srgb-psd.psd",
				    "test-srgb-psd.webp",
				  ],
				  [
				    "test-srgb-tif.tif",
				    "test-srgb-tif.webp",
				  ],
				  [
				    "test-srgb-webp.webp",
				    "test-srgb-webp.webp",
				  ],
				]
			`)

			// Expect files to have retained their color profile
			const colorProfiles = await Promise.all(
				pathPairs.map(async ([sourceFile, outputFile]) => {
					const colorProfile = await getColorProfile(outputFile)
					return `${sourceFile} --> ${path.basename(outputFile)}: ${colorProfile}`
				}),
			)
			expect(colorProfiles).toMatchInlineSnapshot(`
				[
				  "./test/assets/images/test-no-profile-avif.avif --> test-no-profile-avif.avif: sRGB IEC61966-2.1",
				  "./test/assets/images/test-no-profile-heic.heic --> test-no-profile-heic.webp: sRGB IEC61966-2.1",
				  "./test/assets/images/test-no-profile-jpg.jpg --> test-no-profile-jpg.jpg: sRGB IEC61966-2.1",
				  "./test/assets/images/test-no-profile-png.png --> test-no-profile-png.webp: sRGB IEC61966-2.1",
				  "./test/assets/images/test-no-profile-psd.psd --> test-no-profile-psd.webp: sRGB IEC61966-2.1",
				  "./test/assets/images/test-no-profile-tif.tif --> test-no-profile-tif.webp: sRGB IEC61966-2.1",
				  "./test/assets/images/test-no-profile-webp.webp --> test-no-profile-webp.webp: sRGB IEC61966-2.1",
				  "./test/assets/images/test-p3-alpha-png.png --> test-p3-alpha-png.webp: Display P3",
				  "./test/assets/images/test-p3-alpha-psd.psd --> test-p3-alpha-psd.webp: Display P3",
				  "./test/assets/images/test-p3-alpha-webp.webp --> test-p3-alpha-webp.webp: Display P3",
				  "./test/assets/images/test-p3-avif.avif --> test-p3-avif.avif: Display P3",
				  "./test/assets/images/test-p3-heic.heic --> test-p3-heic.webp: Display P3",
				  "./test/assets/images/test-p3-jpg.jpg --> test-p3-jpg.jpg: Display P3",
				  "./test/assets/images/test-p3-png.png --> test-p3-png.webp: Display P3",
				  "./test/assets/images/test-p3-psd.psd --> test-p3-psd.webp: Display P3",
				  "./test/assets/images/test-p3-tif.tif --> test-p3-tif.webp: Display P3",
				  "./test/assets/images/test-p3-webp.webp --> test-p3-webp.webp: Display P3",
				  "./test/assets/images/test-srgb-avif.avif --> test-srgb-avif.avif: sRGB IEC61966-2.1",
				  "./test/assets/images/test-srgb-heic.heic --> test-srgb-heic.webp: sRGB IEC61966-2.1",
				  "./test/assets/images/test-srgb-jpg.jpg --> test-srgb-jpg.jpg: sRGB IEC61966-2.1",
				  "./test/assets/images/test-srgb-png.png --> test-srgb-png.webp: sRGB IEC61966-2.1",
				  "./test/assets/images/test-srgb-psd.psd --> test-srgb-psd.webp: sRGB IEC61966-2.1",
				  "./test/assets/images/test-srgb-tif.tif --> test-srgb-tif.webp: sRGB IEC61966-2.1",
				  "./test/assets/images/test-srgb-webp.webp --> test-srgb-webp.webp: sRGB IEC61966-2.1",
				]
			`)

			// Expect files to have retained their metadata
			const exif = await Promise.all(
				pathPairs.map(async ([sourceFile, outputFile]) => {
					const validExif = await validateTags(outputFile)
					return `${path.basename(sourceFile)} --> ${path.basename(outputFile)}: ${validExif ? 'valid' : 'invalid'}`
				}),
			)
			expect(exif).toMatchInlineSnapshot(`
				[
				  "test-no-profile-avif.avif --> test-no-profile-avif.avif: valid",
				  "test-no-profile-heic.heic --> test-no-profile-heic.webp: valid",
				  "test-no-profile-jpg.jpg --> test-no-profile-jpg.jpg: valid",
				  "test-no-profile-png.png --> test-no-profile-png.webp: valid",
				  "test-no-profile-psd.psd --> test-no-profile-psd.webp: valid",
				  "test-no-profile-tif.tif --> test-no-profile-tif.webp: valid",
				  "test-no-profile-webp.webp --> test-no-profile-webp.webp: valid",
				  "test-p3-alpha-png.png --> test-p3-alpha-png.webp: valid",
				  "test-p3-alpha-psd.psd --> test-p3-alpha-psd.webp: valid",
				  "test-p3-alpha-webp.webp --> test-p3-alpha-webp.webp: valid",
				  "test-p3-avif.avif --> test-p3-avif.avif: valid",
				  "test-p3-heic.heic --> test-p3-heic.webp: valid",
				  "test-p3-jpg.jpg --> test-p3-jpg.jpg: valid",
				  "test-p3-png.png --> test-p3-png.webp: valid",
				  "test-p3-psd.psd --> test-p3-psd.webp: valid",
				  "test-p3-tif.tif --> test-p3-tif.webp: valid",
				  "test-p3-webp.webp --> test-p3-webp.webp: valid",
				  "test-srgb-avif.avif --> test-srgb-avif.avif: valid",
				  "test-srgb-heic.heic --> test-srgb-heic.webp: valid",
				  "test-srgb-jpg.jpg --> test-srgb-jpg.jpg: valid",
				  "test-srgb-png.png --> test-srgb-png.webp: valid",
				  "test-srgb-psd.psd --> test-srgb-psd.webp: valid",
				  "test-srgb-tif.tif --> test-srgb-tif.webp: valid",
				  "test-srgb-webp.webp --> test-srgb-webp.webp: valid",
				]
			`)
		},
	)
})

describe('resize', () => {
	itTempDirectory(`matches size correctly`, { timeout: 600_000 }, async ({ tempDirectory }) => {
		const file1 = './test/assets/industry-focus-render-detail.png'
		const file2 = './test/assets/industry-focus-render-detail-small.png'
		console.log('----------------------------------')
		console.log(tempDirectory)
		const { image1Png, image2Png } = await getTwoIdenticallySizedPng(file1, file2)
		console.log(image1Png)
		console.log(image2Png)
		const identical = await isIdenticalSize(image1Png, image2Png)
		console.log(await getImageDimensions(image1Png))
		console.log(await getImageDimensions(image2Png))
		console.log(`identical: ${identical}`)
	})
})
