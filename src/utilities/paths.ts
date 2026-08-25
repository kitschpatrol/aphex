import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Import.meta.dirname for Node >= 20.19.0
 *
 * @example
 * 	getDirname(import.meta)
 */
export function getDirname(meta: ImportMeta): string {
	// Workaround for lack of import.meta context when called from Piscina workers
	// See image-process.ts
	return path.dirname(fileURLToPath(process.env.PISCINA_WORKER_META_URL ?? meta.url))
}

/**
 * "Root" of package or distribution folder e.g. Development:
 * /Users/mika/Code/aphex Production: /Users/mika/Code/aphex/dist
 */
export function getPackageBasePath(meta: ImportMeta): string {
	const dirname = getDirname(meta)
	return path.basename(dirname) === 'dist' ? path.join(dirname) : path.join('.')
}

/**
 * Asset directory path of package or distribution folder (Copied by tsdown)
 */
export function getPackageAssetsPath(meta: ImportMeta): string {
	const dirname = getDirname(meta)
	return path.basename(dirname) === 'dist'
		? path.join(dirname, 'assets')
		: path.join('src', 'assets')
}

/**
 * Asset directory path of package or distribution folder (Copied by tsdown)
 */
export function getPackageWorkersPath(meta: ImportMeta): string {
	const dirname = getDirname(meta)
	return path.basename(dirname) === 'dist'
		? path.join(dirname, 'workers')
		: path.join(dirname, '..', 'workers')
}

/**
 * Binary directory path of package or distribution folder (Copied by native
 * build script)
 */
export function getPackageBinPath(meta: ImportMeta): string {
	const dirname = getDirname(meta)
	return path.basename(dirname) === 'dist' ? path.join(dirname) : path.join('dist')
}
