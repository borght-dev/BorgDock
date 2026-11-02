#!/bin/zsh
# Archives the BorgDock iPhone app and uploads it to TestFlight with the App Store Connect API key.
# The build number is the UTC time, so every upload is newer than the last one.
set -euo pipefail
cd "$(dirname "$0")"
source ~/.config/together-ci/apple.env   # ASC_KEY_ID, ASC_ISSUER_ID (the personal team's key)
AUTH=(-allowProvisioningUpdates
      -authenticationKeyPath "$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
      -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
BUILD=$(date -u +%Y%m%d%H%M)
# The server a fresh install talks to: this Mac's BorgDock server (src/BorgDock.Server/deploy/borgdock-install.sh).
SERVER_URL=${BORGDOCK_SERVER_URL:-$(node -p "require('$HOME/.borgdock-server/config.json').publicOrigin")}

xcodegen generate
rm -rf build/BorgDock.xcarchive build/export
xcodebuild -project BorgDock.xcodeproj -scheme BorgDock -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/BorgDock.xcarchive \
  DEVELOPMENT_TEAM=2YU6RWHUWX CURRENT_PROJECT_VERSION="$BUILD" BORGDOCK_SERVER_URL="$SERVER_URL" "${AUTH[@]}" archive | grep -E "error:|ARCHIVE (SUCCEEDED|FAILED)"
xcodebuild -exportArchive -archivePath build/BorgDock.xcarchive -exportOptionsPlist ExportOptions.plist \
  -exportPath build/export "${AUTH[@]}" | grep -E "error:|Upload|EXPORT (SUCCEEDED|FAILED)|Progress"
echo "Uploaded build $BUILD. TestFlight shows it once Apple has processed it (usually 10-30 minutes)."
