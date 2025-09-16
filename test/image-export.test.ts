import fs from 'node:fs/promises'
import { describe, expect } from 'vitest'
import { exportApplePhoto, exportPhotoAlbum } from '../src/pipeline/image-export'
import { processPhotos } from '../src/pipeline/image-process'
import { getSamplePhotoUuid } from './utilities/photos'
import { tempDirectoryFixture } from './utilities/temp-directory'

describe('export via generic abstraction', () => {
	tempDirectoryFixture(
		'exports a specific photo using generic export abstraction without processing',
		{ timeout: 20_000 },
		async ({ tempDirectory }) => {
			const uuid = await getSamplePhotoUuid(false, true)
			const result = await exportApplePhoto(uuid, tempDirectory)
			expect(Object.keys(result)).toMatchInlineSnapshot(`
				[
				  "exportEngine",
				  "exportOptions",
				  "path",
				  "photoInfo",
				]
			`)
		},
	)

	//
	// tempDirectoryFixture(
	// 	'exports a specific album using generic export abstraction',
	// 	{ timeout: 200_000 },
	// 	async ({ tempDirectory }) => {
	// 		console.log(tempDirectory)

	// 		await exportPhotoAlbum('test-album', tempDirectory)
	// 		const files = await fs.readdir(tempDirectory)
	// 		expect(files).toMatchInlineSnapshot(`
	// 			[
	// 			  "kit-of-parts-render-outline.png",
	// 			  "lab-4.png",
	// 			  "lab-5.webp",
	// 			  "overview.png",
	// 			  "pool-4.png",
	// 			  "prototype.png",
	// 			  "test-psd.png",
	// 			]
	// 		`)
	// 	},
	// )
})

describe('export and process', () => {
	tempDirectoryFixture(
		'exports a specific photo using generic export abstraction without processing',
		{ timeout: 20_000 },
		async ({ tempDirectory }) => {
			const uuid = await getSamplePhotoUuid(false, true)
			const result = await exportApplePhoto(uuid, tempDirectory)
			const { path } = result

			const processResult = await processPhotos([path], tempDirectory)
			console.log(processResult)
		},
	)
})

describe('export and process via generic abstraction', () => {
	tempDirectoryFixture(
		'exports and processes a specific photo using generic export abstraction',
		{ timeout: 40_000 },
		async ({ tempDirectory }) => {
			const exportedPhoto = await exportPhoto(
				'77758382-025A-446E-91C6-88A0BCAFDA91',
				tempDirectory,
				undefined,
				{
					maxDimensionsPixels: {
						width: 800,
						height: 600,
					},
				},
			)

			expect(exportedPhoto.processOptions).toMatchInlineSnapshot(`
				{
				  "defaultColorProfile": "sRGB IEC61966-2.1",
				  "forceCompression": true,
				  "logSimilarity": true,
				  "losslessFormat": "webp",
				  "losslessFormatAlpha": "png",
				  "lossyFormat": "jpeg",
				  "lossyFormatAlpha": "webp",
				  "lossyQuality": 0.95,
				  "maxDimensionsPixels": {
				    "height": 600,
				    "width": 800,
				  },
				  "maxFileSizeBytes": 15000000,
				  "nearLosslessFormat": "none",
				  "nearLosslessFormatAlpha": "none",
				  "passthroughFormats": [
				    "webp",
				    "jpeg",
				  ],
				  "preserveColorProfiles": [
				    "sRGB IEC61966-2.1",
				  ],
				}
			`)

			const files = await fs.readdir(tempDirectory)
			expect(files).toMatchInlineSnapshot(`
				[
				  "lab-4.webp",
				]
			`)
		},
	)

	tempDirectoryFixture(
		'exports and processes a specific album using generic export abstraction',
		{ timeout: 120_000 },
		async ({ tempDirectory }) => {
			await exportPhotoAlbum('test-album', tempDirectory, undefined, {
				maxDimensionsPixels: {
					width: 800,
					height: 600,
				},
			})

			const files = await fs.readdir(tempDirectory)
			expect(files).toMatchInlineSnapshot(`
				[
				  "kit-of-parts-render-outline.webp",
				  "lab-4.webp",
				  "lab-5.webp",
				  "overview-2.webp",
				  "overview.webp",
				  "pool-4.webp",
				  "prototype.webp",
				  "test.webp",
				]
			`)
		},
	)
})
