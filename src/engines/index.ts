export const defaultExportOptions: Required<ExportOptions> = {
	original: false,
}

export type ExportOptions = {
	/** Export the original version of the image, even if edited variations exist. Otherwise, export the edited version if available. */
	original?: boolean
}
