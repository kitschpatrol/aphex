# # Save notarization credentials...
# xcrun notarytool store-credentials "notarytool-profile" --apple-id "eric@ericmika.com" --team-id "86294Z3YEC"

# Extract version from package.json and generate Swift file
VERSION=$(node -p "require('../../package.json').version")
echo "let PACKAGE_VERSION = \"$VERSION\"" > Sources/Version.swift
swift build --configuration release
cp .build/release/aphex-swift aphex-swift
codesign --force --sign "Developer ID Application: Eric Mika (86294Z3YEC)" --entitlements aphex-swift.entitlements aphex-swift
# # Notarization is not working, so we're not doing it
# zip aphex-swift.zip aphex-swift
# xcrun notarytool submit aphex-swift.zip --keychain-profile "notarytool-profile" --wait
# unzip -o aphex-swift.zip
codesign -dv --verbose=4 aphex-swift
chmod +x aphex-swift
mkdir -p ../../dist
mv aphex-swift ../../dist
# rm aphex-swift.zip
