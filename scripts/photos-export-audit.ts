#!/usr/bin/env -S pnpm tsx

//  Use and compare a bunch of export strategies across a set of images to
//  evaluate differences in quality and metadata preservation.
//
//  Steps:
//  1. Export a set of both original and edited images using different methods
//  2. Analyze each image and generate a JSON file with the resulting metadata
//     and quality metrics
//  3. Summarize and condense the data into a Markdown table

import { exiftool } from 'exiftool-vendored'
import fse from 'fs-extra'
import { markdownTable } from 'markdown-table'
import os from 'node:os'
import path from 'node:path'
import type { ColorProfile } from '../src/utilities/image/color'
import type { ImageInfo } from '../src/utilities/image/image'
import type { ImageMimeType } from '../src/utilities/image/mime'
import { exportViaAppleScriptGui } from '../src/engines/applescript-gui'
import { exportViaFileSystem } from '../src/engines/file-system'
import { exportViaOsxphotosExport } from '../src/engines/osxphotos-export'
import { exportViaOsxphotosPhotoKit } from '../src/engines/osxphotos-photokit'
import { exportViaOsxphotosPhotosExport } from '../src/engines/osxphotos-photos-export'
import { exportViaSwiftPhotoKit } from '../src/engines/swift-photokit-export'
import { exportViaSwiftPhotoKitOrientation } from '../src/engines/swift-photokit-export-orientation'
import { sipsTempCleanup } from '../src/utilities/general'
import { assertValidColorProfile } from '../src/utilities/image/color'
import { calculateSimilarity } from '../src/utilities/image/compare'
import { getImageInfo } from '../src/utilities/image/image'
import { getTagCount } from '../src/utilities/image/tags'

// # Export Functions

async function exportViaAppleScriptGuiWrapped(
	photoUuid: string,
	destinationDirectory: string,
	format: 'jpeg-high' | 'jpeg-max' | 'png',
): Promise<string> {
	await fse.mkdir(destinationDirectory, { recursive: true })

	// No control over exact file name in the gui, so we copy to temp first
	const tempDirectory = await fse.mkdtemp(
		path.join(os.tmpdir(), `com.ericmika.audit.${photoUuid}.`),
	)

	const result = await exportViaAppleScriptGui(photoUuid, tempDirectory, {
		colorProfile: 'Original',
		fileName: 'Use Title',
		includeLocation: true,
		includeMetadata: true,
		jpegQuality: format === 'jpeg-high' ? 'High' : 'Maximum',
		photoKind: format === 'png' ? 'PNG' : 'JPEG',
		photoSize: 'Full Size',
	})

	const tempPath = result[0]

	const destinationPath = path.join(destinationDirectory, `${photoUuid}${path.extname(tempPath)}`)
	await fse.copyFile(tempPath, destinationPath)
	await fse.rm(tempDirectory, { force: true, recursive: true })
	return destinationPath
}

async function exportPhotos(destination: string, photoUuid: string): Promise<string[]> {
	// Create the destination directory
	await fse.mkdir(destination, { recursive: true })

	// Collect the paths of all exported and copied files
	const exportedFiles: string[] = []

	exportedFiles.push(
		// Originals
		await exportViaOsxphotosExport(
			photoUuid, //
			path.join(destination, 'original-osxphotos'),
			{
				original: true,
			},
		),

		// TODO relevant? Working?
		// await exportViaOsxphotosPhotosExport(
		// 	photoUuid, //
		// 	path.join(destination, 'original-osxphotos-photos-export'),
		// 	{
		// 		original: true,
		// 	},
		// ),

		// TODO relevant? Working?
		// await exportViaOsxphotosPhotoKit(
		// 	photoUuid, //
		// 	path.join(destination, 'original-osxphotos-photo-kit'),
		// 	{
		// 		original: true,
		// 	},
		// ),

		await exportViaFileSystem(
			photoUuid, //
			path.join(destination, 'original-file-system'),
			{
				original: true,
			},
		),

		// Edited
		await exportViaAppleScriptGuiWrapped(
			photoUuid, //
			path.join(destination, 'photos-gui-png'),
			'png',
		),

		await exportViaAppleScriptGuiWrapped(
			photoUuid, //
			path.join(destination, 'photos-gui-jpeg-max'),
			'jpeg-max',
		),

		await exportViaAppleScriptGuiWrapped(
			photoUuid, //
			path.join(destination, 'photos-gui-jpeg-high'),
			'jpeg-high',
		),

		await exportViaFileSystem(
			photoUuid, //
			path.join(destination, 'file-system'),
			{
				original: false,
			},
		),

		await exportViaSwiftPhotoKit(
			photoUuid, //
			path.join(destination, 'swift-photo-kit-request-image'),
			{
				original: false,
			},
		),

		await exportViaSwiftPhotoKitOrientation(
			photoUuid, //
			path.join(destination, 'swift-photo-kit-request-image-data-and-orientation'),
			{
				original: false,
			},
		),

		await exportViaOsxphotosExport(
			photoUuid, //
			path.join(destination, 'osxphotos'),
			{
				original: false,
			},
		),

		await exportViaOsxphotosPhotoKit(
			photoUuid, //
			path.join(destination, 'osxphotos-photo-kit'),
			{
				original: false,
			},
		),

		await exportViaOsxphotosPhotosExport(
			photoUuid, //
			path.join(destination, 'osxphotos-photos-export'),
			{
				original: false,
			},
		),
	)

	return exportedFiles
}

// # Table Formatters

function formatMime(mime: ImageMimeType) {
	return mime.toUpperCase()
}

function formatColorProfile(profile: ColorProfile): string {
	if (profile === 'sRGB IEC61966-2.1') {
		return 'sRGB'
	}

	if (profile === 'Apple Wide Color Sharing Profile') {
		return 'Sharing'
	}

	return profile
}

const methodNameAndOrderMap = {
	'file-system': 'File system copy',
	'original-file-system': 'File system copy',
	osxphotos: '`osxphotos export`',
	'osxphotos-photo-kit': '`osxphotos export --photo-kit`',
	'osxphotos-photos-export': '`osxphotos export --use-photos-export`',
	'photos-gui-jpeg-high': 'Photos GUI Export JPEG High',
	'photos-gui-jpeg-max': 'Photos GUI Export JPEG Max',
	'photos-gui-png': 'Photos GUI Export PNG',
	'swift-photo-kit-request-image': 'PhotoKit `requestImage...`',
	'swift-photo-kit-request-image-data-and-orientation':
		'PhotoKit `requestImageDataAndOrientation...`',
} as const

function assertValidExportMethod(
	method: string,
): asserts method is keyof typeof methodNameAndOrderMap {
	if (!(method in methodNameAndOrderMap)) {
		throw new Error(`Unknown export method: ${method}`)
	}
}

function formatExportMethod(method: keyof typeof methodNameAndOrderMap) {
	const index = Object.keys(methodNameAndOrderMap).indexOf(method)
	const prettyName = methodNameAndOrderMap[method]
	return `${index} ${prettyName}`
}

async function getComparison(
	image: ImageReport,
	images: ImageReport[],
): Promise<{
	dssim: number
	psnr: number
	ssim: number
}> {
	const benchmarkImage = images.find(
		(otherImage) =>
			otherImage.isBenchmark &&
			otherImage.isOriginal === image.isOriginal &&
			otherImage.uuid === image.uuid,
	)

	if (benchmarkImage === undefined) {
		console.log('Benchmark image not found for:')
		console.log(JSON.stringify(image, undefined, 2))

		throw new Error('Benchmark image not found')
	}

	// Console.log(`Comparing "${image.path}" to "${benchmarkImage.path}"`)

	return calculateSimilarity(benchmarkImage.path, image.path)
}

type ImageReport = {
	exifTagCount: number
	exportMethod: keyof typeof methodNameAndOrderMap
	hasEdits: boolean
	imageInfo: ImageInfo
	isBenchmark: boolean
	isOriginal: boolean
	path: string
	similarity: {
		dssim: number
		psnr: number
		ssim: number
	}
	uuid: string
}

async function generateImageReport(exportDirectory: string): Promise<ImageReport[]> {
	const allDirectories = await fse.readdir(exportDirectory, { withFileTypes: true })

	const imageReport: ImageReport[] = []

	// First pass gets all the info
	for (const directory of allDirectories) {
		if (!directory.isDirectory()) {
			continue
		}

		const allFiles = await fse.readdir(path.join(directory.parentPath, directory.name), {
			withFileTypes: true,
		})

		for (const file of allFiles) {
			if (file.name.startsWith('.')) {
				continue
			}

			const filePath = path.join(file.parentPath, file.name)

			const exportMethod = directory.name.replace('original-', '')
			assertValidExportMethod(exportMethod)

			imageReport.push({
				exifTagCount: await getTagCount(filePath),
				exportMethod,
				hasEdits: false, // Calculated in next pass, could use an osxphotos query instead
				imageInfo: await getImageInfo(filePath),
				isBenchmark:
					directory.name === 'original-file-system' || directory.name === 'photos-gui-png',
				isOriginal: directory.name.startsWith('original'),
				path: filePath,
				// Calculated in next pass
				similarity: {
					dssim: -1,
					psnr: -1,
					ssim: -1,
				},
				uuid: path.basename(file.name, path.extname(file.name)),
			})
		}
	}

	// Second pass runs comparisons
	for (const imageData of imageReport) {
		// Calculate similarity
		imageData.similarity = await getComparison(imageData, imageReport)
	}

	// Look at similarity to determine if there are edits
	for (const imageData of imageReport) {
		const otherImage = imageReport.find(
			(otherImage) =>
				imageData.uuid === otherImage.uuid &&
				imageData.isBenchmark !== otherImage.isBenchmark &&
				otherImage.isOriginal !== imageData.isOriginal,
		)

		if (otherImage === undefined) {
			throw new Error(`Could not find comparable image for ${imageData.path}`)
		}

		imageData.hasEdits = imageData.similarity.dssim !== otherImage.similarity.dssim
	}

	return imageReport
}

// Build and render Markdown tables

function generateMarkdownTables(reports: ImageReport[]): string[] {
	// Get unique UUIDs
	const uniqueUUIDs = new Set(reports.map((image) => image.uuid))

	const markdownTables: string[] = []

	// Generate a table for each unique UUID
	for (const uuid of uniqueUUIDs) {
		const relatedImages = reports.filter((image) => image.uuid === uuid)

		// Console.log(`Test Image ID: ${uuid}`)

		// All tests have edits, confirmed that original exports are perfect
		// const hasEdits = relatedImages.some((image) => image.hasEdits)
		// Console.log(`Has Edits: ${hasEdits ? 'Yes' : 'No'}`)

		const rows: string[][] = []

		for (const relatedImage of relatedImages) {
			if (relatedImage.isOriginal && !relatedImage.isBenchmark) {
				continue
			}

			assertValidColorProfile(relatedImage.imageInfo.colorProfile)

			rows.push([
				formatExportMethod(relatedImage.exportMethod) +
					(relatedImage.isOriginal ? ' (Original)' : ''),
				formatMime(relatedImage.imageInfo.mime),
				formatColorProfile(relatedImage.imageInfo.colorProfile),
				String(relatedImage.imageInfo.sizeBytes),
				String(relatedImage.exifTagCount),
				relatedImage.isOriginal ? 'NA' : relatedImage.similarity.ssim.toFixed(3),
			])
		}

		// Sort the table by its first column
		rows.sort((a, b) => a[0].localeCompare(b[0]))

		// Trim the numbers from the start of the first column values
		for (const row of rows) {
			row[0] = row[0].replace(/^\d+ /, '')
		}

		const title = `Image ID: ${uuid}`
		const renderedTable = markdownTable(
			[['Export Method', 'Format', 'Profile', 'Size', 'EXIF Tags', 'SSIM'], ...rows],
			{ align: ['l', 'l', 'l', 'r', 'r', 'r'] },
		)

		markdownTables.push([title, renderedTable].join('\n'))
	}

	return markdownTables
}

async function main() {
	// Sample query to get UUIDs of album photos:
	// osxphotos query --only-photos --album "test-album" --json | jq '.[].uuid'

	// Test images
	const testOutputDirectory = path.join(process.cwd(), 'photos-export-audit-results')
	const testPhotosUuids = [
		'77758382-025A-446E-91C6-88A0BCAFDA91',
		// '93D1FC82-2104-4403-8D84-B178CBB4F2FA', // No edits
		'0CC54CB1-EE02-4230-80B1-D8CB8CF229CE',
		// 'BE2B24FA-0EE3-4F79-987B-041DEF4889B0', // No edits
		'B60D9534-6ADE-4BD9-83EC-A95C8DEBFB8F',
		// 'EC15075B-BFDD-4B87-8A09-53CC134CE4BD', // No edits
	]

	// Clear the test output directory
	await fse.remove(testOutputDirectory)
	await fse.mkdir(testOutputDirectory)

	// Export all test images
	const exportedFiles: string[] = []
	for (const photoUuid of testPhotosUuids) {
		const files = await exportPhotos(testOutputDirectory, photoUuid)
		exportedFiles.push(...files)
	}

	// Generate image reports
	const reports = await generateImageReport(testOutputDirectory)

	// Save the reports to a JSON file
	await fse.writeJSON(path.join(testOutputDirectory, 'report.json'), reports, { spaces: 2 })

	// Generate tables
	const markdownTables = generateMarkdownTables(reports)

	// Print the tables
	console.log(markdownTables.join('\n\n'))

	await exiftool.end()
	await sipsTempCleanup() // Maybe not needed
}

await main()
