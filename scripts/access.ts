import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const photosPath = join(homedir(), 'Pictures/Photos Library.photoslibrary')

try {
	const contents = readdirSync(photosPath)
	console.log(`Photos library contains ${contents.length} items`)
} catch (error) {
	console.log('Permission error:', error instanceof Error ? error.message : error)
}
