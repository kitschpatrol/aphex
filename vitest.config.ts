import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		coverage: {
			exclude: ['src/**/*.d.ts', 'src/**/types.ts', 'src/**/*.test.ts', 'src/**/*.spec.ts'],
			include: ['src/**/*.ts'],
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			reportsDirectory: './coverage',
			thresholds: {
				branches: 80,
				functions: 80,
				lines: 80,
				statements: 80,
			},
		},
		isolate: false,
		maxWorkers: 1,
		pool: 'forks',
	},
})
