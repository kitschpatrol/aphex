import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const photosPath = join(homedir(), 'Pictures/Photos Library.photoslibrary')

try {
	const contents = readdirSync(photosPath)
	console.log(`Photos library contains ${contents.length} items`)
} catch (error) {
	if (error instanceof Error) {
		console.log('Permission error:', error.message)
	} else {
		console.log('Permission error:', error)
	}
}
