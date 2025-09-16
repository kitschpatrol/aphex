#!/usr/bin/env -S pnpm tsx

// Reads through all image assets export by the image processor and aggregates /
// analyzes  metadata statistics

import is from '@sindresorhus/is'
import { exiftool } from 'exiftool-vendored'
import fse from 'fs-extra'
import { globby } from 'globby'
import path from 'node:path'
import prettyBytes from 'pretty-bytes'
import prettyMs from 'pretty-ms'
import type { ImageMimeType } from '../src/utilities/image/mime'
import { getTags } from '../src/utilities/image/tags'

function average(array: number[]): number {
	return array.reduce((a, b) => a + b, 0) / array.length
}

function frequency(array: string[]): Record<string, number> {
	const frequencyAccumulator: Record<string, number> = {}
	for (const value of array) {
		frequencyAccumulator[value] = (frequencyAccumulator[value] ?? 0) + 1
	}

	return frequencyAccumulator
}

function prettyPrintDictionaryWithPercentageParenthetical(
	dictionary: Record<string, number>,
): string {
	const total = Object.values(dictionary).reduce((a, b) => a + b, 0)
	return Object.entries(dictionary)
		.map(([key, value]) => `\t${key}: ${value} (${((value / total) * 100).toFixed(0)}%)`)
		.join('\n')
}

function sortDictionaryByKeys(dictionary: Record<string, number>): Record<string, number> {
	return (
		Object.keys(dictionary)
			// TODO revisit this
			// eslint-disable-next-line unicorn/no-array-sort
			.sort()
			// eslint-disable-next-line unicorn/no-array-reduce
			.reduce<Record<string, number>>((acc, key) => {
				acc[key] = dictionary[key]!
				return acc
			}, {})
	)
}

function prettyPrintDictionary(dictionary: Record<PropertyKey, unknown>): string {
	return Object.entries(dictionary)
		.map(([key, value]) => {
			if (is.plainObject(value)) {
				return `\t${key}:\n${prettyPrintDictionary(value)
					.split('\n')
					.map((line) => `\t${line}`)
					.join('\n')}`
			}

			return `\t${key}: ${String(value)}`
		})
		.join('\n')
}

function objectContentsEqual(
	object1: Record<string, unknown>,
	object2: Record<string, unknown>,
): boolean {
	return JSON.stringify(object1) === JSON.stringify(object2)
}

async function generateAudit(paths: string[]): Promise<string> {
	let sizeTotalOriginal = 0
	let sizeTotalCompressed = 0
	let totalDuration = 0
	const imagesFound = paths.length
	let validImages = 0
	let processingOptions: ProcessMetadata['options']['process'] | undefined
	let exportOptions: ProcessMetadata['options']['export'] | undefined
	const compressionResults: string[] = []
	const engineResults: string[] = []
	const editedResults: string[] = []
	const durationResults: number[] = []
	const percentResults: number[] = []
	const mimeResultsInput: ImageMimeType[] = []
	const mimeResultsOutput: ImageMimeType[] = []
	const dssimResults: number[] = []
	const ssimResults: number[] = []
	const psnrResults: number[] = []
	let exportOptionsVary = false
	let processingOptionsVary = false

	for (const [index, path] of paths.entries()) {
		console.log(`Auditing ${index + 1} / ${paths.length} "${path}"`)

		const { processMetadata: metadata } = await getTags(path)

		if (metadata !== undefined) {
			validImages += 1
			sizeTotalOriginal += metadata.input.sizeBytes
			sizeTotalCompressed += metadata.output.sizeBytes
			totalDuration += metadata.report.durationMs

			if (exportOptions === undefined) {
				exportOptions = metadata.options.export
			} else if (
				!exportOptionsVary &&
				!objectContentsEqual(exportOptions, metadata.options.export)
			) {
				exportOptionsVary = true
			}

			if (processingOptions === undefined) {
				processingOptions = metadata.options.process
			} else if (
				!processingOptionsVary &&
				!objectContentsEqual(processingOptions, metadata.options.process)
			) {
				processingOptionsVary = true
			}

			const compressionPercent = (metadata.output.sizeBytes / metadata.input.sizeBytes) * 100
			percentResults.push(compressionPercent)

			mimeResultsInput.push(metadata.input.mime)
			mimeResultsOutput.push(metadata.output.mime)
			compressionResults.push(metadata.report.compression)
			engineResults.push(metadata.exportEngine)
			editedResults.push(metadata.photoInfo.edited === undefined ? 'Original' : 'Edited')
			durationResults.push(metadata.report.durationMs)

			if (metadata.report.similarity !== undefined) {
				dssimResults.push(metadata.report.similarity.dssim)
				ssimResults.push(metadata.report.similarity.ssim)
				psnrResults.push(metadata.report.similarity.psnr)
			}
		}
	}

	const logLines: string[] = [`Audit generated at: ${new Date().toISOString()}`]

	if (validImages === 0) {
		logLines.push(`No valid images found.`)
	} else {
		logLines.push(
			exportOptions === undefined
				? 'No export options found.'
				: exportOptionsVary
					? 'Export options: Various'
					: `Export options:\n${prettyPrintDictionary(exportOptions)}`,
			processingOptions === undefined
				? 'No processing options found.'
				: processingOptionsVary
					? 'Processing options: Various'
					: `Processing options:\n${prettyPrintDictionary(processingOptions)}`,
			`Images with processing metadata: ${validImages} / ${imagesFound} (${((validImages / imagesFound) * 100).toFixed(0)}%)`,
			`Total processing time: ${prettyMs(totalDuration)}`,
			`Average processing time: ${prettyMs(average(durationResults))}`,
			`Average compression: ${Math.round(average(percentResults))}%`,
			`Total original size: ${prettyBytes(sizeTotalOriginal)}`,
			`Total compressed size: ${prettyBytes(sizeTotalCompressed)}`,
			`Average DSSIM: ${average(dssimResults)}`,
			`Average SSIM: ${average(ssimResults)}`,
			`Average PSNR: ${average(psnrResults)}`,
			`MIME Input Counts:\n${prettyPrintDictionaryWithPercentageParenthetical(sortDictionaryByKeys(frequency(mimeResultsInput)))}`,
			`MIME Output Counts:\n${prettyPrintDictionaryWithPercentageParenthetical(sortDictionaryByKeys(frequency(mimeResultsOutput)))}`,
			`Compression counts:\n${prettyPrintDictionaryWithPercentageParenthetical(sortDictionaryByKeys(frequency(compressionResults)))}`,
			`Engine counts:\n${prettyPrintDictionaryWithPercentageParenthetical(sortDictionaryByKeys(frequency(engineResults)))}`,
			`Edited counts:\n${prettyPrintDictionaryWithPercentageParenthetical(sortDictionaryByKeys(frequency(editedResults)))}`,
		)
	}

	console.log('Audit complete.')
	return logLines.join('\n')
}

async function main() {
	const paths = await globby([`${process.cwd()}/photos-export-audit-results/**/*`])
	const audit = await generateAudit(paths)
	const logDirectory = path.join(process.cwd(), 'image-audit-logs')

	await fse.mkdir(logDirectory, { recursive: true })

	const logPath = path.join(logDirectory, `image-audit-${Date.now()}.txt`)
	await fse.writeFile(logPath, audit)
	console.log(`Audit saved to ${logPath}`)
	await exiftool.end()
}

await main()
