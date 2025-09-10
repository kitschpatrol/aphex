import Foundation
import Cocoa
import Photos
import ArgumentParser

// Extend NSImage to support saving in PNG format
extension NSImage {
    func savePng(to url: URL) throws {
        guard let tiffData = self.tiffRepresentation,
              let bitmapImage = NSBitmapImageRep(data: tiffData) else {
            throw NSError(domain: "com.example.imageSave", code: 0, userInfo: [NSLocalizedDescriptionKey: "Failed to convert image to PNG"])
        }

        // Create PNG data from the sRGB tagged bitmap image
        guard let pngData = bitmapImage.representation(using: .png, properties: [:]) else {
            throw NSError(domain: "com.example.imageSave", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to create PNG data"])
        }

        try pngData.write(to: url)
        print("PNG image saved successfully in sRGB color space to \(url.path)")
    }
}

// Main CLI tool
@main
struct PhotoKitExport: ParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "A tool for exporting photos from Apple Photos using PhotoKit",
        subcommands: [Export.self, Lookup.self],
        defaultSubcommand: Export.self
    )
}

// Export command - contains the current functionality
struct Export: ParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "Export a photo from Apple Photos by UUID"
    )
    
    @Option(name: .long, help: "The UUID of the photo to export")
    var photoUuid: String
    
    @Option(name: .long, help: "The destination directory for the exported photo")
    var destinationDirectory: String
    
    @Option(name: .long, help: "The filename for the exported photo (without extension)")
    var filename: String
    
    @Option(name: .long, help: "The export mode: 'requestimage' or 'requestimagedataandorientation'")
    var mode: String = "requestimage"
    
    func validate() throws {
        let validModes = ["requestimage", "requestimagedataandorientation"]
        guard validModes.contains(mode.lowercased()) else {
            throw ValidationError("Mode must be one of: \(validModes.joined(separator: ", "))")
        }
    }
    
    func run() throws {
        // Request Photos authorization
        let authorizationStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        
        switch authorizationStatus {
        case .authorized, .limited:
            break
        case .denied, .restricted:
            print("Error: Photos access denied. Please grant permission in System Preferences > Privacy & Security > Photos")
            return
        case .notDetermined:
            // Request authorization synchronously
            let semaphore = DispatchSemaphore(value: 0)
            var finalStatus: PHAuthorizationStatus = .notDetermined
            
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
                finalStatus = status
                semaphore.signal()
            }
            
            semaphore.wait()
            
            guard finalStatus == .authorized || finalStatus == .limited else {
                print("Photos access denied")
                return
            }
        @unknown default:
            print("Unknown authorization status")
            return
        }
        
        let destination = URL(fileURLWithPath: destinationDirectory).appendingPathComponent("\(filename).png")
        
        let imageManager = PHImageManager.default()
        let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: [photoUuid], options: nil)
        guard let asset = fetchResult.firstObject else {
            print("No asset found with the specified identifier.")
            return
        }

        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = true
        options.version = .current
        options.deliveryMode = .highQualityFormat
        options.isSynchronous = true
        options.resizeMode = .exact

        if mode.lowercased() == "requestimage" {
            imageManager.requestImage(for: asset, targetSize: PHImageManagerMaximumSize, contentMode: .aspectFit, options: options) { image, info in
                guard let image = image else {
                    print("Error loading image: \(info?[PHImageErrorKey] ?? "Unknown error")")
                    return
                }
                do {
                    try image.savePng(to: destination)
                } catch {
                    print("Error saving image: \(error.localizedDescription)")
                }
            }
        } else if mode.lowercased() == "requestimagedataandorientation" {
            imageManager.requestImageDataAndOrientation(for: asset, options: options) { imageData, dataUTI, orientation, info in
                guard let data = imageData else {
                    print("Failed to retrieve image data.")
                    return
                }

                if let image = NSImage(data: data) {
                    do {
                        try image.savePng(to: destination)
                    } catch {
                        print("Error saving image: \(error.localizedDescription)")
                    }
                } else {
                    print("Failed to create NSImage from image data.")
                }
            }
        }
    }
}

// Lookup command - find UUIDs for albums or photos by path
struct Lookup: ParsableCommand {
    static let configuration = CommandConfiguration(
        abstract: "Look up UUIDs for albums or photos using path-like syntax"
    )
    
    @Argument(help: "Path to album or photo (e.g., 'album-name', '/album-name/photo-title', '/folder/album-name/file-name.heic')")
    var path: String
    
    @Flag(name: .long, help: "Show detailed information about found items")
    var verbose: Bool = false
    
    func run() throws {
        // Request Photos authorization first
        let authorizationStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        
        switch authorizationStatus {
        case .authorized, .limited:
            break
        case .denied, .restricted:
            print("Error: Photos access denied. Please grant permission in System Preferences > Privacy & Security > Photos")
            return
        case .notDetermined:
            print("Photos permission not determined. Please run the export command first to grant permission.")
            return
        @unknown default:
            print("Unknown authorization status")
            return
        }
        
        let components = path.split(separator: "/").map(String.init)
        
        if components.isEmpty {
            print("Error: Empty path provided")
            return
        }
        
        // Remove empty components from leading slash
        let cleanComponents = components.filter { !$0.isEmpty }
        
        if cleanComponents.count == 1 {
            // Looking for an album (could be at root or anywhere)
            searchForAlbum(name: cleanComponents[0], inFolderPath: [])
        } else {
            // Check if last component looks like a photo (has file extension) or is an album
            let lastComponent = cleanComponents.last!
            let hasImageExtension = lastComponent.lowercased().hasSuffix(".heic") || 
                                   lastComponent.lowercased().hasSuffix(".jpg") || 
                                   lastComponent.lowercased().hasSuffix(".jpeg") || 
                                   lastComponent.lowercased().hasSuffix(".png") || 
                                   lastComponent.lowercased().hasSuffix(".gif") || 
                                   lastComponent.lowercased().hasSuffix(".mov") || 
                                   lastComponent.lowercased().hasSuffix(".mp4") ||
                                   lastComponent.lowercased().contains("img_") ||
                                   lastComponent.lowercased().contains("dsc")
            
            if hasImageExtension {
                // Looking for a photo in an album
                let albumPath = Array(cleanComponents.dropLast())
                searchForPhoto(albumPath: albumPath, photoName: lastComponent)
            } else {
                // Looking for an album in a folder path
                let folderPath = Array(cleanComponents.dropLast())
                let albumName = lastComponent
                searchForAlbum(name: albumName, inFolderPath: folderPath)
            }
        }
    }
    
    private func searchForAlbum(name: String, inFolderPath folderPath: [String]) {
        var foundAlbums: [(PHAssetCollection, String)] = []
        
        if folderPath.isEmpty {
            // Search at root level - both direct albums and within any folder
            foundAlbums.append(contentsOf: searchAlbumsAtRoot(name: name))
            foundAlbums.append(contentsOf: searchAlbumsInAllFolders(name: name))
        } else {
            // Search within specific folder path
            if let targetFolder = findFolderAtPath(folderPath) {
                foundAlbums.append(contentsOf: searchAlbumsInFolder(name: name, folder: targetFolder, folderPath: folderPath.joined(separator: "/")))
            } else {
                print("Folder path '\(folderPath.joined(separator: "/"))' not found")
                
                if verbose {
                    print("\nAvailable folders:")
                    listAllFolders()
                }
                return
            }
        }
        
        if foundAlbums.isEmpty {
            print("No albums found matching: \(name)" + (folderPath.isEmpty ? "" : " in folder path '\(folderPath.joined(separator: "/"))'"))
            
            if verbose {
                if folderPath.isEmpty {
                    print("\nAvailable albums and folders:")
                    listAllAlbumsAndFolders()
                } else {
                    print("\nAvailable items in '\(folderPath.joined(separator: "/"))':")
                    if let folder = findFolderAtPath(folderPath) {
                        listContentsOfFolder(folder)
                    }
                }
            }
        } else {
            print("Found \(foundAlbums.count) album(s) matching '\(name)':")
            for (album, path) in foundAlbums {
                let assetCount = PHAsset.fetchAssets(in: album, options: nil).count
                print("  UUID: \(album.localIdentifier)")
                if verbose {
                    print("    Title: \(album.localizedTitle ?? "Unknown")")
                    print("    Path: \(path)")
                    print("    Asset Count: \(assetCount)")
                }
            }
        }
    }
    
    private func searchAlbumsAtRoot(name: String) -> [(PHAssetCollection, String)] {
        var foundAlbums: [(PHAssetCollection, String)] = []
        
        // Search root-level albums
        let albumResults = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil)
        albumResults.enumerateObjects { collection, _, _ in
            if let title = collection.localizedTitle,
               title.localizedCaseInsensitiveContains(name) {
                foundAlbums.append((collection, title))
            }
        }
        
        // Search smart albums
        let smartAlbumResults = PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: .any, options: nil)
        smartAlbumResults.enumerateObjects { collection, _, _ in
            if let title = collection.localizedTitle,
               title.localizedCaseInsensitiveContains(name) {
                foundAlbums.append((collection, title))
            }
        }
        
        return foundAlbums
    }
    
    private func searchAlbumsInAllFolders(name: String) -> [(PHAssetCollection, String)] {
        var foundAlbums: [(PHAssetCollection, String)] = []
        
        let topLevelFolders = PHCollectionList.fetchTopLevelUserCollections(with: nil)
        topLevelFolders.enumerateObjects { collection, _, _ in
            if let folder = collection as? PHCollectionList {
                foundAlbums.append(contentsOf: searchAlbumsInFolderRecursive(name: name, folder: folder, currentPath: folder.localizedTitle ?? "Unknown"))
            }
        }
        
        return foundAlbums
    }
    
    private func searchAlbumsInFolderRecursive(name: String, folder: PHCollectionList, currentPath: String) -> [(PHAssetCollection, String)] {
        var foundAlbums: [(PHAssetCollection, String)] = []
        
        let collections = PHCollection.fetchCollections(in: folder, options: nil)
        collections.enumerateObjects { collection, _, _ in
            if let album = collection as? PHAssetCollection,
               let title = album.localizedTitle,
               title.localizedCaseInsensitiveContains(name) {
                foundAlbums.append((album, "\(currentPath)/\(title)"))
            } else if let subFolder = collection as? PHCollectionList {
                let subPath = "\(currentPath)/\(subFolder.localizedTitle ?? "Unknown")"
                foundAlbums.append(contentsOf: searchAlbumsInFolderRecursive(name: name, folder: subFolder, currentPath: subPath))
            }
        }
        
        return foundAlbums
    }
    
    private func findFolderAtPath(_ path: [String]) -> PHCollectionList? {
        guard !path.isEmpty else { return nil }
        
        let topLevelFolders = PHCollectionList.fetchTopLevelUserCollections(with: nil)
        var currentFolder: PHCollectionList?
        
        topLevelFolders.enumerateObjects { collection, _, stop in
            if let folder = collection as? PHCollectionList,
               let title = folder.localizedTitle,
               title.localizedCaseInsensitiveCompare(path[0]) == .orderedSame {
                currentFolder = folder
                stop.pointee = true
            }
        }
        
        guard let startFolder = currentFolder else { return nil }
        
        // Navigate deeper into the folder hierarchy
        currentFolder = startFolder
        for folderName in path.dropFirst() {
            guard let current = currentFolder else { return nil }
            
            let collections = PHCollection.fetchCollections(in: current, options: nil)
            var found = false
            
            collections.enumerateObjects { collection, _, stop in
                if let subFolder = collection as? PHCollectionList,
                   let title = subFolder.localizedTitle,
                   title.localizedCaseInsensitiveCompare(folderName) == .orderedSame {
                    currentFolder = subFolder
                    found = true
                    stop.pointee = true
                }
            }
            
            if !found {
                return nil
            }
        }
        
        return currentFolder
    }
    
    private func searchAlbumsInFolder(name: String, folder: PHCollectionList, folderPath: String) -> [(PHAssetCollection, String)] {
        var foundAlbums: [(PHAssetCollection, String)] = []
        
        let collections = PHCollection.fetchCollections(in: folder, options: nil)
        collections.enumerateObjects { collection, _, _ in
            if let album = collection as? PHAssetCollection,
               let title = album.localizedTitle,
               title.localizedCaseInsensitiveContains(name) {
                foundAlbums.append((album, "\(folderPath)/\(title)"))
            }
        }
        
        return foundAlbums
    }
    
    private func listAllFolders() {
        let topLevelFolders = PHCollectionList.fetchTopLevelUserCollections(with: nil)
        topLevelFolders.enumerateObjects { collection, _, _ in
            if let folder = collection as? PHCollectionList {
                listFolderRecursive(folder: folder, indent: "")
            }
        }
    }
    
    private func listFolderRecursive(folder: PHCollectionList, indent: String) {
        print("\(indent)📁 \(folder.localizedTitle ?? "Unknown")")
        
        let collections = PHCollection.fetchCollections(in: folder, options: nil)
        collections.enumerateObjects { collection, _, _ in
            if let subFolder = collection as? PHCollectionList {
                listFolderRecursive(folder: subFolder, indent: indent + "  ")
            } else if let album = collection as? PHAssetCollection {
                print("\(indent)  📸 \(album.localizedTitle ?? "Unknown")")
            }
        }
    }
    
    private func listAllAlbumsAndFolders() {
        // List root albums
        let albumResults = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil)
        albumResults.enumerateObjects { collection, _, _ in
            print("📸 \(collection.localizedTitle ?? "Unknown")")
        }
        
        // List smart albums
        let smartAlbumResults = PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: .any, options: nil)
        smartAlbumResults.enumerateObjects { collection, _, _ in
            print("⚡ \(collection.localizedTitle ?? "Unknown") (Smart Album)")
        }
        
        // List folders and their contents
        listAllFolders()
    }
    
    private func listContentsOfFolder(_ folder: PHCollectionList) {
        let collections = PHCollection.fetchCollections(in: folder, options: nil)
        collections.enumerateObjects { collection, _, _ in
            if let subFolder = collection as? PHCollectionList {
                print("📁 \(subFolder.localizedTitle ?? "Unknown")")
            } else if let album = collection as? PHAssetCollection {
                print("📸 \(album.localizedTitle ?? "Unknown")")
            }
        }
    }
    
    private func searchForPhoto(albumPath: [String], photoName: String) {
        var foundAlbums: [(PHAssetCollection, String)] = []
        
        if albumPath.count == 1 {
            // Single album name, search everywhere
            foundAlbums.append(contentsOf: searchAlbumsAtRoot(name: albumPath[0]))
            foundAlbums.append(contentsOf: searchAlbumsInAllFolders(name: albumPath[0]))
        } else {
            // Multi-component path - navigate folder structure
            let folderPath = Array(albumPath.dropLast())
            let albumName = albumPath.last!
            
            if let targetFolder = findFolderAtPath(folderPath) {
                foundAlbums.append(contentsOf: searchAlbumsInFolder(name: albumName, folder: targetFolder, folderPath: folderPath.joined(separator: "/")))
            }
        }
        
        if foundAlbums.isEmpty {
            print("No albums found for path: \(albumPath.joined(separator: "/"))")
            return
        }
        
        var foundPhotos: [(PHAsset, String)] = []
        
        for (album, albumPath) in foundAlbums {
            let assetFetchOptions = PHFetchOptions()
            let assets = PHAsset.fetchAssets(in: album, options: assetFetchOptions)
            
            assets.enumerateObjects { asset, _, _ in
                // Try to match by filename or title
                if let filename = asset.value(forKey: "filename") as? String {
                    if filename.localizedCaseInsensitiveContains(photoName) || 
                       photoName.localizedCaseInsensitiveContains(filename) {
                        foundPhotos.append((asset, albumPath))
                    }
                }
            }
        }
        
        if foundPhotos.isEmpty {
            print("No photos found matching '\(photoName)' in albums at path '\(albumPath.joined(separator: "/"))'")
        } else {
            print("Found \(foundPhotos.count) photo(s) matching '\(photoName)':")
            for (photo, albumPath) in foundPhotos {
                print("  UUID: \(photo.localIdentifier)")
                if verbose {
                    let filename = photo.value(forKey: "filename") as? String ?? "Unknown"
                    print("    Filename: \(filename)")
                    print("    Album Path: \(albumPath)")
                    print("    Media Type: \(photo.mediaType.rawValue)")
                    print("    Creation Date: \(photo.creationDate?.description ?? "Unknown")")
                }
            }
        }
    }
}
