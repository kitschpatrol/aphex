import { validateTags } from './src/utilities/image/tags'

console.log(await validateTags({ creator: 'John Doe' }))
console.log('----------------------------------')
console.log(await validateTags({ creator: 'John Doe' }, ['creator', 'credit']))
console.log('----------------------------------')
console.log(await validateTags({ creator: 'John Doe', credit: 'Jane Doe' }, ['creator', 'credit']))
console.log('----------------------------------')
console.log(
	await validateTags({ creator: 'John Doe', credit: 'Jane Doe' }, [], ['creator', 'credit']),
)
console.log('----------------------------------')
console.log(await validateTags({ credit: 'Jane Doe' }, [], ['creator', 'credit']))
console.log('----------------------------------')
console.log(await validateTags({ creator: 'Jane Doe' }, [], ['creator', 'credit']))
console.log('----------------------------------')
console.log(await validateTags({}, [], ['creator', 'credit']))
