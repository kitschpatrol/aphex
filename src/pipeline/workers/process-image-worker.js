/* eslint-disable ts/no-unsafe-member-access */
/* eslint-disable ts/no-unsafe-call */
/* eslint-disable ts/no-unsafe-return */
/* eslint-disable ts/no-unsafe-assignment */

/**
 * Worker function for processing images in a separate thread
 * @param {object} params - Worker parameters
 * @param {string} params.destinationDirectory - Directory where processed image will be saved
 * @param {import('../image-process.ts').ProcessImageOptions} params.options - Image processing options
 * @param {string} params.sourceImagePath - Path to the source image file
 * @returns {Promise<import('../image-process.ts').ProcessImageResult>} Processing result with input/output info and report
 */
export default async function worker({ destinationDirectory, options, sourceImagePath }) {
	// Weird workaround after issues with ESM imports in worker threads and more recent versions of Node / TSX / Piscina / etc?
	// ts-node didn't work
	const { processImage } = await import('importx').then(async (x) =>
		x.import('../image-process.ts', import.meta.url),
	)

	console.log(`Processing image on worker thread:\n${sourceImagePath}`)

	const result = await processImage(sourceImagePath, destinationDirectory, options)
	console.log(
		`Finished processing image on worker thread:\n${sourceImagePath}\nTime:\n${result.report.durationMs / 1000} seconds`,
	)
	return result
}
