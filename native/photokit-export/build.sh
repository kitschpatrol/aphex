# # Save notarization credentials...
# xcrun notarytool store-credentials "notarytool-profile" --apple-id "eric@ericmika.com" --team-id "86294Z3YEC"

swiftc -o photokit-export main.swift -framework Photos
codesign --force --sign "Developer ID Application: Eric Mika (86294Z3YEC)" --entitlements photokit-export.entitlements photokit-export
# # Notarization is not working, so we're not doing it
# zip photokit-export.zip photokit-export
# xcrun notarytool submit photokit-export.zip --keychain-profile "notarytool-profile" --wait
# unzip -o photokit-export.zip
codesign -dv --verbose=4 photokit-export
chmod +x photokit-export
mkdir -p ../../dist
mv photokit-export ../../dist
# rm photokit-export.zip
