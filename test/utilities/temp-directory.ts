import fs from 'node:fs/promises'
import { test } from 'vitest'
import { getTempDirectory } from '../../src/utilities/file'
import { openFolder } from './open-folder'

// Via https://sdorra.dev/posts/2024-02-12-vitest-tmpdir

type TempDirectoryFixture = {
	tempDirectory: string
}

const cleanUp = false
const openDirectory = true

export const tempDirectoryFixture = test.extend<TempDirectoryFixture>({
	// eslint-disable-next-line no-empty-pattern
	async tempDirectory({}, use) {
		const directory = await getTempDirectory('unit-test')

		await use(directory)

		// eslint-disable-next-line ts/no-unnecessary-condition
		if (openDirectory) {
			await openFolder(directory)
		}

		// eslint-disable-next-line ts/no-unnecessary-condition
		if (cleanUp) {
			await fs.rm(directory, { recursive: true })
		}
	},
})
