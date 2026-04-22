import type { ChildProcess } from 'node:child_process'
import is, { assert } from '@sindresorhus/is'
import { execa } from 'execa'
import { spawn } from 'node:child_process'
import { endExiftool } from '../utilities/exiftool'
import { ensureArray } from '../utilities/general'
import { getPackageBinPath } from '../utilities/paths'

// ─────────────────────────────────────────────────────────────────────────────
// Interactive Session Singleton
// ─────────────────────────────────────────────────────────────────────────────

type PendingRequest = {
	buffer: string
	reject: (error: Error) => void
	resolve: (value: string) => void
}

const SHELL_SPECIAL_CHARS_REGEX = /[\s'"\\]/

let interactiveProcess: ChildProcess | undefined
let currentRequest: PendingRequest | undefined

/**
 * Start an interactive session with aphex-swift.
 * Commands will be sent to this persistent process instead of spawning new ones.
 * @throws {Error} If the session is already active or fails to start
 */
export async function interactiveSessionStart(): Promise<void> {
	if (interactiveProcess !== undefined) {
		throw new Error('Interactive session is already active')
	}

	const binPath = getPackageBinPath(import.meta)

	interactiveProcess = spawn('./aphex-swift', ['interactive'], {
		cwd: binPath,
		stdio: ['pipe', 'pipe', 'pipe'],
	})

	// Handle stdout - accumulate data and try to parse JSON
	interactiveProcess.stdout?.on('data', (data: Uint8Array) => {
		if (currentRequest === undefined) {
			// No pending request, this shouldn't happen but ignore it
			return
		}

		currentRequest.buffer += data.toString()

		// Try to parse the buffer as complete JSON
		try {
			// Attempt to parse - if successful, we have a complete response
			JSON.parse(currentRequest.buffer)
			const response = currentRequest.buffer
			const request = currentRequest
			currentRequest = undefined
			request.resolve(response)

			// Process next command in queue
			processNextCommand()
		} catch {
			// JSON incomplete, keep buffering
		}
	})

	// Handle stderr - treat as errors for the current request
	interactiveProcess.stderr?.on('data', (data: Uint8Array) => {
		if (currentRequest !== undefined) {
			const error = new Error(data.toString().trim())
			const request = currentRequest
			currentRequest = undefined
			request.reject(error)
			processNextCommand()
		}
	})

	// Handle process exit
	interactiveProcess.on('close', (code) => {
		const error = new Error(`Interactive session exited with code ${code}`)

		// Reject current request if any
		if (currentRequest !== undefined) {
			currentRequest.reject(error)
			currentRequest = undefined
		}

		// Reject all queued commands
		for (const queued of commandQueue) {
			queued.reject(error)
		}
		commandQueue = []

		interactiveProcess = undefined
	})

	// Wait a tick to ensure the process has started and checked Photos access
	await new Promise((resolve) => {
		setTimeout(resolve, 100)
	})
}

/**
 * Stop the interactive session if one is active.
 */
export async function interactiveSessionStop(): Promise<void> {
	if (interactiveProcess === undefined) {
		return
	}

	const processToStop = interactiveProcess

	// Send exit command
	processToStop.stdin?.write('exit\n')
	processToStop.stdin?.end()

	// Wait for process to exit
	await new Promise<void>((resolve) => {
		processToStop.on('close', () => {
			resolve()
		})

		// Force kill after timeout
		setTimeout(() => {
			processToStop.kill('SIGKILL')
			resolve()
		}, 1000)
	})

	interactiveProcess = undefined
	currentRequest = undefined
	commandQueue = []

	// Also clean up exiftool processes
	await endExiftool()
}

/**
 * Check if an interactive session is currently active
 */
export function isInteractiveSessionActive(): boolean {
	return interactiveProcess !== undefined
}

type QueuedCommand = {
	command: string
	reject: (error: Error) => void
	resolve: (value: string) => void
}

let commandQueue: QueuedCommand[] = []

function processNextCommand(): void {
	if (
		currentRequest !== undefined ||
		commandQueue.length === 0 ||
		interactiveProcess === undefined
	) {
		return
	}

	const next = commandQueue.shift()!
	currentRequest = {
		buffer: '',
		reject: next.reject,
		resolve: next.resolve,
	}
	interactiveProcess.stdin?.write(next.command + '\n')
}

/**
 * Send a command to the interactive session and wait for the response
 */
async function executeInteractiveCommand(command: string): Promise<string> {
	if (interactiveProcess === undefined) {
		throw new Error('No interactive session active')
	}

	return new Promise((resolve, reject) => {
		commandQueue.push({ command, reject, resolve })
		processNextCommand()
	})
}

/**
 * Escape and join arguments into a single command string for interactive mode.
 * Arguments with spaces or special characters are quoted.
 */
function escapeCommand(args: string[]): string {
	return args
		.map((arg) => {
			// If the argument contains spaces, quotes, or backslashes, wrap in single quotes
			// and escape any existing single quotes
			if (SHELL_SPECIAL_CHARS_REGEX.test(arg)) {
				return `'${arg.replaceAll("'", String.raw`'\''`)}'`
			}
			return arg
		})
		.join(' ')
}

/**
 * TypeScript type definition for ResourceInfo from the Swift implementation
 */
export type ResourceInfo = {
	contentType: string
	fileName: string
	filePath: string
	fileSize: number
	height: number
	width: number
}

/**
 * TypeScript type definition for the JSON representation of a PHAsset
 * from the iOS Photos framework (CodablePHAsset)
 */
export type PhotoInfo = {
	dateCreated: Date
	dateModified: Date
	edited?: ResourceInfo
	favorite: boolean
	hidden: boolean
	original: ResourceInfo
	title?: string
	uuid: string
}

export type AlbumInfo = {
	dateEnd?: Date
	dateStart?: Date
	estimatedAssetCount: number
	path: string
	subtype: number
	title: string
	type: number
	uuid: string
}

/**
 * Runtime type guard for ResourceInfo
 */
export function isResourceInfo(value: unknown): value is ResourceInfo {
	if (!is.plainObject(value)) {
		return false
	}

	const object = value
	return (
		is.string(object.contentType) &&
		is.string(object.fileName) &&
		is.string(object.filePath) &&
		is.number(object.fileSize) &&
		is.number(object.height) &&
		is.number(object.width)
	)
}

/**
 * Runtime type guard for PhotoInfo
 */
export function isPhotoInfo(value: unknown): value is PhotoInfo {
	if (!is.plainObject(value)) {
		return false
	}

	const object = value

	// Required fields
	if (
		!is.string(object.uuid) ||
		!is.boolean(object.favorite) ||
		!is.boolean(object.hidden) ||
		!isResourceInfo(object.original) ||
		!is.date(object.dateCreated) ||
		!is.date(object.dateModified)
	) {
		return false
	}

	// Optional fields
	if (
		(object.title !== undefined && !is.string(object.title)) ||
		(object.edited !== undefined && !isResourceInfo(object.edited))
	) {
		return false
	}

	return true
}

/**
 * Runtime type guard for PhotoInfo array
 */
export function isPhotoInfoArray(value: unknown): value is PhotoInfo[] {
	return is.array(value) && value.every((element) => isPhotoInfo(element))
}

/**
 * Runtime type guard for AlbumInfo
 */
export function isAlbumInfo(value: unknown): value is AlbumInfo {
	if (!is.plainObject(value)) {
		return false
	}

	const object = value

	if (
		!is.string(object.uuid) ||
		!is.number(object.type) ||
		!is.number(object.subtype) ||
		!is.number(object.estimatedAssetCount) ||
		!is.string(object.title) ||
		!is.string(object.path)
	) {
		return false
	}

	if (
		(object.dateStart !== undefined && !is.date(object.dateStart)) ||
		(object.dateEnd !== undefined && !is.date(object.dateEnd))
	) {
		return false
	}

	return true
}

/**
 * Assert that a value is a PhotoInfo
 */
export function assertPhotoInfo(value: unknown): asserts value is PhotoInfo {
	if (!isPhotoInfo(value)) {
		throw new Error('Invalid PhotoInfo object')
	}
}

/**
 * Assert that a value is an array of PhotoInfo
 */
export function assertPhotoInfoArray(value: unknown): asserts value is PhotoInfo[] {
	if (!isPhotoInfoArray(value)) {
		throw new Error('Invalid PhotoInfo array')
	}
}

/**
 * Assert that a value is an AlbumInfo
 */
export function assertAlbumInfo(value: unknown): asserts value is AlbumInfo {
	if (!isAlbumInfo(value)) {
		throw new Error('Invalid AlbumInfo object')
	}
}

/**
 * Runtime type guard for AlbumInfo array
 */
export function isAlbumInfoArray(value: unknown): value is AlbumInfo[] {
	return is.array(value) && value.every((element) => isAlbumInfo(element))
}

/**
 * Assert that a value is an AlbumInfo array
 */
export function assertAlbumInfoArray(value: unknown): asserts value is AlbumInfo[] {
	if (!isAlbumInfoArray(value)) {
		throw new Error('Invalid AlbumInfo array')
	}
}

/**
 * Get photo asset information for given identifiers (ID, filename, album name, or photo path)
 * @throws {Error} If the command fails
 */
export async function aphexPhotoInfo(
	identifiers: string | string[],
	caseSensitive = false,
): Promise<PhotoInfo[]> {
	const identifiersArray = ensureArray(identifiers)
	if (identifiersArray.length === 0) {
		return []
	}

	const args = ['photo-info', ...identifiersArray, ...(caseSensitive ? ['--case-sensitive'] : [])]

	let stdout: string
	if (isInteractiveSessionActive()) {
		stdout = await executeInteractiveCommand(escapeCommand(args))
	} else {
		const result = await execa('./aphex-swift', args, {
			cwd: getPackageBinPath(import.meta),
		})
		stdout = result.stdout
	}

	try {
		const output: unknown = JSON.parse(stdout, dateReviver)
		assertPhotoInfoArray(output)
		return output
	} catch {
		throw new Error(`Error fetching photos: ${stdout}`)
	}
}

/**
 * Get album info
 * @throws {Error} If the command fails
 */
export async function aphexAlbumInfo(
	identifiers: string | string[],
	caseSensitive = false,
): Promise<AlbumInfo[]> {
	const identifiersArray = ensureArray(identifiers)
	if (identifiersArray.length === 0) {
		return []
	}

	const args = ['album-info', ...identifiersArray, ...(caseSensitive ? ['--case-sensitive'] : [])]

	let stdout: string
	if (isInteractiveSessionActive()) {
		stdout = await executeInteractiveCommand(escapeCommand(args))
	} else {
		const result = await execa('./aphex-swift', args, {
			cwd: getPackageBinPath(import.meta),
		})
		stdout = result.stdout
	}

	try {
		const output: unknown = JSON.parse(stdout, dateReviver)
		assertAlbumInfoArray(output)
		return output
	} catch {
		throw new Error(`Error fetching album info: ${stdout}`)
	}
}

/**
 * Export photos for given identifiers to a destination directory
 * @throws {Error} If the command fails
 */
export async function aphexExport(
	identifiers: string | string[],
	destination: string,
	caseSensitive = false,
	originals = false,
): Promise<string[]> {
	const identifiersArray = ensureArray(identifiers)
	if (identifiersArray.length === 0) {
		return []
	}

	const args = [
		'export',
		...identifiersArray,
		'--destination',
		destination,
		...(caseSensitive ? ['--case-sensitive'] : []),
		...(originals ? ['--originals'] : []),
	]

	let stdout: string
	if (isInteractiveSessionActive()) {
		stdout = await executeInteractiveCommand(escapeCommand(args))
	} else {
		const result = await execa('./aphex-swift', args, {
			cwd: getPackageBinPath(import.meta),
		})
		stdout = result.stdout
	}

	try {
		const output: unknown = JSON.parse(stdout, dateReviver)
		assert.array<string>(output)
		return output
	} catch {
		throw new Error(`Error exporting: ${stdout}`)
	}
}

function dateReviver(key: string, value: unknown) {
	if (
		(key === 'dateCreated' || key === 'dateModified' || key === 'dateStart' || key === 'dateEnd') &&
		typeof value === 'string'
	) {
		return value ? new Date(value) : undefined
	}
	return value
}
