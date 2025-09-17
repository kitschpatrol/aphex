import path from 'node:path'
import { describe, expect } from 'vitest'
import { processImage } from '../src/pipeline/image-process'
import { getColorProfile } from '../src/utilities/image/color'
import { validateTags } from '../src/utilities/image/tags'
import { testFiles } from './shared'
import { tempDirectoryFixture } from './utilities/temp-directory'

describe('image processing', () => {
	tempDirectoryFixture(
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
					lossyQuality: 0.96, // See Compression Analysis.numbers (converted to 0-1 range)
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
					const { issues, valid } = await validateTags(outputFile)
					return `${path.basename(sourceFile)} --> ${path.basename(outputFile)}: ${valid ? 'valid' : `invalid: ${issues.join(', ')}`}`
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
