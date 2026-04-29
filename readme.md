<!-- // @case-police-ignore VSCode -->

<!-- title -->

# @kitschpatrol/aphex

<!-- /title -->

<!-- badges -->

[![NPM Package @kitschpatrol/aphex](https://img.shields.io/npm/v/@kitschpatrol/aphex.svg)](https://npmjs.com/package/@kitschpatrol/aphex)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/license/mit/)

<!-- /badges -->

<!-- short-description -->

**Apple Photos Export. TypeScript library and CLI tool to export and process images and albums from your macOS Photos.app library.**

<!-- /short-description -->

> [!WARNING]
>
> **Aphex is still under development. It should not be considered suitable for general use until a 1.0 release.**
>
> This project is open-sourced as a curiosity and for my own convenience, but I suspect it's too niche to be of wide interest or utility. I don't currently plan to spend time adding features for more general use-cases.
>
> It won't work in CI pipelines. It can only target the system's active Photos.app library. It requires an Apple Silicon (`arm64`) Mac. It has not been tested against iCloud Photos libraries, and assets kept only in the cloud (via "Optimize Mac Storage") are unlikely to export successfully.
>
> If you are looking for a proper Apple Photos.app mass-export or backup solution, **I highly recommend using [osxphotos](https://github.com/RhetTbull/osxphotos) instead**.

## Overview

Aphex is a TypeScript library for exporting images and albums from your local macOS Photos.app library via a Node-compatible runtime.

It makes it simple to export high-quality versions of specific photos or albums from your Photos.app library via a path-like syntax. It can also (optionally) perform image resizing, compression, metadata migration, metadata validation, and color space normalization.

I created this library for integration in static website content management asset pipelines, and to attempt to work around some issues related to [exporting high-quality versions of edited images](https://github.com/RhetTbull/osxphotos/discussions/1522) from the Photos.app library. (See the [unplugin-aphex](https://github.com/kitschpatrol/unplugin-aphex) project for an additional layer of integration with various build tools, and the [vscode-aphex](https://github.com/kitschpatrol/vscode-aphex) plugin for hover previews of Aphex links in VS Code.)

This repository also embeds the `aphex-swift` CLI project, which provides a minimal and performant wrapper around parts of Apple's PhotoKit framework. It's not intended for direct use, instead it provides just enough functionality to support the parts of the methods provided by the `aphex` TypeScript library that can only be implemented natively.

<!-- /* spell-checker:disable */  -->

The name "Aphex" is a concatenation of **A**pple **PH**otos **EX**port.

<!-- /* spell-checker:enable */  -->

## Getting started

### Dependencies

Requires an Apple Silicon (`arm64`) Mac with Photos.app installed and [Node 22.18.0](https://nodejs.org/en/download/) or newer. No Intel (`x86_64`) build of the bundled native binary is provided.

Full image processing functionality also requires a number of command-line tools available via [Homebrew](https://brew.sh):

| Tool          | Used for                                                                  |
| ------------- | ------------------------------------------------------------------------- |
| `libavif`     | AVIF encoding                                                             |
| `mozjpeg`     | JPEG encoding                                                             |
| `webp`        | WebP encoding (lossy, lossless, and near-lossless)                        |
| `oxipng`      | PNG optimization                                                          |
| `guetzli`     | High-quality JPEG recompression (used when size budgets require)          |
| `imagemagick` | General-purpose conversion and color profile handling                     |
| `ffmpeg`      | Media probing used by some conversion paths                               |
| `dssim`       | Perceptual similarity metrics (only needed if `logSimilarity` is enabled) |

If you skip image processing (`processOptions: 'disabled'`) you can omit the Homebrew dependencies.

### Installation

```sh
brew install libavif mozjpeg imagemagick webp dssim ffmpeg guetzli oxipng
npm install @kitschpatrol/aphex
```

### Permissions

In most cases, the application invoking aphex should request permission to access your Photos.app library on first use.

In certain situations, like executing commands in a VS Code terminal, can [fail to prompt for permission](https://errorism.dev/issues/microsoft-vscode-vscode-terminal-doesnt-allowrequest-permissions-to-access-media-devices). You can work around this through some _highly inadvisable_ direct manipulation of the [permissions database](https://www.rainforestqa.com/blog/macos-tcc-db-deep-dive):

For example, to grant photo library permission to VS Code:

```sh
sqlite3 ~/Library/Application\ Support/com.apple.TCC/TCC.db "INSERT OR REPLACE INTO access (service, client, client_type, auth_value, auth_reason, auth_version, indirect_object_identifier) VALUES ('kTCCServicePhotos', 'com.microsoft.VSCode', 0, 2, 3, 1, 'UNUSED');"
```

To revoke photo library permissions:

```sh
tccutil reset Photos com.microsoft.VSCode
```

Adapt the application identifiers (e.g. `com.microsoft.VSCode`) as required to suit your situation.

To get an application's bundle identifier:

```sh
osascript -e 'id of app "Cursor"'
```

## Usage

Aphex tries to be generous in what it accepts as valid image identifiers.

It imagines the contents of your Photos.app library as a hierarchical file system of folders, albums, and photos, where the "name" of each photo is either its filename or, if set, its title.

This lets you access specific photos in specific albums via a path-like syntax.

Be warned that exporting unedited images is very fast, but exporting _edited_ images can be very (very) slow, since an alternate AppleScript-based export strategy is enabled by default to ensure maximum quality.

By default, different export strategies are used for different types of images. The default configuration prioritizes image quality over export speed.

### Library

#### API

Aphex provides two main export functions, one for individual photos, and one that can take an arbitrary number of identifiers / albums:

##### `exportPhoto`

```ts
function exportPhoto(
  identifier: PhotoInfo | string,
  destinationDirectory: string,
  options?: PartialDeep<ExportOptions>,
): Promise<ExportResult>
```

##### `exportPhotos`

```ts
function exportPhotos(
  identifiers: Array<AlbumInfo | PhotoInfo | string>,
  destinationDirectory: string,
  options?: PartialDeep<ExportOptions>,
): Promise<ExportResult[]>
```

The `options` parameter accepts a deeply partial `ExportOptions` object. All fields have sensible defaults, so you only need to specify what you want to override.

| Option group      | Description                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exportOptions`   | Controls which export engine is used per image type, file naming conventions (sluggify, UUID fragment, extension normalization), and AppleScript GUI export settings.                                                                                                                                                                                       |
| `processOptions`  | Controls image processing: color profile normalization (`preserveColorProfiles`, `defaultColorProfile`), compression format and quality (`lossyFormat`, `lossyQuality`, `losslessFormat`), max dimensions and file size (`maxDimensionsPixels`, `maxFileSizeBytes`), and format passthrough (`passthroughFormats`). Set to `'disabled'` to skip processing. |
| `metadataOptions` | Controls metadata written to exported images (creator, credit, description, label). Set to `'disabled'` to skip metadata management.                                                                                                                                                                                                                        |
| `syncOptions`     | Controls incremental export behavior: diff strategies (`diffStrategies`), whether to delete stale files (`deleteTarget`, `deleteOthers`), and force re-export (`forceUpdate`). Set to `'disabled'` to skip sync.                                                                                                                                            |

See the [`ExportOptions` type](https://github.com/kitschpatrol/aphex/blob/main/src/index.ts) and the inline JSDoc on each field in [`src/pipeline/`](https://github.com/kitschpatrol/aphex/tree/main/src/pipeline) for the full set of options.

Functions are also provided for querying the contents of the Photos.app library:

##### `getPhotoInfo`

```ts
function getPhotoInfo(
  identifiers: string | string[],
  caseSensitive?: boolean, // Defaults to false
): Promise<PhotoInfo[]>
```

```ts
const [info] = await getPhotoInfo('Pets/Tiny')
console.log(info.uuid, info.original.fileName, info.dateCreated)
```

##### `getAlbumInfo`

```ts
function getAlbumInfo(
  identifiers: string | string[],
  caseSensitive?: boolean, // Defaults to false
): Promise<AlbumInfo[]>
```

```ts
const [album] = await getAlbumInfo('Pets')
console.log(album.uuid, album.estimatedAssetCount)
```

#### Logging

Aphex logs progress and warnings via [lognow](https://github.com/kitschpatrol/lognow) for logging. You can inject your own logger:

```ts
import { setLogger } from '@kitschpatrol/aphex'

setLogger(console)
```

#### Examples

##### Exporting a photo by filename

Let's assume you have an album named "Trip" in your Photos.app library containing a photo with the filename "IMG_1922.jpeg":

```ts
const result = await exportPhoto('Trip/IMG_1922.jpeg', '~/Desktop')

// '/Users/$USER/Desktop/IMG_1922.jpeg'
console.log(result.path)
```

Lookups are case-insensitive by default. Albums nested in folders are also supported, just add them to the identifier path:

```ts
const result = await exportPhoto('Astrophotography/Regulus/IMG_2036.jpeg', '~/Desktop')
```

##### Exporting a photo by title

Let's assume you have an album named "Pets" containing a photo you've titled "Tiny":

```ts
const result = await exportPhoto('Pets/Tiny', '~/Desktop')

// '/Users/$USER/Desktop/Tiny.jpeg'
console.log(result.path)
```

##### Exporting a photo by UUID

Let's assume you know the local UUID of the photo you want. (Maybe you looked it up using the `getPhotoInfo` function, or the `aphex` CLI command, or `osxphotos`.)

```ts
const result = await exportPhoto('3AFE81DB-6BDB-42AB-AD27-90EE3A85A404', '~/Desktop')
```

Note that UUIDs are unique to each instance of your Photos.app library, so if you have the same library synced across several machines, you can't expect the identifiers to be consistent. Technically, they aren't _universal_. Apple uses the term "local identifier" internally for this reason. For the sake of concision and consistency with tools like `osxphotos`, this library uses the term "UUID" interchangeably with "local identifier".

#### Exporting an album by name

Let's assume you have an album named "Pets" containing a number of photos. Export them all as follows:

```ts
const results = await exportPhotos(['Pets'], '~/Desktop')
```

#### Exporting an album by UUID

Like photos, albums also have local UUIDs in the Photos.app library.

Let's assume you know the local UUID of the photo you want. (Maybe you looked it up using the `getAlbumInfo` function.)

```ts
const results = await exportPhotos(['2768A20C-9BD0-42CB-B464-9D299952D389'], '~/Desktop')
```

The same caveat about UUID consistency across library instances applies here.

#### Exporting a mix of multiple photos and albums

You can mix and match all the identifier forms as you like. Aphex will return a flat list of all the exported photos:

```ts
const results = await exportPhotos(
  [
    // Photo title
    'Pets/Tiny',
    // Photo filename
    'Trip/IMG_1922.jpeg',
    // Photo UUID
    '3AFE81DB-6BDB-42AB-AD27-90EE3A85A404',
    // Album name
    'Astrophotography/Regulus',
    // Album UUID
    '2768A20C-9BD0-42CB-B464-9D299952D389',
  ],
  '~/Desktop',
)
```

### CLI

Aphex uses the bundled aphex-swift CLI tool to query the Photos.app library. The tool allows you to perform simple lookups of photos in your library using the same identifier logic enumerated above. (E.g. searching by file name, album name, title, etc.)

It's exposed as a binary as part of this package, so it's accessible on the command line via `aphex` within the scope of the `@kitschpatrol/aphex` package installation.

See the [project's readme](https://github.com/kitschpatrol/aphex/blob/main/native/aphex-swift/readme.md) for additional details.

## Implementation notes

Currently, the TypeScript code bridges via simple CLI calls to the `aphex-swift` binary, which is a wrapper around parts of Apple's PhotoKit framework. This is flexible and fast enough for now, but projects like Kabir Oberai's [node-swift](https://github.com/kabiroberai/node-swift) could be a good alternative for tighter integration between native Swift code and the TypeScript API.

Also, this library bundles a bunch of generically useful image processing functionality, which should probably live in a separate package.

## Resources

- [Ole Begemann on PhotoKit’s data model](https://oleb.net/2018/photos-data-model/)

## Maintainers

[kitschpatrol](https://github.com/kitschpatrol)

## Acknowledgments

Thank you to [Rhet Turnbull](https://github.com/RhetTbull) for creating [osxphotos](https://github.com/RhetTbull/osxphotos), which informed some of the export pipelines in this library.

Aphex borrows a technique from [Andreas Bentele](https://github.com/abentele)'s [PhotosExporter](https://github.com/abentele/PhotosExporter) for extracting semi-private values from `PHAssetResource` objects.

<!-- contributing -->

## Contributing

[Issues](https://github.com/kitschpatrol/aphex/issues) are welcome and appreciated.

Please open an issue to discuss changes before submitting a pull request. Unsolicited PRs (especially AI-generated ones) are unlikely to be merged.

This repository uses [@kitschpatrol/shared-config](https://github.com/kitschpatrol/shared-config) (via its `ksc` CLI) for linting and formatting, plus [MDAT](https://github.com/kitschpatrol/mdat) for readme placeholder expansion.

<!-- /contributing -->

## Disclaimer

This is an unofficial library and is not affiliated with or blessed by Apple Inc.

The core export commands maintain a "read only" relationship with your library.

None of the code paths should modify the contents of your Photos.app library. But regardless, strange things can happen — please back up your Photos.app library before using this tool.

This tool has _not_ been tested with iCloud-based Photos libraries.

<!-- license -->

## License

[MIT](license.txt) © [Eric Mika](https://ericmika.com)

<!-- /license -->
