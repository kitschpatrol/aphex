import Foundation
import ObjectiveC
import Photos

// Define this flag in your build settings or at the top of the file
// #define USE_ASSET_MODIFICATION_DATE

/// Represents comprehensive resource information from PHAssetResource
struct ResourceInfo: Codable {
  let contentType: String
  let fileName: String
  let filePath: String
  let fileSize: Int64
  let height: Int
  let width: Int
}

/// A simplified Codable representation of PHAsset for read-only JSON export
struct CodablePHAsset: Codable {
  let uuid: String
  let dateCreated: Date
  let dateModified: Date
  let favorite: Bool
  let hidden: Bool
  let title: String?

  // Nested resource information
  let original: ResourceInfo
  let edited: ResourceInfo?

  init(from asset: PHAsset) throws {
    // Only initialize from photo assets
    guard asset.mediaType == .image else {
      fatalError("CodablePHAsset can only be initialized from photo assets")
    }

    self.uuid = cleanLocalIdentifier(asset.localIdentifier)

    guard let dateCreated = asset.creationDate else {
      throw CodablePHAssetError.dateCreatedNotAvailable(resource: asset.debugDescription)
    }
    self.dateCreated = dateCreated

    self.favorite = asset.isFavorite
    self.hidden = asset.isHidden

    // Get metadata
    if let title = asset.value(forKey: "title") as? String, !title.isEmpty {
      self.title = title
    } else {
      self.title = nil
    }

    // Get all resources for this asset
    let resources = PHAssetResource.assetResources(for: asset)

    // Find original resource
    guard let originalResource = resources.first(where: { $0.type == .photo }) else {
      throw CodablePHAssetError.originalResourceNotFound
    }

    self.original = try ResourceInfo(from: originalResource, asset: asset)

    // Find edited resource if adjustments exist
    var editedInfo: ResourceInfo? = nil
    if asset.hasAdjustments {
      if let editedResource = resources.first(where: { $0.type == .fullSizePhoto }) {
        editedInfo = try ResourceInfo(from: editedResource, asset: asset)
      }
    }
    self.edited = editedInfo

    // Set dateModified based on compilation flag
    #if USE_ASSET_MODIFICATION_DATE
      // Original behavior: use PHAsset.modificationDate
      guard let dateModified = asset.modificationDate else {
        throw CodablePHAssetError.dateModifiedNotAvailable(resource: asset.debugDescription)
      }
      self.dateModified = dateModified
    #else
      // New behavior: use max of file modification timestamps
      var dates: [Date] = []

      // Get original file modification date
      if let originalModDate = getFileModificationDate(at: self.original.filePath) {
        dates.append(originalModDate)
      }

      // Get edited file modification date if available
      if let editedFilePath = editedInfo?.filePath,
        let editedModDate = getFileModificationDate(at: editedFilePath)
      {
        dates.append(editedModDate)
      }

      // Get the maximum date
      guard let maxDate = dates.max() else {
        throw CodablePHAssetError.dateModifiedNotAvailable(
          resource: "No file timestamps available for original or edited resources"
        )
      }

      self.dateModified = maxDate
    #endif
  }

  // MARK: - JSON Export
  /// Encodes the asset to a JSON string
  func toJSONString() throws -> String {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]

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

// MARK: - ResourceInfo Extensions
extension ResourceInfo {
  init(from resource: PHAssetResource, asset: PHAsset) throws {
    // TODO deprecated, also available via getStringProperty...
    self.contentType = resource.uniformTypeIdentifier
    self.fileName = resource.originalFilename

    // Extract private properties - this is a very bad idea
    // Also could be optimized into a single call
    let fileURLString = getStringProperty(object: resource, propertyName: "fileURL")
    if let fileURL = URL(string: fileURLString) {
      self.filePath = fileURL.path
    } else {
      // self.filePath = "unavailable://\(resource.originalFilename)"
      throw CodablePHAssetError.fileURLNotAvailable(resource: resource.debugDescription)
    }

    // Get file size from private property
    let fileSizeString = getStringProperty(object: resource, propertyName: "fileSize")
    self.fileSize = Int64(fileSizeString) ?? 0

    // Get width and height from private properties (more accurate than asset)
    let widthString = getStringProperty(object: resource, propertyName: "width")
    let heightString = getStringProperty(object: resource, propertyName: "height")

    self.width = Int(widthString) ?? asset.pixelWidth
    self.height = Int(heightString) ?? asset.pixelHeight
  }
}

// MARK: - File System Helpers
/// Gets the modification date of a file at the given path
func getFileModificationDate(at path: String) -> Date? {
  let fileManager = FileManager.default
  do {
    let attributes = try fileManager.attributesOfItem(atPath: path)
    return attributes[.modificationDate] as? Date
  } catch {
    print("Warning: Could not get modification date for file at path: \(path), error: \(error)")
    return nil
  }
}

// MARK: - Error Types
enum CodablePHAssetError: LocalizedError {
  case originalResourceNotFound
  case fileURLNotAvailable(resource: String)
  case dateCreatedNotAvailable(resource: String)
  case dateModifiedNotAvailable(resource: String)

  var errorDescription: String? {
    switch self {
    case .originalResourceNotFound:
      return "Original photo resource not found in asset"
    case .fileURLNotAvailable(let resource):
      return "File URL not available for resource: \(resource)"
    case .dateCreatedNotAvailable(let resource):
      return "Created date not available for resource: \(resource)"
    case .dateModifiedNotAvailable(let resource):
      return "Modified date not available for resource: \(resource)"
    }
  }
}

// MARK: - Batch Operations
extension Array where Element == PHAsset {
  /// Converts an array of PHAssets to JSON string
  func toJSONString() throws -> String {
    let codableAssets = try self.map { try CodablePHAsset(from: $0) }
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]

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
 To use the old behavior (PHAsset.modificationDate), define USE_ASSET_MODIFICATION_DATE
 in your build settings:
 - In Xcode: Build Settings > Swift Compiler - Custom Flags > Other Swift Flags
 - Add: -D USE_ASSET_MODIFICATION_DATE

 Or define at the top of this file:
 #define USE_ASSET_MODIFICATION_DATE

 Single asset:
 let asset: PHAsset = // ... fetch your asset
 let codableAsset = try CodablePHAsset(from: asset)
 let jsonString = try codableAsset.toJSONString()

 Multiple assets:
 let assets: [PHAsset] = // ... fetch multiple assets
 let jsonString = try assets.toJSONString()
 */

// Via https://github.com/abentele/PhotosExporter
// See MIT license: https://github.com/abentele/PhotosExporter/blob/master/LICENSE
func getStringProperty(object: AnyObject, propertyName: String) -> String {
  //let description: String = String(describing: [object.debugDescription])
  let description = object.debugDescription!
  let properties = String(
    description[
      description.index(description.firstIndex(of: "{")!, offsetBy: 1)..<description.lastIndex(
        of: "}")!])
  // print("properties: \(properties)")

  let splittedProperties = properties.split(separator: "\n")

  for propertyStr in splittedProperties {
    let propertyStr = propertyStr.trimmingCharacters(in: CharacterSet.whitespaces)

    let propName = String(propertyStr[..<propertyStr.firstIndex(of: ":")!])

    if propName == propertyName {
      let propValue = String(
        propertyStr[propertyStr.index(propertyStr.firstIndex(of: ":")!, offsetBy: 1)...]
      ).trimmingCharacters(in: CharacterSet.whitespaces)

      return propValue
    }
  }

  return ""
}
