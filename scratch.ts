import {
	exportPhoto,
	// TBD
	// interactiveSessionStart,
	// interactiveSessionStop
} from './src'
//
// await interactiveSessionStart()

const startTime = performance.now()

await exportPhoto('/Projects/LP/ABB - Client Centers/Product/ar-render-detail', './export', {
	exportOptions: {
		fileNameAppendUuidFragment: true,
	},
	processOptions: 'disabled',
})

await exportPhoto('/Projects/LP/ABB - Client Centers/Product/ar-render-detail', './export', {
	exportOptions: {
		fileNameAppendUuidFragment: true,
	},
	processOptions: 'disabled',
})

const timeElapsed = performance.now() - startTime
console.log(`Time elapsed: ${timeElapsed.toFixed(2)} milliseconds`)

//
// await interactiveSessionStop()
