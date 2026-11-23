#!/bin/zsh
# Archives an iPhone app and uploads it to TestFlight with the App Store Connect API key: BorgDock by default,
# BorgDock Review with `./testflight.sh review`. The build number is the UTC time, so every upload is newer than the
# last one.
set -euo pipefail
cd "$(dirname "$0")"
source ~/.config/together-ci/apple.env   # ASC_KEY_ID, ASC_ISSUER_ID (the personal team's key)
AUTH=(-allowProvisioningUpdates
      -authenticationKeyPath "$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
      -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
BUILD=$(date -u +%Y%m%d%H%M)

case "${1:-borgdock}" in
  borgdock)
    SCHEME=BorgDock
    # The server a fresh install talks to: this Mac's BorgDock server (src/BorgDock.Server/deploy/borgdock-install.sh).
    SETTINGS=(BORGDOCK_SERVER_URL="${BORGDOCK_SERVER_URL:-$(node -p "require('$HOME/.borgdock-server/config.json').publicOrigin")}")
    ;;
  review)
    # BorgDock Review reads GitHub and Azure DevOps itself: no server address to build in.
    SCHEME=BorgDockReview
    SETTINGS=()
    ;;
  *)
    echo "usage: $0 [borgdock|review]" >&2
    exit 2
    ;;
esac

xcodegen generate
rm -rf "build/$SCHEME.xcarchive" "build/export-$SCHEME"
xcodebuild -project BorgDock.xcodeproj -scheme "$SCHEME" -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "build/$SCHEME.xcarchive" \
  DEVELOPMENT_TEAM=2YU6RWHUWX CURRENT_PROJECT_VERSION="$BUILD" "${SETTINGS[@]}" "${AUTH[@]}" archive | grep -E "error:|ARCHIVE (SUCCEEDED|FAILED)"
xcodebuild -exportArchive -archivePath "build/$SCHEME.xcarchive" -exportOptionsPlist ExportOptions.plist \
  -exportPath "build/export-$SCHEME" "${AUTH[@]}" | grep -E "error:|Upload|EXPORT (SUCCEEDED|FAILED)|Progress"
echo "Uploaded $SCHEME build $BUILD. TestFlight shows it once Apple has processed it (usually 10-30 minutes)."
