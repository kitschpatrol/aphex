import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	// Disabled
	ignore: ['**'],
	ignoreDependencies: [
		'@kitschpatrol/chagent', // Typically invoked through bumpp's --execute argument, which Knip doesn't parse
	],
})
