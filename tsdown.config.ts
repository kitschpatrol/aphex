import { defineConfig } from 'tsdown'

export default defineConfig({
	attw: {
		profile: 'esm-only',
	},
	copy: ['./src/assets', './src/workers'],
	dts: true,
	fixedExtension: false,
	tsconfig: 'tsconfig.build.json',
})
