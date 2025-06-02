/* eslint-disable ts/no-unsafe-member-access */
/* eslint-disable ts/no-unsafe-call */
/* eslint-disable ts/no-unsafe-return */
/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable ts/no-unsafe-assignment */

export default async function worker({ destinationDirectory, options, sourceImagePath }) {
	// Weird workaround after issues with ESM imports in worker threads and more recent versions of Node / TSX / Piscina / etc?
	// ts-node didn't work
	const { processImage } = await import('importx').then(async (x) =>
		x.import('../process.ts', import.meta.url),
	)

	console.log(`Processing image on worker thread:\n${sourceImagePath}`)

	const result = await processImage(sourceImagePath, destinationDirectory, options)
	console.log(
		`Finished processing image on worker thread:\n${sourceImagePath}\nTime:\n${result.report.durationMs / 1000} seconds`,
	)
	return result
}
