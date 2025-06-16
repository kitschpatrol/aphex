import Foundation
import Cocoa
import Photos

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

// Function to parse command line arguments
func parseArguments() -> (uuid: String, destination: URL, filename: String, mode: String)? {
    let args = CommandLine.arguments
    guard let uuidIndex = args.firstIndex(of: "--photo-uuid"),
          let destIndex = args.firstIndex(of: "--destination-directory"),
          let filenameIndex = args.firstIndex(of: "--filename"),
          let modeIndex = args.firstIndex(of: "--mode"),
          args.count > uuidIndex + 1,
          args.count > destIndex + 1,
          args.count > filenameIndex + 1,
          args.count > modeIndex + 1 else {
        print("Invalid arguments.")
        return nil
    }

    let uuid = args[uuidIndex + 1]
    let destinationPath = args[destIndex + 1]
    let filename = args[filenameIndex + 1]
    let mode = args[modeIndex + 1].lowercased()
    let destination = URL(fileURLWithPath: destinationPath).appendingPathComponent("\(filename).png")

    return (uuid, destination, filename, mode)
}

// Main function to execute image processing and saving
func main() {
    guard let (uuid, destination, _, mode) = parseArguments() else {
        return
    }

    let imageManager = PHImageManager.default()
    let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: [uuid], options: nil)
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

    if mode == "requestimage" {
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
    } else if mode == "requestimagedataandorientation" {
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
    } else {
        print("Invalid mode specified.")
    }
}

// Run the main function
main()
