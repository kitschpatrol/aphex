// The Swift Programming Language
// https://docs.swift.org/swift-book
//
// Swift Argument Parser
// https://swiftpackageindex.com/apple/swift-argument-parser/documentation

import ArgumentParser
import Foundation

// MARK: - Stderr Logging Helper

func logError(_ message: String) {
    if let data = "\(message)\n".data(using: .utf8) {
        FileHandle.standardError.write(data)
    }
}

func getVersion() -> String {
    #if DEBUG
    return "dev"
    #else
    return PACKAGE_VERSION
    #endif
}

@main
struct aphex: ParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "Query and export images and albums from your macOS Photos.app library",
        version: getVersion(),
        subcommands: [AlbumInfo.self, PhotoInfo.self, Export.self, Interactive.self]
    )
}

struct Interactive: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "interactive",
        abstract: "Start an interactive session that accepts commands from stdin"
    )

    mutating func run() throws {
        // Check Photos access once at the start
        try checkPhotosAccess()

        // Read commands from stdin line by line
        while let line = readLine() {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)

            // Skip empty lines
            if trimmed.isEmpty {
                continue
            }

            // Exit on quit/exit commands
            if trimmed == "exit" || trimmed == "quit" {
                break
            }

            // Parse the line into arguments (respecting quoted strings)
            let arguments = parseArguments(from: trimmed)

            do {
                // Parse and run the command using ArgumentParser
                var command = try aphex.parseAsRoot(arguments)
                try command.run()
            } catch {
                // Use ArgumentParser's built-in error formatting (handles --help, --version, etc.)
                let exitCode = aphex.exitCode(for: error)
                let message = aphex.fullMessage(for: error)
                
                if exitCode == .success {
                    // Help/version output goes to stdout
                    print(message)
                } else {
                    // Errors go to stderr
                    logError(message)
                }
            }

            // Flush stdout to ensure output is sent immediately
            fflush(stdout)
        }
    }
}

/// Parse a command line string into an array of arguments using POSIX wordexp
func parseArguments(from line: String) -> [String] {
    var result = wordexp_t()
    
    // WRDE_NOCMD disables command substitution for security
    guard wordexp(line, &result, WRDE_NOCMD) == 0 else {
        // Fallback: split on whitespace if wordexp fails
        return line.split(separator: " ").map(String.init)
    }
    
    defer { wordfree(&result) }
    
    var arguments: [String] = []
    for i in 0..<Int(result.we_wordc) {
        if let word = result.we_wordv[i] {
            arguments.append(String(cString: word))
        }
    }
    
    return arguments
}

struct AlbumInfo: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "album-info",
        abstract:
            "Get album information for given identifiers (UUID, album name, or album path)"
    )

    @Flag(name: .shortAndLong, help: "Case sensitive matching")
    var caseSensitive = false

    @Argument(
        help:
            "Album identifiers (UUIDs, album names, or album paths). If no identifiers are provided, returns all albums in the library."
    )
    var identifiers: [String] = []

    mutating func run() throws {
        try checkPhotosAccess()

        guard let albums = getAlbums(identifiers: identifiers, caseSensitive: caseSensitive) else {
            throw ValidationError("No albums found")
        }

        let jsonString = try albums.toJSONString()
        print(jsonString)
    }
}

struct PhotoInfo: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "photo-info",
        abstract:
            "Get photo asset information for given identifiers (UUID, file name, image title, album name, or photo path)"
    )

    @Flag(name: .shortAndLong, help: "Case sensitive matching")
    var caseSensitive = false

    @Argument(
        help:
            "Photo or album identifiers (UUIDs, file names, album names, image titles, or photo paths). If no identifiers are provided, returns all photos in the library."
    )
    var identifiers: [String] = []

    mutating func run() throws {
        try checkPhotosAccess()

        guard let photos = getPhotos(identifiers: identifiers, caseSensitive: caseSensitive) else {
            throw ValidationError("No photos found")
        }

        let jsonString = try photos.toJSONString()
        print(jsonString)
    }
}

struct Export: ParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "Export photos for given identifiers to a destination directory"
    )

    @Flag(name: .shortAndLong, help: "Case sensitive matching")
    var caseSensitive = false

    @Flag(name: .shortAndLong, help: "Always export original files (ignoring edits)")
    var originals = false

    @Option(name: .shortAndLong, help: "Destination directory for exported photos (defaults to current directory)")
    var destination: String?

    @Argument(
        help:
            "Photo or album identifiers (UUIDs, filenames, album names, or photo paths)"
    )
    var identifiers: [String]

    mutating func run() throws {
        try checkPhotosAccess()

        let destinationPath = destination ?? FileManager.default.currentDirectoryPath
        let expandedPath = NSString(string: destinationPath).expandingTildeInPath
        let destinationURL = URL(fileURLWithPath: expandedPath)

        guard
            let exportedURLs = exportPhotos(
                identifiers: identifiers,
                destination: destinationURL,
                caseSensitive: caseSensitive,
                originals: originals
            )
        else {
            throw ValidationError("No photos found for the provided identifiers or export failed")
        }

        let exportedPaths = exportedURLs.map { $0.path }
        let jsonData = try JSONSerialization.data(
            withJSONObject: exportedPaths, options: [.prettyPrinted, .withoutEscapingSlashes])

        if let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
    }
}
