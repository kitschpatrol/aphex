import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig({
	test: {
		overrides: {
			'test/no-standalone-expect': [
				'error',
				{
					additionalTestBlockFunctions: ['tempDirectoryFixture'],
				},
			],
		},
	},
	ts: {
		overrides: {
			'depend/ban-dependencies': [
				'error',
				{
					allowed: ['execa', 'fs-extra', 'globby'],
				},
			],
		},
	},
	type: 'lib',
})
