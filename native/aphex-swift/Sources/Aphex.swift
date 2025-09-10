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

@main
struct aphex: ParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "A multi-command CLI tool for managing photo albums",
        subcommands: [Albums.self, Info.self, Export.self]
    )
}

struct Albums: ParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "Get album paths mapped to their UUIDs as JSON"
    )

    mutating func run() throws {
        let albumPaths = getAlbumPathsToUuidMap()
        let jsonData = try JSONSerialization.data(
            withJSONObject: albumPaths, options: [.prettyPrinted, .withoutEscapingSlashes])

        if let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
    }
}

struct Info: ParsableCommand {
    static let configuration = CommandConfiguration(
        abstract:
            "Get photo asset information for given identifiers (UUID, filename, album name, or photo path)"
    )

    @Flag(name: .shortAndLong, help: "Case sensitive matching")
    var caseSensitive = false

    @Argument(help: "Photo or album identifiers (UUIDs, filenames, album names, or photo paths)")
    var identifiers: [String]

    mutating func run() throws {

        guard let photos = getPhotos(identifiers: identifiers, caseSensitive: caseSensitive) else {
            throw ValidationError("No photos found for the provided identifiers")
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

    @Option(name: .shortAndLong, help: "Destination directory for exported photos")
    var destination: String

    @Argument(help: "Photo or album identifiers (UUIDs, filenames, album names, or photo paths)")
    var identifiers: [String]

    mutating func run() throws {
        let expandedPath = NSString(string: destination).expandingTildeInPath
        let destinationURL = URL(fileURLWithPath: expandedPath)

        guard
            let exportedURLs = exportPhotos(
                identifiers: identifiers,
                destination: destinationURL,
                caseSensitive: caseSensitive
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
