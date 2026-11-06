# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.6] - 2026-11-01

### Maintenance

- Refresh runtime requirements for Execa, exiftool-vendored, equality checks, and logging.
- Refresh build/test/lint tooling and pnpm, build before lint/fix, check generated native CLI help, and configure repository skills through pnpm.
- Run dependency-update automation monthly, tolerate empty link-check inputs, exclude loopback URLs, and refresh GitHub release actions.

## [0.1.5] - 2026-10-07

### Changed

- **Breaking:** Restrict supported Node.js versions to `^24.16.0 || >=26.3.0`, excluding Node 25 and earlier Node 26 releases.

### Fixed

- Catch ExifTool shutdown failures to avoid unhandled rejections and preserve the expected SIGINT/SIGTERM exit status.

### Documentation

- Separate library and CLI installation guidance, add one-off `npx` and global npm examples, and document the supported Node.js range.

### Maintenance

- Refresh runtime dependencies, including exiftool-vendored 39, Execa, filesystem utilities, equality checks, and logging.
- Refresh contributor tools and TypeScript configuration, and add repository skill synchronization during setup.
- Add scheduled and manually runnable dependency-update automation, update repository metadata actions, and fix sitemap-discovery error capture in link checks.

## [0.1.4] - 2026-09-21

### Added

- Distribute the native `aphex` CLI through Homebrew with `brew install kitschpatrol/tap/aphex`, integrating formula publication into releases.

### Documentation

- Add Homebrew installation instructions and clarify the native CLI's query/export scope and the library's additional image-processing dependencies.

### Maintenance

- Refresh runtime dependencies, including exiftool-vendored 38, image-size, logging, worker pooling, and type utilities.
- Upgrade contributor tooling to pnpm 12 and Vitest 5, update build invocation and TypeScript configuration, refresh shared-config, and pin GitHub Actions revisions.

## [0.1.3] - 2026-08-25

### Changed

- **Breaking:** Raise the minimum supported Node.js version from 22.18.0 to 24.16.0.

### Fixed

- Report explicit errors for missing photo information and empty exports, and preserve underlying causes in AppleScript export and image-inspection errors.

### Documentation

- Correct links to the VS Code preview extension, Photos permissions reference, npm package, and license.

### Maintenance

- Refresh runtime dependencies, including Execa 10, exiftool-vendored 37, logging, and worker pooling, and update Swift ArgumentParser to 1.8.2.
- Upgrade contributor tooling to shared-config 8, TypeScript 6, and pnpm 11.22, refresh build/test dependencies, and adapt code to stricter lint and type checks.
- Add automated repository and homepage link checks, plus VS Code lint/fix tasks.
- Restrict GitHub release automation to version tags on the default branch and update npm publishing to use a one-time password.

## [0.1.2] - 2026-05-16

### Maintenance

- Refresh runtime requirements for type checks, ExifTool, filesystem utilities, and logging.
- Migrate contributor tooling to pnpm 11 and its `allowBuilds` configuration, and refresh build, test, and lint dependencies.
- Pass the npm authentication token directly to the publishing process.

## [0.1.1] - 2026-04-29

### Documentation

- Correct the README license badge's destination URL.

### Maintenance

- Update the declared `exiftool-vendored` requirement to `^35.19.0`.
- Refresh shared-config, contributor prompts, and pnpm tooling.

## [0.1.0] - 2026-04-22

### Added

- Distribute a typed ESM package for Node.js 22.18 or newer with a bundled native `aphex` CLI for Apple Silicon Macs running macOS 15 or newer.
- Provide `exportPhoto` and `exportPhotos` for exporting photos, albums, or mixed identifiers using UUIDs, nested album paths, filenames, or titles, with duplicate photos consolidated.
- Select PhotoKit, Photos GUI, AppleScript, or direct file copying according to image format, edit state, and transparency.
- Configure filename precedence, slugging, extension normalization, and UUID suffixes, automatically enabling suffixes when batch filename collisions are detected.
- Support optional resizing and PNG/JPEG/WebP/AVIF compression with quality and size controls, transparency-specific settings, format passthrough, parallel processing, and SSIM/PSNR/DSSIM reports.
- Preserve selected ICC color profiles or normalize images to a configured color space, including profile preservation during PSD conversion.
- Support configurable XMP metadata migration and validation for creators, credits, descriptions, labels, and preserved filenames.
- Persist photo information and export settings in XMP metadata to skip unchanged outputs, re-export changed photos, force updates, and optionally delete stale files.
- Expose `getPhotoInfo` and `getAlbumInfo` queries returning typed photo resources, dates, UUIDs, and album paths, with optional case-sensitive matching.
- Provide JSON photo/album queries, native exports, and an interactive CLI, including whole-library queries, original-only exports, destination selection defaulting to the current directory, case-sensitive matching, help, and version flags.
- Accept deeply partial configuration and expose `ExportOptions`, `ExportResult`, default options, `mergeDefaultExportOptions`, and `IMAGE_MIME_TYPES`/`ImageMimeType` for typed integrations.
- Expose persistent native sessions through `interactiveSessionStart`/`interactiveSessionStop` and explicit ExifTool cleanup through `endExiftool`.
- Allow consumers to inject a custom logger through `setLogger`.

### Documentation

- Document installation, external image tools, Photos permissions, identifier syntax, configuration, library/CLI examples, and local-library limitations.

### Maintenance

- Establish TypeScript/Swift builds, packaged assets and workers, package validation, Vitest tests and coverage, linting, and GitHub release/metadata automation.

[0.1.0]: https://github.com/kitschpatrol/aphex/releases/tag/v0.1.0
[0.1.1]: https://github.com/kitschpatrol/aphex/compare/v0.1.0...v0.1.1
[0.1.2]: https://github.com/kitschpatrol/aphex/compare/v0.1.1...v0.1.2
[0.1.3]: https://github.com/kitschpatrol/aphex/compare/v0.1.2...v0.1.3
[0.1.4]: https://github.com/kitschpatrol/aphex/compare/v0.1.3...v0.1.4
[0.1.5]: https://github.com/kitschpatrol/aphex/compare/v0.1.4...v0.1.5
[0.1.6]: https://github.com/kitschpatrol/aphex/compare/v0.1.5...v0.1.6
