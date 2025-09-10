import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignore: ['src/pipeline/process-image-worker.js'],
	ignoreBinaries: [
		'avifenc',
		'bumpp',
		'cjpeg',
		'convert',
		'cwebp',
		'date',
		'dssim',
		'ffmpeg',
		'file',
		'guetzli',
		'identify',
		'magick',
		'open',
		'osascript',
		'oxipng',
		'sips',
		'sips',
		'which',
	],
	ignoreDependencies: ['tsx', 'importx'],
})
