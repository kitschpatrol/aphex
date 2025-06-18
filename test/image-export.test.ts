import fs from 'node:fs/promises'
import { describe, expect } from 'vitest'
import { exportViaAppleScriptGui } from '../src/pipeline/engines/applescript-gui'
import { exportViaOsxphotos } from '../src/pipeline/engines/osxphotos'
import { exportViaSwiftPhotoKit } from '../src/pipeline/engines/swift-photokit'
import { exportPhoto, exportPhotoAlbum } from '../src/pipeline/export-photo'
import { tempDirectoryFixture } from './utilities/temp-directory'

describe('photo export via photokit engine', () => {
	// Skipped since it can only run in an external terminal due to photo library
	// permission issues
	tempDirectoryFixture.skip(
		'exports a specific photo using photokit-export',
		{ timeout: 30_000 },
		async ({ tempDirectory }) => {
			await exportViaSwiftPhotoKit('77758382-025A-446E-91C6-88A0BCAFDA91', tempDirectory, {
				mode: 'requestimage',
			})
			const files = await fs.readdir(tempDirectory)
			expect(files).toMatchInlineSnapshot(`
				[
				  "77758382-025A-446E-91C6-88A0BCAFDA91.png",
				]
			`)

			await exportViaSwiftPhotoKit('77758382-025A-446E-91C6-88A0BCAFDA91', tempDirectory, {
				mode: 'requestimagedataandorientation',
			})
			const files2 = await fs.readdir(tempDirectory)
			expect(files2).toMatchInlineSnapshot(`
				[
				  "77758382-025A-446E-91C6-88A0BCAFDA91.png",
				]
			`)
		},
	)
})

describe('export via applescript-gui engine', () => {
	tempDirectoryFixture(
		'exports a specific photo via applescript-gui',
		{ timeout: 20_000 },
		async ({ tempDirectory }) => {
			console.log(tempDirectory)
			await exportViaAppleScriptGui('77758382-025A-446E-91C6-88A0BCAFDA91', tempDirectory)
			const files = await fs.readdir(tempDirectory)
			expect(files).toMatchInlineSnapshot(`
					[
					  "A86A2346.jpeg",
					]
				`)
		},
	)

	tempDirectoryFixture(
		'exports a specific album via applescript-gui',
		{ timeout: 20_000 },
		async ({ tempDirectory }) => {
			console.log(tempDirectory)
			await exportViaAppleScriptGui('7E88CFFA-D1E9-4D1C-87F8-FA8AECB68686', tempDirectory)
			const files = await fs.readdir(tempDirectory)
			expect(files).toMatchInlineSnapshot(`
				[
					"20200205_ABB_All_Parts_Wired.jpeg",
					"A86A2318.jpeg",
					"A86A2346.jpeg",
					"A86A2406 copy.jpeg",
					"IBM Tangibles Prototype Photo.jpeg",
					"IMG_8938.jpeg",
					"img_2569.jpeg",
					"test.jpeg",
				]
			`)
		},
	)
})

describe('export via osxphotos engine', () => {
	tempDirectoryFixture(
		'exports a specific photo using osxphotos',
		{ timeout: 20_000 },
		async ({ tempDirectory }) => {
			const result = await exportViaOsxphotos('77758382-025A-446E-91C6-88A0BCAFDA91', tempDirectory)

			expect(result[0]).toContain('77758382-025A-446E-91C6-88A0BCAFDA91.jpeg')
		},
	)

	// TODO
	// tempDirectoryFixture(
	// 	'exports a specific album using osxphotos',
	// 	{ timeout: 20_000 },
	// 	async ({ tempDirectory }) => {
	// 		const result = await exportViaOsxphotos(
	// 			'77758382-025A-446E-91C6-88A0BCAFDA91',
	// 			tempDirectory,
	// 		)

	// 		expect(result[0]).toContain('77758382-025A-446E-91C6-88A0BCAFDA91.jpeg')
	// 	},
	// )
})

describe('export via generic abstraction', () => {
	tempDirectoryFixture(
		'exports a specific photo using generic export abstraction',
		{ timeout: 20_000 },
		async ({ tempDirectory }) => {
			await exportPhoto('77758382-025A-446E-91C6-88A0BCAFDA91', tempDirectory)
			const files = await fs.readdir(tempDirectory)
			expect(files).toMatchInlineSnapshot(`
				[
				  "lab-4.png",
				]
			`)
		},
	)

	tempDirectoryFixture(
		'exports a specific album using generic export abstraction',
		{ timeout: 200_000 },
		async ({ tempDirectory }) => {
			console.log(tempDirectory)

			await exportPhotoAlbum('test-album', tempDirectory)
			const files = await fs.readdir(tempDirectory)
			expect(files).toMatchInlineSnapshot(`
				[
				  "kit-of-parts-render-outline.png",
				  "lab-4.png",
				  "lab-5.webp",
				  "overview.png",
				  "pool-4.png",
				  "prototype.png",
				  "test-psd.png",
				]
			`)
		},
	)
})

describe('export and process via generic abstraction', () => {
	tempDirectoryFixture.skip(
		'exports and processes a specific photo using generic export abstraction',
		{ timeout: 40_000 },
		async ({ tempDirectory }) => {
			console.log(tempDirectory)
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

			expect(exportedPhoto.processOptions).toMatchInlineSnapshot()

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
			console.log(tempDirectory)
			await exportPhotoAlbum('test-album', tempDirectory, undefined, {
				maxDimensionsPixels: {
					width: 800,
					height: 600,
				},
			})

			const files = await fs.readdir(tempDirectory)
			expect(files).toMatchInlineSnapshot()
		},
	)
})
