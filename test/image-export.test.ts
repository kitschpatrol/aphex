import { describe, expect } from 'vitest'
import { exportApplePhoto } from '../src/pipeline/image-export'
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
