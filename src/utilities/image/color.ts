import { execa } from 'execa'
import { exiftool } from 'exiftool-vendored'
import path from 'node:path'
import { getPackageAssetsPath } from '../paths'
import { lookupImageMimeType } from './mime'

const validColorProfiles = [
	'Adobe RGB (1998)',
	'Apple Wide Color Sharing Profile',
	'Display P3',
	'None',
	'ProPhoto RGB',
	'sRGB IEC61966-2.1',
	'Unsupported',
] as const

// Strings from exiftool
export type ColorProfile = (typeof validColorProfiles)[number]

/**
 * Assert that a color profile is valid
 */
export function assertValidColorProfile(profile: unknown): asserts profile is ColorProfile {
	if (typeof profile !== 'string' || !(validColorProfiles as readonly string[]).includes(profile)) {
		throw new Error(`Invalid color profile: ${String(profile)}`)
	}
}

/**
 * Get the color profile of an image
 * https://github.com/saucecontrol/Compact-ICC-Profiles?tab=readme-ov-file
 */
export async function getColorProfile(imagePath: string): Promise<ColorProfile> {
	// First try sips
	// No temporary files created
	const { stdout } = await execa('sips', ['-g', 'profile', imagePath])
	const result = /profile: (.+)/.exec(stdout)
	const rawResult = result?.[1]
	const sipsProfile = rawResult === '<nil>' ? undefined : rawResult

	// Then try exiftool
	const { ProfileDescription: exiftoolProfile } = await exiftool.read(imagePath)

	if (
		sipsProfile !== undefined &&
		exiftoolProfile !== undefined &&
		sipsProfile !== exiftoolProfile
	) {
		console.error(
			`Conflicting color profiles: sips: "${sipsProfile}", exiftool: "${exiftoolProfile}" in image "${imagePath}"`,
		)
	}

	const profile = sipsProfile ?? exiftoolProfile

	switch (profile) {
		case 'Adobe RGB (1998)': {
			return 'Adobe RGB (1998)'
		}

		case 'Apple Wide Color Sharing Profile': {
			return 'Apple Wide Color Sharing Profile'
		}

		case 'Display P3': {
			return 'Display P3'
		}

		case 'ProPhoto RGB': {
			return 'ProPhoto RGB'
		}

		case 'sRGB IEC61966-2.1': {
			return 'sRGB IEC61966-2.1'
		}

		case undefined: {
			return 'None'
		}

		default: {
			console.warn(`Unsupported color profile "${profile}"  in image "${imagePath}"`)
			return 'Unsupported'
		}
	}
}

/**
 * Get the path to a color profile
 */
export function getPathToColorProfile(profile: ColorProfile): string {
	const basePath = path.join(getPackageAssetsPath(import.meta), 'profiles')

	// eslint-disable-next-line ts/switch-exhaustiveness-check
	switch (profile) {
		case 'Adobe RGB (1998)': {
			return path.join(basePath, 'AdobeRGB1998.icc')
		}

		case 'Display P3': {
			return path.join(basePath, 'Display P3.icc')
		}

		case 'ProPhoto RGB': {
			return path.join(basePath, 'ProPhoto.icm')
		}

		case 'sRGB IEC61966-2.1': {
			return path.join(basePath, 'sRGB Profile.icc')
		}

		default: {
			throw new Error(`Unsupported profile: ${profile}`)
		}
	}
}

/**
 * Convert the color profile of an image
 */
export async function convertColorProfile(imagePath: string, profile: ColorProfile) {
	const currentProfile = await getColorProfile(imagePath)

	if (profile === 'Unsupported') {
		throw new Error(`Can't assign unsupported profile`)
	}

	if (currentProfile === profile) {
		return
	}

	if (currentProfile === 'None') {
		await exiftool.write(
			imagePath,
			{},
			{
				writeArgs: ['-ICC_Profile=', '-overwrite_original_in_place'],
			},
		)

		return
	}

	const mime = lookupImageMimeType(imagePath, true)

	if (['png', 'psd', 'tif'].includes(mime)) {
		console.log(`Converting ${path.basename(imagePath)} from ${currentProfile} to ${profile}`)
		// TODO clean up temp (sips does not respect TMPDIR)
		await execa('sips', ['--matchTo', getPathToColorProfile(profile), imagePath])
	} else if (['avif', 'gif', 'heic', 'jpeg', 'webp'].includes(mime)) {
		throw new Error(
			`Color profile conversion would be destructive for image ${path.basename(imagePath)}, aborting`,
		)

		// Destructive
		// else if ['webp'] {
		// 	await execa('convert', [
		// 		imagePath,
		// 		'-profile',
		// 		getPathToColorProfile(profile),
		// 		imagePath,
		// 	])
		// }
	} else {
		throw new Error(`Unsupported image format: ${mime}`)
	}
}

/**
 * Assign a color profile to an image
 */
export async function assignColorProfile(imagePath: string, profile: ColorProfile) {
	if (profile === 'Unsupported') {
		throw new Error(`Can't assign unsupported profile`)
	}

	if (profile === (await getColorProfile(imagePath))) {
		return
	}

	if (profile === 'None') {
		await exiftool.write(
			imagePath,
			{},
			{
				writeArgs: ['-ICC_Profile=', '-overwrite_original_in_place'],
			},
		)
		return
	}

	const mime = lookupImageMimeType(imagePath, true)

	if (mime === 'avif') {
		console.warn(`Unsupported mime type for color profile assignment: ${mime}, skipping`)
	} else {
		// Sips doesn't work with webp or avif
		// await execa('sips', ['--embedProfile', getPathToColorProfile(profile), imagePath])

		await exiftool.write(
			imagePath,
			{},
			{
				writeArgs: [
					`-ICC_Profile<=${getPathToColorProfile(profile)}`,
					'-overwrite_original_in_place',
				],
			},
		)
	}
}

/**
 * Check if an image needs color conversion
 */
export async function needsColorConversion(
	imagePath: string,
	preserveColorProfiles: ColorProfile[] = [
		'ProPhoto RGB',
		'Display P3',
		'sRGB IEC61966-2.1',
		'Adobe RGB (1998)',
	],
): Promise<boolean> {
	const profile = await getColorProfile(imagePath)
	// None is just an assignment, not a conversion
	return !['None', ...preserveColorProfiles].includes(profile)
}

/**
 * Normalize the color profile of an image
 */
export async function normalizeColorProfile(
	imagePath: string,
	preserveColorProfiles: ColorProfile[] = [
		'ProPhoto RGB',
		'Display P3',
		'sRGB IEC61966-2.1',
		'Adobe RGB (1998)',
	],
	defaultColorProfile: ColorProfile = 'sRGB IEC61966-2.1',
): Promise<'assigned' | 'converted' | 'no-action'> {
	const profile = await getColorProfile(imagePath)

	if (preserveColorProfiles.includes(profile)) {
		return 'no-action'
	}

	if (profile === 'None') {
		await assignColorProfile(imagePath, defaultColorProfile)
		return 'assigned'
	}

	// Convert to sRGB
	await convertColorProfile(imagePath, defaultColorProfile)
	return 'converted'
}
