/**
 * Centralized exiftool instance management
 *
 * This module provides a managed exiftool instance with proper lifecycle
 * management to prevent hanging processes. The exiftool-vendored library spawns
 * persistent Perl processes that must be explicitly ended.
 */

import { ExifTool } from 'exiftool-vendored'
import { log } from './log'

// Custom instance with reasonable defaults for batch processing
// Using a custom instance instead of the singleton gives us more control
const exiftoolInstance = new ExifTool({
	// Limit concurrent processes to prevent overwhelming the system
	// Default is 1/4 of CPUs, but we cap at 4 for stability
	maxProcs: 4,
	// More frequent idle checks helps with cleanup (default is 2000ms)
	onIdleIntervalMillis: 1000,
})

// Track if cleanup has been scheduled
let cleanupScheduled = false
let processExitHandlerInstalled = false

/**
 * Get the managed exiftool instance
 */
export function getExiftool(): ExifTool {
	scheduleProcessCleanup()
	return exiftoolInstance
}

/**
 * End the exiftool process gracefully
 *
 * This should be called when you're done using exiftool to prevent hanging
 * processes. It's safe to call multiple times.
 */
export async function endExiftool(): Promise<void> {
	if (exiftoolInstance.pids.length > 0) {
		log.debug(`Ending exiftool processes: ${exiftoolInstance.pids.join(', ')}`)
		await exiftoolInstance.end()
		log.debug('Exiftool processes ended')
	}
}

/**
 * Install process exit handlers for automatic cleanup
 *
 * This ensures exiftool processes are cleaned up even if the user forgets to
 * call endExiftool(). Only installs handlers once.
 */
function scheduleProcessCleanup(): void {
	if (processExitHandlerInstalled) {
		return
	}

	processExitHandlerInstalled = true

	// Clean up on normal exit
	process.on('beforeExit', async () => {
		if (!cleanupScheduled) {
			cleanupScheduled = true
			await endExiftool()
		}
	})

	// Clean up on explicit exit
	process.on('exit', () => {
		// Synchronous cleanup - can't await here
		// The ExifTool instance will be garbage collected
		// but we log for debugging
		if (exiftoolInstance.pids.length > 0) {
			log.debug(`Exiftool processes still running at exit: ${exiftoolInstance.pids.join(', ')}`)
		}
	})

	// Handle SIGINT (Ctrl+C)
	process.on('SIGINT', async () => {
		log.debug('Received SIGINT, cleaning up exiftool...')
		await endExiftool()
		process.exit(130)
	})

	// Handle SIGTERM
	process.on('SIGTERM', async () => {
		log.debug('Received SIGTERM, cleaning up exiftool...')
		await endExiftool()
		process.exit(143)
	})
}

// Re-export the ExifTool type for consumers who need it

export { type ExifTool } from 'exiftool-vendored'
