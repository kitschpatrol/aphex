import Cocoa
import Foundation
import Photos

// MARK: - Album Discovery

/// Function to get all album paths mapped to their UUIDs
public func getAlbumPathsToUuidMap() -> [String: String] {
  var albumPaths: [String: String] = [:]

  // Get all user collections (folders and user-created albums)
  let userCollections = PHCollectionList.fetchTopLevelUserCollections(with: nil)

  for i in 0..<userCollections.count {
    let collection = userCollections.object(at: i)
    if let list = collection as? PHCollectionList {
      let pathsFromList = getAlbumPathsFromCollectionList(list, basePath: "")
      albumPaths.merge(pathsFromList) { _, new in new }
    } else if let album = collection as? PHAssetCollection {
      let albumName = album.localizedTitle ?? "Untitled Album"
      let cleanUUID = cleanLocalIdentifier(album.localIdentifier)
      albumPaths["/\(albumName)"] = cleanUUID
    }
  }

  // Get all smart albums (top-level)
  let smartAlbums = PHAssetCollection.fetchAssetCollections(
    with: .smartAlbum, subtype: .any, options: nil)

  for i in 0..<smartAlbums.count {
    let smartAlbum = smartAlbums.object(at: i)
    let albumName = smartAlbum.localizedTitle ?? "Untitled Smart Album"
    let cleanUUID = cleanLocalIdentifier(smartAlbum.localIdentifier)
    albumPaths["/\(albumName)"] = cleanUUID
  }

  // Also check for smart albums organized in collection lists
  let allCollectionLists = PHCollectionList.fetchCollectionLists(
    with: .smartFolder, subtype: .any, options: nil)

  for i in 0..<allCollectionLists.count {
    let collectionList = allCollectionLists.object(at: i)
    let pathsFromList = getAlbumPathsFromCollectionList(collectionList, basePath: "")
    albumPaths.merge(pathsFromList) { _, new in new }
  }

  return albumPaths
}

// MARK: - Album Info

/// Function to get album information by UUID or name
public func getAlbum(
  identifier: String, albumMap: [String: String]? = nil, caseSensitive: Bool = false
) -> PHAssetCollection? {
  // Check if identifier looks like a UUID (8-4-4-4-12 pattern)
  if isUUID(identifier) {
    return getAlbumByUuid(uuid: identifier)
  }
  
  // Otherwise treat as album name/path
  let map = albumMap ?? getAlbumPathsToUuidMap()
  return getAlbumByName(name: identifier, albumMap: map, caseSensitive: caseSensitive)
}

/// Function to get album by UUID
func getAlbumByUuid(uuid: String) -> PHAssetCollection? {
  let fetchResult = PHAssetCollection.fetchAssetCollections(
    withLocalIdentifiers: [uuid], options: nil)
  return fetchResult.firstObject
}

/// Function to get album by name/path
func getAlbumByName(name: String, albumMap: [String: String], caseSensitive: Bool) -> PHAssetCollection? {
  let normalizedPath = normalizePath(name)
  
  // Find matching album in the map
  let matchingEntry = albumMap.first { (path, _) in
    let albumPath = normalizePath(path)
    return caseSensitive
      ? (albumPath == normalizedPath) : (albumPath.lowercased() == normalizedPath.lowercased())
  }
  
  guard let (_, albumUUID) = matchingEntry else {
    return nil
  }
  
  return getAlbumByUuid(uuid: albumUUID)
}

// MARK: - Album Photos

/// Function to get all PHAssets from an album by UUID or name
public func getAlbumPhotos(
  identifier: String, albumMap: [String: String]? = nil, caseSensitive: Bool = false
) -> [PHAsset]? {
  // Check if identifier looks like a UUID (8-4-4-4-12 pattern)
  if isUUID(identifier) {
    return getAlbumPhotosByUuid(uuid: identifier)
  }

  // Otherwise treat as album name/path
  let map = albumMap ?? getAlbumPathsToUuidMap()
  return getAlbumPhotosByName(name: identifier, albumMap: map, caseSensitive: caseSensitive)
}

/// Function to get all PHAssets from an album by its UUID
func getAlbumPhotosByUuid(uuid: String) -> [PHAsset]? {
  // Fetch the album by its local identifier
  let fetchResult = PHAssetCollection.fetchAssetCollections(
    withLocalIdentifiers: [uuid], options: nil)

  guard let album = fetchResult.firstObject else {
    return nil
  }

  // Fetch all assets in the album
  let assetFetchResult = PHAsset.fetchAssets(in: album, options: nil)

  var assets: [PHAsset] = []
  assetFetchResult.enumerateObjects { asset, _, _ in
    assets.append(asset)
  }

  return assets
}

/// Function to get all PHAssets from an album by album name/path
func getAlbumPhotosByName(name: String, albumMap: [String: String], caseSensitive: Bool)
  -> [PHAsset]?
{
  let normalizedPath = normalizePath(name)

  // Find matching album in the map
  let matchingEntry = albumMap.first { (path, _) in
    let albumPath = normalizePath(path)
    return caseSensitive
      ? (albumPath == normalizedPath) : (albumPath.lowercased() == normalizedPath.lowercased())
  }

  guard let (_, albumUUID) = matchingEntry else {
    return nil
  }

  return getAlbumPhotosByUuid(uuid: albumUUID)
}

// MARK: - Individual Photos

/// Function to get a single PHAsset by UUID or name/path
public func getPhoto(
  identifier: String, albumMap: [String: String]? = nil, caseSensitive: Bool = false
) -> PHAsset? {
  // Check if identifier looks like a UUID (8-4-4-4-12 pattern)
  if isUUID(identifier) {
    return getPhotoByUuid(uuid: identifier)
  }

  // Otherwise treat as photo name/path
  let map = albumMap ?? getAlbumPathsToUuidMap()

  // Use existing photo name lookup function and extract first result
  if let photoArray = getPhotoByName(name: identifier, albumMap: map, caseSensitive: caseSensitive)
  {
    return photoArray.first
  }

  return nil
}

/// Function to get a single PHAsset by its UUID
func getPhotoByUuid(uuid: String) -> PHAsset? {
  let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: [uuid], options: nil)
  return fetchResult.firstObject
}

/// Function to get a single PHAsset by photo name within an album path
func getPhotoByName(name: String, albumMap: [String: String], caseSensitive: Bool) -> [PHAsset]? {
  let normalizedPath = normalizePath(name)
  let pathComponents = normalizedPath.split(separator: "/").map(String.init)

  guard pathComponents.count >= 2 else {
    //        print("Warning: Photo path '\(name)' must contain at least album and photo name")
    return nil
  }

  // Pop the last segment (photo name) and reconstruct album path
  let photoName = pathComponents.last!
  let albumPath = "/" + pathComponents.dropLast().joined(separator: "/")

  // Get album photos using the album function
  guard
    let albumPhotos = getAlbumPhotosByName(
      name: albumPath, albumMap: albumMap, caseSensitive: caseSensitive)
  else {
    return nil
  }

  // Search for photo by title first, then filename
  let matchingPhoto = albumPhotos.first { asset in
    // Try title match first
    if let title = asset.value(forKey: "title") as? String {
      let titleMatch =
        caseSensitive ? (title == photoName) : (title.lowercased() == photoName.lowercased())
      if titleMatch {
        return true
      }
    }

    // Try filename match (requires extension)
    let resources = PHAssetResource.assetResources(for: asset)
    for resource in resources {
      let filename = resource.originalFilename
      let filenameMatch =
        caseSensitive ? (filename == photoName) : (filename.lowercased() == photoName.lowercased())
      if filenameMatch {
        return true
      }
    }

    return false
  }

  if let photo = matchingPhoto {
    return [photo]
  } else {
    return nil
  }
}

// MARK: - Combined albums / UUIDs/ Names

public func getPhotos(
  identifiers: [String], albumMap: [String: String]? = nil, caseSensitive: Bool = false
) -> [PHAsset]? {
  guard !identifiers.isEmpty else {
    return nil
  }

  // Get the album map once and reuse it
  let map = albumMap ?? getAlbumPathsToUuidMap()

  var allPhotos: [PHAsset] = []

  for identifier in identifiers {
    // Try as photo first (single photo)
    if let photo = getPhoto(identifier: identifier, albumMap: map, caseSensitive: caseSensitive) {
      allPhotos.append(photo)
    }
    // If not found as single photo, try as album (multiple photos)
    else if let albumPhotos = getAlbumPhotos(
      identifier: identifier, albumMap: map, caseSensitive: caseSensitive)
    {
      allPhotos.append(contentsOf: albumPhotos)
    }
  }

  // Return nil if no photos found anywhere, otherwise return the collected photos
  return allPhotos.isEmpty ? nil : allPhotos
}

// MARK: - Export photos

public func exportPhotos(
  identifiers: [String], destination: URL, albumMap: [String: String]? = nil,
  caseSensitive: Bool = false
) -> [URL]? {
  guard !identifiers.isEmpty else {
    return nil
  }

  var allUrls: [URL] = []

  let map = albumMap ?? getAlbumPathsToUuidMap()
  let photos = getPhotos(identifiers: identifiers, albumMap: map, caseSensitive: caseSensitive)

  guard photos != nil else {
    return nil
  }

  for photo in photos! {
    do {
      if let exportedUrl = try exportPhotoAsset(asset: photo, destination: destination) {
        allUrls.append(exportedUrl)
      }
    } catch {
      //
    }
  }

  return allUrls.isEmpty ? nil : allUrls
}

func exportPhotoAsset(asset: PHAsset, destination: URL) throws -> URL? {
  // Determine the final export URL
  let finalDestination: URL

  // Check if destination is a directory or a file path
  var isDirectory: ObjCBool = false
  if FileManager.default.fileExists(atPath: destination.path, isDirectory: &isDirectory) {
    if isDirectory.boolValue {
      // Destination is a directory - generate filename
      finalDestination = try generateFilename(for: asset, in: destination)
    } else {
      // Destination is an existing file - use as-is
      finalDestination = destination
    }
  } else {
    // Path doesn't exist - check if it has an extension
    if destination.pathExtension.isEmpty {
      // No extension, treat as directory that needs to be created
      throw NSError(
        domain: "ExportError", code: 1,
        userInfo: [
          NSLocalizedDescriptionKey: "Target directory does not exist: \(destination.path)"
        ])
    } else {
      // Has extension, treat as file path - check if parent directory exists
      let parentDirectory = destination.deletingLastPathComponent()
      if !FileManager.default.fileExists(atPath: parentDirectory.path) {
        throw NSError(
          domain: "ExportError", code: 2,
          userInfo: [
            NSLocalizedDescriptionKey: "Parent directory does not exist: \(parentDirectory.path)"
          ])
      }
      finalDestination = destination
    }
  }

  var exportedURL: URL?
  var exportError: Error?

  // Request the image data for the asset
  let options = PHImageRequestOptions()
  options.isNetworkAccessAllowed = true
  options.version = .current
  options.deliveryMode = .highQualityFormat
  options.isSynchronous = true  // Use synchronous for simplicity

  let imageManager = PHImageManager.default()
  imageManager.requestImageDataAndOrientation(for: asset, options: options) {
    imageData, dataUTI, orientation, info in
    guard let data = imageData else {
      exportError = NSError(
        domain: "ExportError", code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Failed to retrieve image data for asset"])
      return
    }

    // Write the image data to the destination URL
    do {
      try data.write(to: finalDestination)
      exportedURL = finalDestination
      // print("Image exported successfully to \(finalDestination.path)")
    } catch {
      exportError = error
    }
  }

  // Check for errors
  if let error = exportError {
    throw error
  }

  return exportedURL
}

// Helper function to generate a filename for an asset
private func generateFilename(for asset: PHAsset, in directory: URL) throws -> URL {
  // Get the original file extension
  let resources = PHAssetResource.assetResources(for: asset)
  guard let originalResource = resources.first(where: { $0.type == .photo || $0.type == .video })
  else {
    throw NSError(
      domain: "ExportError", code: 4,
      userInfo: [NSLocalizedDescriptionKey: "Could not determine file type for asset"])
  }

  let originalFilename = originalResource.originalFilename
  let fileExtension = (originalFilename as NSString).pathExtension

  // Try to use title first, then fall back to original filename
  let baseFilename: String
  if let title = asset.value(forKey: "title") as? String, !title.isEmpty {
    baseFilename = title
  } else {
    // Use original filename without extension
    baseFilename = (originalFilename as NSString).deletingPathExtension
  }

  // Clean the filename (remove invalid characters)
  let cleanFilename = cleanFilename(baseFilename)

  // Construct final filename with extension
  let filename = fileExtension.isEmpty ? cleanFilename : "\(cleanFilename).\(fileExtension)"

  return directory.appendingPathComponent(filename)
}

// Helper function to clean filename by removing invalid characters
private func cleanFilename(_ filename: String) -> String {
  let invalidCharacters = CharacterSet(charactersIn: ":/\\?%*|\"<>")
  return filename.components(separatedBy: invalidCharacters).joined(separator: "_")
}

// MARK: - Helper Functions

/// Check if a string matches UUID format (8-4-4-4-12 pattern)
func isUUID(_ string: String) -> Bool {
  let uuidRegex = "^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$"
  return string.range(of: uuidRegex, options: .regularExpression) != nil
}

/// Normalize path by removing leading/trailing slashes and handling multiple consecutive slashes
func normalizePath(_ path: String) -> String {
  let trimmed = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
  let normalized =
    "/" + trimmed.replacingOccurrences(of: "/+", with: "/", options: .regularExpression)
  return normalized == "/" ? "/" : normalized
}

/// Recursive helper function to traverse collection lists and build paths
func getAlbumPathsFromCollectionList(_ collectionList: PHCollectionList, basePath: String)
  -> [String: String]
{
  var albumPaths: [String: String] = [:]
  let folderName = collectionList.localizedTitle ?? "Untitled Folder"
  let currentPath = basePath.isEmpty ? folderName : "\(basePath)/\(folderName)"

  // Get collections within this list
  let collections = PHCollection.fetchCollections(in: collectionList, options: nil)

  for i in 0..<collections.count {
    let collection = collections.object(at: i)
    if let subList = collection as? PHCollectionList {
      let pathsFromSubList = getAlbumPathsFromCollectionList(subList, basePath: currentPath)
      albumPaths.merge(pathsFromSubList) { _, new in new }
    } else if let album = collection as? PHAssetCollection {
      let albumName = album.localizedTitle ?? "Untitled Album"
      let fullPath = "/\(currentPath)/\(albumName)"
      let cleanUUID = cleanLocalIdentifier(album.localIdentifier)
      albumPaths[fullPath] = cleanUUID
    }
  }

  return albumPaths
}

/// Helper function to clean local identifier (remove /L0/001 suffix if present)
func cleanLocalIdentifier(_ identifier: String) -> String {
  if let range = identifier.range(of: "/L0/") {
    return String(identifier[..<range.lowerBound])
  }
  return identifier
}

/// Extend NSImage to support saving in PNG format
extension NSImage {
  func savePng(to url: URL) throws {
    guard let tiffData = self.tiffRepresentation,
      let bitmapImage = NSBitmapImageRep(data: tiffData)
    else {
      throw NSError(
        domain: "com.example.imageSave", code: 0,
        userInfo: [NSLocalizedDescriptionKey: "Failed to convert image to PNG"])
    }

    // Create PNG data from the sRGB tagged bitmap image
    guard let pngData = bitmapImage.representation(using: .png, properties: [:]) else {
      throw NSError(
        domain: "com.example.imageSave", code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Failed to create PNG data"])
    }

    try pngData.write(to: url)
  }
}

// Via https://github.com/RhetTbull/osxphotos/blob/059e41d877f3c8c6140152e5fcda717f47391856/osxphotos/utils.py#L158
/// Get the system photos library URL, or nil if it cannot be determined
func getSystemLibraryPath() -> URL? {
  // Simple memoization using static let (computed once)
  struct Cache {
    static let result: URL? = _getSystemLibraryPathInternal()
  }
  return Cache.result
}

/// Internal implementation of getSystemLibraryPath
private func _getSystemLibraryPathInternal() -> URL? {
  let homeURL = FileManager.default.homeDirectoryForCurrentUser

  // Build path to plist file
  let plistURL =
    homeURL
    .appendingPathComponent("Library")
    .appendingPathComponent("Containers")
    .appendingPathComponent("com.apple.photolibraryd")
    .appendingPathComponent("Data")
    .appendingPathComponent("Library")
    .appendingPathComponent("Preferences")
    .appendingPathComponent("com.apple.photolibraryd.plist")

  // Try to read system library path from plist
  if FileManager.default.fileExists(atPath: plistURL.path) {
    do {
      let data = try Data(contentsOf: plistURL)
      let plist = try PropertyListSerialization.propertyList(from: data, format: nil)

      if let dict = plist as? [String: Any] {
        // Try to get SystemLibraryPath
        if let systemLibraryPath = dict["SystemLibraryPath"] as? String {
          let libraryURL = URL(fileURLWithPath: systemLibraryPath)
          if FileManager.default.fileExists(atPath: libraryURL.path) {
            return libraryURL
          }
        }

        // Try to get lastKnownSPLPath from nested dictionary
        if let universalSearchEligibility = dict["search.coreSpotlight.universalSearchEligibility"]
          as? [String: Any],
          let lastKnownSPLPath = universalSearchEligibility["search.coreSpotlight.lastKnownSPLPath"]
            as? String
        {
          let libraryURL = URL(fileURLWithPath: lastKnownSPLPath)
          if FileManager.default.fileExists(atPath: libraryURL.path) {
            return libraryURL
          }
        }
      }
    } catch {
      //
    }
  }

  // Fall back to default library path
  let defaultLibraryURL =
    homeURL
    .appendingPathComponent("Pictures")
    .appendingPathComponent("Photos Library.photoslibrary")

  if FileManager.default.fileExists(atPath: defaultLibraryURL.path) {
    return defaultLibraryURL
  }

  return nil
}
