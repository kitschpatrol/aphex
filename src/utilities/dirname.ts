import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * import.meta.dirname for Node >= 20.19.0
 * @example getDirname(import.meta)
 */
export function getDirname(meta: ImportMeta): string {
	return dirname(fileURLToPath(meta.url))
}
