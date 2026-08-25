import type { PartialDeep } from 'type-fest'
import { createDefu } from 'defu'

// Create a custom defu instance that removes duplicates from arrays
const mergeDefaultsInternal = createDefu((object, key, value) => {
	// Check if both values are arrays
	if (Array.isArray(object[key]) && Array.isArray(value)) {
		// Merge arrays and remove duplicates
		const merged = [...new Set([...object[key], ...value])]
		// Use Object.assign to maintain type safety
		Object.assign(object, { [key]: merged })
		return true
	}

	// Return false to use default merging for non-arrays
	return false
})

/**
 * Merge, treating arrays like sets
 */
export function mergeDefaults<T extends Record<string, unknown>, S extends T>(
	options: PartialDeep<S> | undefined,
	defaults: T,
): T {
	if (options === undefined) {
		return defaults
	}

	// Regrettable
	return mergeDefaultsInternal(options, defaults) as T
}
