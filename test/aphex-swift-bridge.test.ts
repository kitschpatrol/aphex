import { describe, expect, it } from 'vitest'
import { aphexAlbumInfo, aphexExport, aphexPhotoInfo } from '../src/aphex-swift/cli-bridge'
import { tempDirectoryFixture } from './utilities/temp-directory'

// Assumes your system library:
// Has one or more favorite photo
// One of the favorite photos has a title set

describe('aphex-swift-bridge', () => {
	it('gets album info', async () => {
		const albumInfo = await aphexAlbumInfo('/Recents')

		expect(albumInfo.length).toBe(1)

		expect(Object.keys(albumInfo.at(0)!)).toMatchInlineSnapshot(`
			[
			  "dateEnd",
			  "dateStart",
			  "estimatedAssetCount",
			  "path",
			  "subtype",
			  "title",
			  "type",
			  "uuid",
			]
		`)
	})

	it('gets photo info for album', { timeout: 60_000 }, async () => {
		const photoInfo = await aphexPhotoInfo('/Favorites')
		expect(photoInfo.length).toBeGreaterThan(0)
	})

	it('gets photo info for filename', { timeout: 60_000 }, async () => {
		// Get a representative photo filename
		const photoInfo = await aphexPhotoInfo('/Favorites')
		expect(photoInfo.length).toBeGreaterThan(0)
		const originalFilename = photoInfo.at(0)?.original.fileName
		expect(originalFilename).toBeDefined()

		// Make sure we can look it up
		const specificPhotoInfo = await aphexPhotoInfo(`/Favorites/${originalFilename}`)
		expect(specificPhotoInfo.length).toBe(1)
		expect(specificPhotoInfo.at(0)?.original.fileName).toBe(originalFilename)
	})

	it('gets photo info for uuid', { timeout: 60_000 }, async () => {
		// Get a representative photo filename
		const photoInfo = await aphexPhotoInfo('/Favorites')
		expect(photoInfo.length).toBeGreaterThan(0)
		const uuid = photoInfo.at(0)?.uuid
		expect(uuid).toBeDefined()

		// Make sure we can look it up
		const specificPhotoInfo = await aphexPhotoInfo(uuid!)
		expect(specificPhotoInfo.length).toBe(1)
		expect(specificPhotoInfo.at(0)?.uuid).toBe(uuid)
	})

	tempDirectoryFixture(
		'exports single photo by uuid',
		{ timeout: 60_000 },
		async ({ tempDirectory }) => {
			// Get a representative photo filename
			const photoInfo = await aphexPhotoInfo('/Favorites')
			expect(photoInfo.length).toBeGreaterThan(0)
			const uuid = photoInfo.at(0)?.uuid
			expect(uuid).toBeDefined()

			// Export it
			const exportReport = await aphexExport(uuid!, tempDirectory)
			expect(exportReport.length).toBe(1)
		},
	)
})
