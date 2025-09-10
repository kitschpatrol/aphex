import type { Subprocess } from 'execa'
import { defu } from 'defu'
import { execa } from 'execa'
import fse from 'fs-extra'
import { EventEmitter } from 'node:events'
import path from 'node:path'

export type ExportMode = 'export' | 'photokit' | 'photos-export'

export type ExportViaOsxphotosOptions = {
	filename?: string
	libraryPath?: string
	mode?: ExportMode
	original?: boolean
}

type ReplManagerOptions = {
	libraryPath?: string
	timeout?: number
}

type CommandQueueItem = {
	command: string
	reject: (error: Error) => void
	resolve: (value: string) => void
}

const defaultExportOptions: Required<Omit<ExportViaOsxphotosOptions, 'libraryPath'>> = {
	filename: '{uuid}',
	mode: 'export',
	original: false,
}

class OsxphotosReplManager extends EventEmitter {
	private static instance: OsxphotosReplManager | undefined
	private commandQueue: CommandQueueItem[] = []
	private currentPrompt = '>>>'
	private initPromise: Promise<void> | undefined
	private isReady = false
	private readonly options: ReplManagerOptions
	private outputBuffer = ''
	private replProcess: Subprocess | undefined

	private constructor(options: ReplManagerOptions = {}) {
		super()
		this.options = {
			timeout: 60_000, // 60 seconds for exports
			...options,
		}

		// Add a default error handler to prevent unhandled error events
		this.on('error', (error) => {
			console.error('OsxphotosReplManager error:', error)
		})
	}

	static getInstance(options?: ReplManagerOptions): OsxphotosReplManager {
		if (!OsxphotosReplManager.instance) {
			OsxphotosReplManager.instance = new OsxphotosReplManager(options)
		} else if (
			options?.libraryPath &&
			options.libraryPath !== OsxphotosReplManager.instance.options.libraryPath
		) {
			// If library path changes, we need to restart
			void OsxphotosReplManager.instance.close().then(() => {
				OsxphotosReplManager.instance = new OsxphotosReplManager(options)
			})
		}
		return OsxphotosReplManager.instance
	}

	async close(): Promise<void> {
		if (!this.replProcess) {
			return
		}

		try {
			this.replProcess.stdin?.write('exit()\n')

			await new Promise<void>((resolve) => {
				const timeout = setTimeout(() => {
					this.replProcess?.kill('SIGTERM')
					resolve()
				}, 5000)

				this.replProcess?.on('exit', () => {
					clearTimeout(timeout)
					resolve()
				})
			})
		} finally {
			this.cleanup()
		}
	}

	async exportPhotos(
		uuids: string | string[],
		destinationDirectory: string,
		options: ExportViaOsxphotosOptions = {},
	): Promise<string[]> {
		await this.ensureInitialized()

		// Ensure destination directory exists (do this in Node, not Python)
		await fse.ensureDir(destinationDirectory)

		const { filename, mode, original } = defu(options, defaultExportOptions)

		const skipOriginal = !original
		const skipEdited = original
		const usePhotokit = mode === 'photokit'
		const usePhotosExport = mode === 'photos-export' || mode === 'photokit'

		const uuidArray = Array.isArray(uuids) ? uuids : [uuids]
		const allExportedPaths: string[] = []

		// Export photos one by one to better handle errors
		for (const uuid of uuidArray) {
			try {
				const paths = await this.exportSinglePhoto(
					uuid,
					destinationDirectory,
					filename,
					skipOriginal,
					skipEdited,
					usePhotokit,
					usePhotosExport,
				)
				allExportedPaths.push(...paths)
			} catch (error) {
				console.error(`Failed to export photo ${uuid}: ${error}`)
				// Continue with other photos even if one fails
			}
		}

		// Verify exported files exist
		const verifiedPaths: string[] = []
		for (const exportedPath of allExportedPaths) {
			const exists = await fse.pathExists(exportedPath)
			if (exists) {
				verifiedPaths.push(exportedPath)
			} else {
				console.warn(`Exported file not found: ${exportedPath}`)
			}
		}

		return verifiedPaths
	}

	isRunning(): boolean {
		return this.replProcess !== undefined && this.isReady
	}

	private cleanup(): void {
		this.replProcess = undefined
		this.isReady = false
		this.commandQueue = []
		this.outputBuffer = ''
		this.initPromise = undefined
		OsxphotosReplManager.instance = undefined
	}

	private async ensureInitialized(): Promise<void> {
		this.initPromise ||= this.initialize()
		await this.initPromise
	}

	private async executeCommand(command: string): Promise<string> {
		if (!this.replProcess || !this.isReady) {
			throw new Error('REPL is not initialized')
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error(`Command timeout: ${command.slice(0, 50)}...`))
			}, this.options.timeout)

			this.commandQueue.push({
				command,
				reject(error) {
					clearTimeout(timeout)
					reject(error)
				},
				resolve(value) {
					clearTimeout(timeout)
					resolve(value)
				},
			})

			this.processQueue()
		})
	}

	private async exportSinglePhoto(
		uuid: string,
		destinationDirectory: string,
		filename: string,
		skipOriginal: boolean,
		skipEdited: boolean,
		usePhotokit: boolean,
		usePhotosExport: boolean,
	): Promise<string[]> {
		const command = `
result = export_photo_by_uuid(
    "${uuid}",
    "${destinationDirectory}",
    "${filename}",
    ${skipOriginal ? 'True' : 'False'},
    ${skipEdited ? 'True' : 'False'},
    ${usePhotokit ? 'True' : 'False'},
    ${usePhotosExport ? 'True' : 'False'}
)
json.dumps(result) if result is not None else "null"`

		const result = await this.executeCommand(command)

		if (result === 'null' || result === 'None') {
			console.error(`Photo with UUID ${uuid} not found`)
			return []
		}

		try {
			const paths = JSON.parse(result)
			if (!Array.isArray(paths)) {
				return []
			}

			// Convert relative paths to absolute paths
			return paths.map((p) => {
				if (path.isAbsolute(p)) {
					return p
				}
				return path.join(destinationDirectory, path.basename(p))
			})
		} catch (error) {
			console.error(`Failed to parse export result for ${uuid}: ${error}`)
			return []
		}
	}

	private async initialize(): Promise<void> {
		if (this.replProcess) {
			return
		}

		const args = ['repl']

		if (this.options.libraryPath) {
			// Verify library path exists before starting REPL
			const libraryExists = await fse.pathExists(this.options.libraryPath)
			if (!libraryExists) {
				throw new Error(`Photos library not found at: ${this.options.libraryPath}`)
			}
			args.push('--library', this.options.libraryPath)
		}

		try {
			this.replProcess = execa('osxphotos', args, {
				stderr: 'pipe',
				stdin: 'pipe',
				stdout: 'pipe',
			})

			this.replProcess.stdout?.on('data', (data: Uint8Array) => {
				const output = new TextDecoder().decode(data)
				this.outputBuffer += output

				// Check if REPL is ready
				if (!this.isReady && (output.includes('>>>') || output.includes('In ['))) {
					// Detect IPython vs standard Python REPL
					if (output.includes('In [')) {
						this.currentPrompt = 'In ['
					}
					this.isReady = true
					this.emit('ready')
					this.processQueue()
				} else if (this.isReady && this.isPromptReady(output)) {
					// Command completed
					this.processCommandResponse()
				}
			})

			this.replProcess.stderr?.on('data', (data: Uint8Array) => {
				const error = new TextDecoder().decode(data)
				// Only emit non-warning errors
				if (!error.includes('Warning') && !error.includes('UserWarning')) {
					this.emit('error', error)
				}
			})

			this.replProcess.on('exit', (code) => {
				this.emit('exit', code)
				this.cleanup()
			})

			await this.waitForReady()
			await this.setupEnvironment()
		} catch (error) {
			this.cleanup()
			throw new Error(`Failed to initialize REPL: ${error}`)
		}
	}

	private isPromptReady(output: string): boolean {
		// Check for various prompt patterns that indicate command completion
		// The REPL might be using IPython or standard Python prompt
		return (
			output.includes('>>>') ||
			output.includes('In [') ||
			output.endsWith('>>> ') ||
			(output.includes('... ') && output.includes('>>>'))
		) // Multi-line command completed
	}

	private processCommandResponse(): void {
		if (this.commandQueue.length === 0) {
			return
		}

		const { reject, resolve } = this.commandQueue.shift()!

		// Check for Python exceptions in the output
		if (this.outputBuffer.includes('Traceback') || this.outputBuffer.includes('Error:')) {
			reject(new Error(this.outputBuffer))
			this.processQueue()
			return
		}

		// Clean the output
		const lines = this.outputBuffer.split('\n')
		const cleanedOutput = lines
			.filter(
				(line) =>
					!line.startsWith('>>>') &&
					!line.startsWith('...') &&
					!line.startsWith('In [') &&
					!line.startsWith('Out['),
			)
			.join('\n')
			.trim()

		resolve(cleanedOutput)
		this.processQueue()
	}

	private processQueue(): void {
		if (!this.isReady || this.commandQueue.length === 0) {
			return
		}

		const { command } = this.commandQueue[0]
		this.outputBuffer = ''
		this.replProcess?.stdin?.write(`${command}\n`)
	}

	private async setupEnvironment(): Promise<void> {
		// Only import what we absolutely need in Python
		const setupCommands = [
			'import json',
			'import sys',
			'photosdb = PhotosDB()',
			'',
			'# Minimal export function',
			`def export_photo_by_uuid(uuid, dest_dir, filename_template, skip_original, skip_edited, use_photokit, use_photos_export):
    photo = photosdb.get_photo(uuid)
    if not photo:
        return None
    
    export_options = {}
    
    # Handle edited/original logic
    if skip_original and photo.hasadjustments:
        export_options["edited"] = True
        export_options["original"] = False
    elif skip_edited:
        export_options["edited"] = False
        export_options["original"] = True
    else:
        if photo.hasadjustments:
            export_options["edited"] = True
            export_options["original"] = False
        else:
            export_options["edited"] = False
            export_options["original"] = True
    
    # Handle export mode
    if use_photokit:
        export_options["use_photokit"] = True
        export_options["use_photos_export"] = True
    elif use_photos_export:
        export_options["use_photos_export"] = True
    
    # Convert to jpeg
    export_options["convert_to_jpeg"] = True
    export_options["jpeg_ext"] = "jpeg"
    export_options["filename"] = filename_template
    
    try:
        paths = photo.export(dest_dir, **export_options)
        return paths if paths else []
    except Exception as e:
        print(f"Export error: {e}", file=sys.stderr)
        raise Exception(f"Export failed: {str(e)}")`,
		]

		for (const command of setupCommands) {
			if (command.trim()) {
				await this.executeCommand(command)
			}
		}
	}

	private async waitForReady(): Promise<void> {
		if (this.isReady) {
			return
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('REPL initialization timeout'))
			}, this.options.timeout)

			this.once('ready', () => {
				clearTimeout(timeout)
				resolve()
			})
		})
	}
}

/**
 * Export a photo using osxphotos REPL with different export modes.
 * This replaces the command-line based export with a persistent REPL session.
 * @param photoUuid - UUID or array of UUIDs of the photo(s) to export
 * @param destinationDirectory - Directory to export the photo to
 * @param options - Export options including mode and original preference
 * @returns Promise resolving to the exported file path(s)
 */
export async function exportViaOsxphotos(
	photoUuid: string | string[],
	destinationDirectory: string,
	options?: ExportViaOsxphotosOptions,
): Promise<string[]> {
	const manager = OsxphotosReplManager.getInstance({
		libraryPath: options?.libraryPath,
	})

	return manager.exportPhotos(photoUuid, destinationDirectory, options)
}

/**
 * Close the REPL session explicitly.
 * Call this when you're done with all exports to clean up resources.
 */
export async function closeRepl(): Promise<void> {
	const manager = OsxphotosReplManager.getInstance()
	return manager.close()
}

/**
 * Check if the REPL is currently running.
 */
export function isReplRunning(): boolean {
	const manager = OsxphotosReplManager.getInstance()
	return manager.isRunning()
}

export { OsxphotosReplManager }
