import Foundation
import ObjectiveC
import Photos

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

    guard let dateModified = asset.modificationDate else {
      throw CodablePHAssetError.dateModifiedNotAvailable(resource: asset.debugDescription)
    }
    self.dateModified = dateModified

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
    if asset.hasAdjustments {
      if let editedResource = resources.first(where: { $0.type == .fullSizePhoto }) {
        self.edited = try ResourceInfo(from: editedResource, asset: asset)
      } else {
        self.edited = nil
      }
    } else {
      self.edited = nil
    }
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
