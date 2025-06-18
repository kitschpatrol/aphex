import fs from 'node:fs/promises'
import { describe, expect } from 'vitest'
import { exportViaOsxphotos } from '../src/pipeline/engines/osxphotos'
import { exportViaSwiftPhotoKit } from '../src/pipeline/engines/swift-photokit'
import { exportPhoto, exportPhotoAlbum } from '../src/pipeline/export-photo'
import { tempDirectoryFixture } from './utilities/temp-directory'

describe('photo export via photokit', () => {
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

	describe('photo export via osxphotos', () => {
		tempDirectoryFixture(
			'exports a specific photo using osxphotos',
			{ timeout: 20_000 },
			async ({ tempDirectory }) => {
				const result = await exportViaOsxphotos(
					'77758382-025A-446E-91C6-88A0BCAFDA91',
					tempDirectory,
				)

				expect(result[0]).toContain('77758382-025A-446E-91C6-88A0BCAFDA91.jpeg')
			},
		)
	})

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
})

describe('photo album export', () => {
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
