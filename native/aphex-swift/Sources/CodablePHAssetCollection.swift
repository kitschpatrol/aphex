import Foundation
import Photos

/// A simplified Codable representation of PHAssetCollection for read-only JSON export
struct CodablePHAssetCollection: Codable {
  let uuid: String
  let title: String
  let type: Int
  let subtype: Int
  let estimatedAssetCount: Int
  let dateStart: Date?
  let dateEnd: Date?
  let path: String

  init(from collection: PHAssetCollection) {
    self.uuid = cleanLocalIdentifier(collection.localIdentifier)
    self.title = collection.title
    self.type = collection.assetCollectionType.rawValue
    self.subtype = collection.assetCollectionSubtype.rawValue
    self.estimatedAssetCount = collection.estimatedAssetCount
    self.dateStart = collection.startDate
    self.dateEnd = collection.endDate
    self.path = collection.path
  }

  // MARK: - JSON Export
  /// Encodes the asset collection to a JSON string
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

// MARK: - Batch Operations
extension Array where Element == PHAssetCollection {
  /// Converts an array of PHAssetCollections to JSON string
  func toJSONString() throws -> String {
    let codableAlbums = self.map { CodablePHAssetCollection(from: $0) }
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]

    let data = try encoder.encode(codableAlbums)
    guard let string = String(data: data, encoding: .utf8) else {
      throw EncodingError.invalidValue(
        codableAlbums,
        EncodingError.Context(
          codingPath: [], debugDescription: "Failed to convert data to UTF-8 string")
      )
    }
    return string
  }
}
