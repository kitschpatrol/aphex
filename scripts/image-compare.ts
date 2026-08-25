#!/usr/bin/env -S pnpm tsx

import { sipsTempCleanup } from '../src/utilities/general'
import { calculateSimilarity } from '../src/utilities/image/compare'

/**
 * Calculates the similarity between two images using the `calculateSimilarity`
 * function, and prints the results of the similarity calculation in JSON
 * format.
 */
async function main() {
	// Get two positional arguments from the command line
	const arg1 = process.argv[2]
	const arg2 = process.argv[3]

	if (arg1 === undefined || arg2 === undefined) {
		console.error('Usage: image-compare.ts <image1> <image2>')
		return
	}

	console.log(`Comparing ${arg1} and ${arg2}`)

	// Calculate the similarity between the two images
	const results = await calculateSimilarity(arg1, arg2)

	await sipsTempCleanup()

	// Print the results
	console.log(JSON.stringify(results, undefined, 2))
}

await main()
