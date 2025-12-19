import Cocoa
import Foundation
import Photos

// MARK: - Photos Access Permission

/// Check if the app has access to the Photos library
func checkPhotosAccess() throws {
  let status = PHPhotoLibrary.authorizationStatus()

  switch status {
  case .authorized, .limited:
    // Access granted
    return
  case .denied:
    throw PhotosAccessError.denied
  case .restricted:
    throw PhotosAccessError.restricted
  case .notDetermined:
    throw PhotosAccessError.notDetermined
  @unknown default:
    throw PhotosAccessError.unknown
  }
}

/// Custom error types for Photos access
enum PhotosAccessError: LocalizedError {
  case denied
  case restricted
  case notDetermined
  case unknown

  var errorDescription: String? {
    switch self {
    case .denied:
      return
        "Photos access denied. Please grant access in System Preferences > Security & Privacy > Privacy > Photos."
    case .restricted:
      return "Photos access restricted. This may be due to parental controls or corporate policies."
    case .notDetermined:
      return
        "Photos access not determined. Please grant access when prompted, or check System Preferences > Security & Privacy > Privacy > Photos."
    case .unknown:
      return "Unknown Photos access status."
    }
  }
}

// MARK: - Album Discovery

/// Function to get all album paths mapped to their UUIDs
public func getAlbumPathsToUuidMap() -> [String: String] {
  // Simple memoization using static let (computed once)
  struct Cache {
    static let result: [String: String] = _getAlbumPathsToUuidMapInternal()
  }
  return Cache.result
}

/// Internal implementation of getSystemLibraryPath
private func _getAlbumPathsToUuidMapInternal() -> [String: String] {
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
      let cleanUuid = cleanLocalIdentifier(album.localIdentifier)
      albumPaths["/\(albumName)"] = cleanUuid
    }
  }

  // Get all smart albums (top-level)
  let smartAlbums = PHAssetCollection.fetchAssetCollections(
    with: .smartAlbum, subtype: .any, options: nil)

  for i in 0..<smartAlbums.count {
    let smartAlbum = smartAlbums.object(at: i)
    let albumName = smartAlbum.localizedTitle ?? "Untitled Smart Album"
    let cleanUuid = cleanLocalIdentifier(smartAlbum.localIdentifier)
    albumPaths["/\(albumName)"] = cleanUuid
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
func getAlbum(
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
func getAlbumByName(name: String, albumMap: [String: String], caseSensitive: Bool)
  -> PHAssetCollection?
{
  let normalizedPath = normalizePath(name)

  // Find matching album in the map
  let matchingEntry = albumMap.first { (path, _) in
    let albumPath = normalizePath(path)
    return caseSensitive
      ? (albumPath == normalizedPath) : (albumPath.lowercased() == normalizedPath.lowercased())
  }

  guard let (_, albumLocalIdentifier) = matchingEntry else {
    return nil
  }

  return getAlbumByUuid(uuid: albumLocalIdentifier)
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
  // Fetch the album by its UUID
  let fetchResult = PHAssetCollection.fetchAssetCollections(
    withLocalIdentifiers: [uuid], options: nil)

  guard let album = fetchResult.firstObject else {
    return nil
  }

  // Fetch only photo assets in the album
  let fetchOptions = PHFetchOptions()
  fetchOptions.predicate = NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue)
  let assetFetchResult = PHAsset.fetchAssets(in: album, options: fetchOptions)

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

  guard let (_, albumUuid) = matchingEntry else {
    return nil
  }

  return getAlbumPhotosByUuid(uuid: albumUuid)
}

// MARK: - Individual Photos

/// Function to get a single PHAsset by UUID or name / path
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
  let fetchOptions = PHFetchOptions()
  fetchOptions.predicate = NSPredicate(format: "mediaType == %d", PHAssetMediaType.image.rawValue)
  let fetchResult = PHAsset.fetchAssets(
    withLocalIdentifiers: [uuid], options: fetchOptions)
  return fetchResult.firstObject
}

/// Function to get a single PHAsset by photo name within an album path
func getPhotoByName(name: String, albumMap: [String: String], caseSensitive: Bool) -> [PHAsset]? {
  let normalizedPath = normalizePath(name)
  let pathComponents = normalizedPath.split(separator: "/").map(String.init)

  guard pathComponents.count >= 2 else {
    // print("Warning: Photo path '\(name)' must contain at least album and photo name")
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

  // Search for photo by title first, then filename (photos only)
  let matchingPhoto = albumPhotos.first { asset in
    // Only match photo assets
    guard asset.mediaType == .image else { return false }

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
    for resource in resources where resource.type == .photo {
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

// MARK: - All Photos

func getAllPhotos() -> [PHAsset]? {
  // This is pretty fast even for my 60k photo library
  // It's JSON serialization that kills performance.
  let fetchOptions = PHFetchOptions()
  fetchOptions.predicate = NSPredicate(
    format: "mediaType == %d",
    PHAssetMediaType.image.rawValue
  )

  let fetchResult = PHAsset.fetchAssets(with: fetchOptions)
  guard fetchResult.count > 0 else { return nil }

  var assets = [PHAsset]()
  assets.reserveCapacity(fetchResult.count)  // Pre-allocate memory
  fetchResult.enumerateObjects { asset, _, _ in
    assets.append(asset)
  }

  return assets
}

// MARK: - All Albums

func getAllAlbums(albumMap: [String: String]? = nil) -> [PHAssetCollection] {
  let map = albumMap ?? getAlbumPathsToUuidMap()

  return map.compactMap { (_, uuid) in
    getAlbumByUuid(uuid: uuid)
  }
}

// MARK: - Combined Albums / UUIDs / Names

public func getPhotos(
  identifiers: [String], albumMap: [String: String]? = nil, caseSensitive: Bool = false
) -> [PHAsset]? {
  guard !identifiers.isEmpty else {
    return getAllPhotos()
  }

  // Get the album map once and reuse it
  let map = albumMap ?? getAlbumPathsToUuidMap()

  var allPhotos: [PHAsset] = []

  for identifier in identifiers {
    // Try as photo first (single photo)
    if let photo = getPhoto(identifier: identifier, albumMap: map, caseSensitive: caseSensitive) {
      // Only add if it's a photo asset
      if photo.mediaType == .image {
        allPhotos.append(photo)
      }
    }
    // If not found as single photo, try as album (multiple photos)
    else if let albumPhotos = getAlbumPhotos(
      identifier: identifier, albumMap: map, caseSensitive: caseSensitive)
    {
      // Filter to only include photo assets
      let photoAssets = albumPhotos.filter { $0.mediaType == .image }
      allPhotos.append(contentsOf: photoAssets)
    }
  }

  // Return nil if no photos found anywhere, otherwise return the collected photos
  return allPhotos.isEmpty ? nil : allPhotos
}

public func getAlbums(
  identifiers: [String], albumMap: [String: String]? = nil, caseSensitive: Bool = false
) -> [PHAssetCollection]? {
  // Get the album map once and reuse it, even though it's memoized...

  let map = albumMap ?? getAlbumPathsToUuidMap()

  guard !identifiers.isEmpty else {
    return getAllAlbums(albumMap: map)
  }

  var allAlbums: [PHAssetCollection] = []

  for identifier in identifiers {
    // Try to find album by identifier
    if let album = getAlbum(identifier: identifier, albumMap: map, caseSensitive: caseSensitive) {
      allAlbums.append(album)
    }
  }

  // Return nil if no albums found anywhere, otherwise return the collected albums
  return allAlbums.isEmpty ? nil : allAlbums
}

// MARK: - Export photos

public func exportPhotos(
  identifiers: [String], destination: URL, albumMap: [String: String]? = nil,
  caseSensitive: Bool = false, originals: Bool = false
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
    // Only export photo assets
    guard photo.mediaType == .image else { continue }

    do {
      if let exportedUrl = try exportPhotoAsset(asset: photo, destination: destination, originals: originals) {
        allUrls.append(exportedUrl)
      }
    } catch {
      //
    }
  }

  return allUrls.isEmpty ? nil : allUrls
}

func exportPhotoAsset(asset: PHAsset, destination: URL, originals: Bool = false) throws -> URL? {
  // Only export photo assets
  guard asset.mediaType == .image else {
    throw NSError(
      domain: "ExportError", code: 5,
      userInfo: [
        NSLocalizedDescriptionKey: "Asset is not a photo - only photo assets can be exported"
      ])
  }

  // Check if destination is a directory or a file path
  var isDirectory: ObjCBool = false
  let destinationDirectory: URL
  let explicitFilename: String?
  
  if FileManager.default.fileExists(atPath: destination.path, isDirectory: &isDirectory) {
    if isDirectory.boolValue {
      destinationDirectory = destination
      explicitFilename = nil
    } else {
      // Destination is an existing file - use as-is
      destinationDirectory = destination.deletingLastPathComponent()
      explicitFilename = destination.lastPathComponent
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
      destinationDirectory = parentDirectory
      explicitFilename = destination.lastPathComponent
    }
  }

  // Get asset resources
  let resources = PHAssetResource.assetResources(for: asset)
  
  // If originals flag is set, copy the original file directly
  if originals {
    guard let originalResource = resources.first(where: { $0.type == .photo }) else {
      throw NSError(
        domain: "ExportError", code: 6,
        userInfo: [NSLocalizedDescriptionKey: "Could not find original resource for photo asset"])
    }
    
    // Get the original file path
    guard let originalPath = originalResource.value(forKey: "privateFileURL") as? URL else {
      throw NSError(
        domain: "ExportError", code: 7,
        userInfo: [NSLocalizedDescriptionKey: "Could not determine file path for original resource"])
    }
    
    // Determine the final destination URL
    let finalDestination: URL
    if let filename = explicitFilename {
      finalDestination = destinationDirectory.appendingPathComponent(filename)
    } else {
      finalDestination = try generateFilename(
        for: asset, 
        in: destinationDirectory, 
        uti: originalResource.uniformTypeIdentifier
      )
    }
    
    // Copy the original file directly
    try FileManager.default.copyItem(at: originalPath, to: finalDestination)
    return finalDestination
  }

  // Default behavior: export edited version if available, otherwise original
  // Determine which resource will be exported and get its UTI
  let exportedUTI: String
  if asset.hasAdjustments, let editedResource = resources.first(where: { $0.type == .fullSizePhoto }) {
    // Edited version will be exported
    exportedUTI = editedResource.uniformTypeIdentifier
  } else if let originalResource = resources.first(where: { $0.type == .photo }) {
    // Original version will be exported
    exportedUTI = originalResource.uniformTypeIdentifier
  } else {
    throw NSError(
      domain: "ExportError", code: 6,
      userInfo: [NSLocalizedDescriptionKey: "Could not determine resource type for photo asset"])
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

    // Determine the final destination URL
    let finalDestination: URL
    if let filename = explicitFilename {
      // Use the explicit filename provided
      finalDestination = destinationDirectory.appendingPathComponent(filename)
    } else {
      // Generate filename based on asset title/filename and actual UTI
      do {
        finalDestination = try generateFilename(
          for: asset, 
          in: destinationDirectory, 
          uti: exportedUTI
        )
      } catch {
        exportError = error
        return
      }
    }

    // Write the image data to the destination URL
    do {
      try data.write(to: finalDestination)
      exportedURL = finalDestination
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
private func generateFilename(for asset: PHAsset, in directory: URL, uti: String?) throws -> URL {
  // Only handle photo assets
  guard asset.mediaType == .image else {
    throw NSError(
      domain: "ExportError", code: 4,
      userInfo: [
        NSLocalizedDescriptionKey: "Asset is not a photo - only photo assets are supported"
      ])
  }

  // Get the base filename: title if available, otherwise original filename without extension
  let baseFilename: String
  if let title = asset.value(forKey: "title") as? String, !title.isEmpty {
    // Remove any file extension from the title
    baseFilename = (title as NSString).deletingPathExtension
  } else {
    // Fall back to original filename without extension
    let resources = PHAssetResource.assetResources(for: asset)
    if let originalResource = resources.first(where: { $0.type == .photo }) {
      let originalFilename = originalResource.originalFilename
      baseFilename = (originalFilename as NSString).deletingPathExtension
    } else {
      throw NSError(
        domain: "ExportError", code: 4,
        userInfo: [NSLocalizedDescriptionKey: "Could not determine filename for photo asset"])
    }
  }

  // Clean the filename (remove invalid characters)
  let cleanBase = cleanFilename(baseFilename)

  // Determine the file extension based on the actual UTI of the exported data
  let fileExtension = uti.flatMap { utiToFileExtension($0) } ?? "jpeg"

  // Construct final filename with extension
  let filename = "\(cleanBase).\(fileExtension)"

  return directory.appendingPathComponent(filename)
}

// Helper function to map UTI (Uniform Type Identifier) to file extension
private func utiToFileExtension(_ uti: String) -> String {
  // Map common image UTIs to their file extensions
  let utiMap: [String: String] = [
    "public.jpeg": "jpeg",
    "public.jpeg-2000": "jp2",
    "public.png": "png",
    "public.heic": "heic",
    "public.heif": "heif",
    "public.tiff": "tiff",
    "public.avif": "avif",
    "com.compuserve.gif": "gif",
    "com.microsoft.bmp": "bmp",
    "com.microsoft.ico": "ico",
    "public.webp": "webp",
    "com.adobe.photoshop-image": "psd",
    "com.adobe.raw-image": "dng"
  ]
  
  return utiMap[uti] ?? "jpeg"
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
      let cleanUuid = cleanLocalIdentifier(album.localIdentifier)
      albumPaths[fullPath] = cleanUuid
    }
  }

  return albumPaths
}

/// Helper function to clean local identifier (remove `/L0/...` suffix if present)
func cleanLocalIdentifier(_ identifier: String) -> String {
  return identifier.split(separator: "/").first.map(String.init) ?? identifier
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
