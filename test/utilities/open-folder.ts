import { execa } from 'execa'

/**
 * Open a folder in the Finder.
 *
 * @param folder - The folder to open.
 */
export async function openFolder(folder: string) {
	await execa('open', [folder])
}
