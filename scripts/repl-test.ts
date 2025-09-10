import { closeRepl, exportViaOsxphotos } from '../src/pipeline/engines/osxphotos-repl'

const result = await exportViaOsxphotos(
	'77758382-025A-446E-91C6-88A0BCAFDA91',
	'/Users/mika/Desktop',
	{},
)

console.log(result)

await closeRepl()
