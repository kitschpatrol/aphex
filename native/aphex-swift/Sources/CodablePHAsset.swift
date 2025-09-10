import Foundation
import Photos

/// A simplified Codable representation of PHAsset for read-only JSON export
struct CodablePHAsset: Codable {
  let localIdentifier: String
  let mediaType: Int
  let mediaSubtypes: UInt
  let sourceType: UInt
  let pixelWidth: Int
  let pixelHeight: Int
  let creationDate: Date?
  let modificationDate: Date?
  let isFavorite: Bool
  let isHidden: Bool
  let hasAdjustments: Bool
  let burstIdentifier: String?
  let representsBurst: Bool
  let originalFilename: String?
  let editedFilename: String?
  let title: String?
  let originalFilePath: String?
  let editedFilePath: String?

  init(from asset: PHAsset) {
    // Clean up the local identifier by removing the trailing /L0/001 part
    if let range = asset.localIdentifier.range(of: "/L0/") {
      self.localIdentifier = String(asset.localIdentifier[..<range.lowerBound])
    } else {
      self.localIdentifier = asset.localIdentifier
    }

    self.mediaType = asset.mediaType.rawValue
    self.mediaSubtypes = asset.mediaSubtypes.rawValue
    self.sourceType = asset.sourceType.rawValue
    self.pixelWidth = asset.pixelWidth
    self.pixelHeight = asset.pixelHeight
    self.creationDate = asset.creationDate
    self.modificationDate = asset.modificationDate
    self.isFavorite = asset.isFavorite
    self.isHidden = asset.isHidden
    self.hasAdjustments = asset.hasAdjustments
    self.burstIdentifier = asset.burstIdentifier
    self.representsBurst = asset.representsBurst

    // Get filenames from PHAssetResource
    let resources = PHAssetResource.assetResources(for: asset)

    // Find original filename
    self.originalFilename =
      resources.first { resource in
        resource.type == .photo || resource.type == .video || resource.type == .audio
      }?.originalFilename

    // Find edited filename (if asset has adjustments)
    if asset.hasAdjustments {
      self.editedFilename =
        resources.first { resource in
          resource.type == .fullSizePhoto || resource.type == .fullSizeVideo
        }?.originalFilename
    } else {
      self.editedFilename = nil
    }

    // Get metadata
    if let title = asset.value(forKey: "title") as? String, !title.isEmpty {
      self.title = title
    } else {
      self.title = nil
    }

    // Initialize file paths using osxphotos approach
    self.originalFilePath = getOriginalFilePath(for: asset)
    self.editedFilePath = asset.hasAdjustments ? getEditedFilePath(for: asset) : nil
  }

  // MARK: - JSON Export
  /// Encodes the asset to a JSON string
  func toJSONString() throws -> String {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

    let data = try encoder.encode(self)
    guard let string = String(data: data, encoding: .utf8) else {
      throw EncodingError.invalidValue(
        self,
        EncodingError.Context(
          codingPath: [], debugDescription: "Failed to convert data to UTF-8 string")
      )
    }
    return string
  }
}

// MARK: - Batch Operations
extension Array where Element == PHAsset {
  /// Converts an array of PHAssets to JSON string
  func toJSONString() throws -> String {
    let codableAssets = self.map { CodablePHAsset(from: $0) }
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]

    let data = try encoder.encode(codableAssets)
    guard let string = String(data: data, encoding: .utf8) else {
      throw EncodingError.invalidValue(
        codableAssets,
        EncodingError.Context(
          codingPath: [], debugDescription: "Failed to convert data to UTF-8 string")
      )
    }
    return string
  }
}

// MARK: - Usage Example
/*
 Single asset:
 let asset: PHAsset = // ... fetch your asset
 let codableAsset = CodablePHAsset(from: asset)
 let jsonString = try codableAsset.toJSONString()

 Multiple assets:
 let assets: [PHAsset] = // ... fetch multiple assets
 let jsonString = try assets.toJSONString()
 */

// MARK: - File Path Construction

/// Get the original file path using osxphotos approach
private func getOriginalFilePath(for asset: PHAsset) -> String? {
  guard let libraryURL = getSystemLibraryPath() else {
    return nil
  }

  let cleanUUID = cleanLocalIdentifier(asset.localIdentifier)
  let firstLetter = String(cleanUUID.prefix(1))

  // Get original filename from PHAssetResource
  let resources = PHAssetResource.assetResources(for: asset)
  guard let originalResource = resources.first(where: { $0.type == .photo || $0.type == .video }),
    let pathExtension = originalResource.originalFilename.split(separator: ".").last
  else {
    return nil
  }

  // Construct path: libraryURL/originals/FIRST_LETTER/UUID.extension
  let originalPath =
    libraryURL
    .appendingPathComponent("originals")
    .appendingPathComponent(firstLetter.uppercased())
    .appendingPathComponent("\(cleanUUID).\(pathExtension)")
    .path

  return FileManager.default.fileExists(atPath: originalPath) ? originalPath : nil
}

/// Get the edited file path using osxphotos approach
private func getEditedFilePath(for asset: PHAsset) -> String? {
  guard asset.hasAdjustments,
    let libraryURL = getSystemLibraryPath()
  else {
    return nil
  }

  let cleanUUID = cleanLocalIdentifier(asset.localIdentifier)
  let firstChar = String(cleanUUID.prefix(1))

  var filename: String
  if asset.mediaType == .image {
    // Check if it's HEIC or default to JPEG for edited images
    let resources = PHAssetResource.assetResources(for: asset)
    if resources.contains(where: { $0.uniformTypeIdentifier == "public.heic" }) {
      filename = "\(cleanUUID)_1_201_a.heic"
    } else {
      filename = "\(cleanUUID)_1_201_a.jpeg"
    }
  } else if asset.mediaType == .video {
    filename = "\(cleanUUID)_2_0_a.mov"
  } else {
    return nil
  }

  let editedPath =
    libraryURL
    .appendingPathComponent("resources")
    .appendingPathComponent("renders")
    .appendingPathComponent(firstChar)
    .appendingPathComponent(filename)
    .path

  return FileManager.default.fileExists(atPath: editedPath) ? editedPath : nil
}
