import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { exportViaAppleScript } from '../src/pipeline/engines/applescript'
import { exportViaAppleScriptGui } from '../src/pipeline/engines/applescript-gui'
import { exportViaFileSystem } from '../src/pipeline/engines/file-system'
import { exportViaSwiftPhotoKit } from '../src/pipeline/engines/swift-photokit'
import { getSamplePhotoPermutations } from './utilities/photos'

describe('export engines', () => {
	it('exports via swift photokit', async () => {
		const uuids = await getSamplePhotoPermutations()
		const results: string[] = []
		for (const uuid of uuids) {
			results.push(await exportViaSwiftPhotoKit(uuid))
		}

		expect(results.length).toBe(4)
		await fs.rm(path.dirname(results[0]!), { recursive: true })
	})

	it('exports via file system', async () => {
		const uuids = await getSamplePhotoPermutations()
		const results: string[] = []
		for (const uuid of uuids) {
			results.push(await exportViaFileSystem(uuid))
		}

		expect(results.length).toBe(4)
		await fs.rm(path.dirname(results[0]!), { recursive: true })
	})

	it(
		'exports via applescript gui',
		{
			timeout: 120_000,
		},
		async () => {
			const uuids = await getSamplePhotoPermutations()
			const results: string[] = []
			for (const uuid of uuids) {
				results.push(...(await exportViaAppleScriptGui(uuid)))
			}

			expect(results.length).toBe(4)
			await fs.rm(path.dirname(results[0]!), { recursive: true })
		},
	)

	it(
		'exports via applescript',
		{
			timeout: 120_000,
		},
		async () => {
			const uuids = await getSamplePhotoPermutations()
			const results: string[] = []
			for (const uuid of uuids) {
				results.push(await exportViaAppleScript(uuid))
			}

			expect(results.length).toBe(4)
			await fs.rm(path.dirname(results[0]!), { recursive: true })
		},
	)
})
