import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * import.meta.dirname for Node >= 20.19.0
 * @example getDirname(import.meta)
 */
export function getDirname(meta: ImportMeta): string {
	return dirname(fileURLToPath(meta.url))
}

/**
 * "Root" of package or distribution folder
 * e.g.
 * Development: /Users/mika/Code/aphex
 * Production: /Users/mika/Code/aphex/dist
 */
export function getPackageBasePath(meta: ImportMeta): string {
	const dirname = getDirname(meta)
	return path.basename(dirname) === 'dist' ? path.join(dirname) : path.join('.')
}

/**
 * Asset directory path of package or distribution folder (Copied to by)
 */
export function getPackageAssetsPath(meta: ImportMeta): string {
	const dirname = getDirname(meta)
	return path.basename(dirname) === 'dist'
		? path.join(dirname, 'assets')
		: path.join('src', 'assets')
}

/**
 * Binary directory path of package or distribution folder
 */
export function getPackageBinPath(meta: ImportMeta): string {
	const dirname = getDirname(meta)
	return path.basename(dirname) === 'dist' ? path.join(dirname) : path.join('dist')
}
