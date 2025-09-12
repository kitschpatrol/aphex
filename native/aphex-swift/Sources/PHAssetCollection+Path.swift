import Foundation
import Photos

extension PHAssetCollection {

  var title: String {
    return self.localizedTitle ?? "Unknown Album"
  }

  /// Computed property to get the parent folder path for this album
  var path: String {
    // Memoized
    let albumMap = getAlbumPathsToUuidMap()
    let cleanUuid = cleanLocalIdentifier(self.localIdentifier)

    // Find matching album in the map
    let matchingEntry = albumMap.first { (_, uuid) in
      return uuid == cleanUuid
    }

    guard let (albumPath, _) = matchingEntry else {
      return "/Unknown Path/\(self.title)"
    }

    return albumPath
  }
}
