console.log('TODO')

// Describe('photo library export', () => {
// 	tempDirectoryFixture(
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
