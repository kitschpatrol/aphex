import Foundation
import Photos

/// A simplified Codable representation of PHAssetCollection for read-only JSON export
struct CodablePHAssetCollection: Codable {
  let uuid: String
  let title: String?
  let type: Int
  let subtype: Int
  let estimatedAssetCount: Int
  let dateStart: Date?
  let dateEnd: Date?

  init(from collection: PHAssetCollection) {
    // Clean up the local identifier by removing the trailing /L0/001 part
    if let range = collection.localIdentifier.range(of: "/L0/") {
      self.uuid = String(collection.localIdentifier[..<range.lowerBound])
    } else {
      self.uuid = collection.localIdentifier
    }

    self.title = collection.localizedTitle
    self.type = collection.assetCollectionType.rawValue
    self.subtype = collection.assetCollectionSubtype.rawValue
    self.estimatedAssetCount = collection.estimatedAssetCount
    self.dateStart = collection.startDate
    self.dateEnd = collection.endDate
  }

  // MARK: - JSON Export
  /// Encodes the asset collection to a JSON string
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
