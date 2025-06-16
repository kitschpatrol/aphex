import fs from 'node:fs/promises'
import { describe, expect } from 'vitest'
import { exportViaSwiftPhotoKit } from '../src/engines/swift-photokit'
import { tempDirectoryFixture } from './utilities/temp-directory'

describe('photo library export', () => {
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
