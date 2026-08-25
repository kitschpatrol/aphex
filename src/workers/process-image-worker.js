/* eslint-disable ts/no-unsafe-member-access */
/* eslint-disable ts/no-unsafe-call */
/* eslint-disable ts/no-unsafe-return */
/* eslint-disable ts/no-unsafe-assignment */

/**
 * Worker function for processing images in a separate thread
 *
 * Note: Each worker spawns its own exiftool instance via the centralized
 * exiftool module. These are managed by Piscina's worker lifecycle - when the
 * worker terminates, the exiftool process exit handlers will clean up.
 *
 * @param {object} params - Worker parameters
 * @param {string} params.destinationDirectory - Directory where processed image
 *   will be saved
 * @param {import('../pipeline/image-process.ts').ProcessImageOptions} params.options
 *   - Image processing options
 *
 * @param {string} params.sourceImagePath - Path to the source image file
 * @param {boolean} params.verbose - Whether to log verbose output
 *
 * @returns {Promise<
 * 	import('../pipeline/image-process.ts').ProcessImageResult
 * >}
 *   Processing result with input/output info and report
 */
export default async function worker({ destinationDirectory, options, sourceImagePath, verbose }) {
	// Weird workaround after issues with ESM imports in worker threads and more recent versions of Node / TSX / Piscina / etc?
	// ts-node didn't work
	const importx = await import('importx')
	const { processImage } = await importx.import('../index', import.meta.url)

	if (verbose) {
		console.log(`Processing image on worker thread:\n${sourceImagePath}`)
	}

	const result = await processImage(sourceImagePath, destinationDirectory, options)
	if (verbose) {
		console.log(
			`Finished processing image on worker thread:\n${sourceImagePath}\nTime:\n${result.report.durationMs / 1000} seconds`,
		)
	}

	return result
}
