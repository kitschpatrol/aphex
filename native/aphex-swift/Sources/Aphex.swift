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
        subcommands: [Albums.self, AlbumInfo.self, PhotoInfo.self, Export.self]
    )
}

struct Albums: ParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "Get album paths mapped to their UUIDs as JSON"
    )

    mutating func run() throws {
        try checkPhotosAccess()

        let albumPaths = getAlbumPathsToUuidMap()
        let jsonData = try JSONSerialization.data(
            withJSONObject: albumPaths, options: [.prettyPrinted, .withoutEscapingSlashes])

        if let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
    }
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
            "Get photo asset information for given identifiers (UUID, filename, album name, or photo path)"
    )

    @Flag(name: .shortAndLong, help: "Case sensitive matching")
    var caseSensitive = false

    @Argument(
        help:
            "Photo or album identifiers (UUIDs, filenames, album names, or photo paths). If no identifiers are provided, returns all photos in the library."
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

    @Option(name: .shortAndLong, help: "Destination directory for exported photos")
    var destination: String

    @Argument(
        help:
            "Photo or album identifiers (UUIDs, filenames, album names, or photo paths)"
    )
    var identifiers: [String]

    mutating func run() throws {
        try checkPhotosAccess()

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
