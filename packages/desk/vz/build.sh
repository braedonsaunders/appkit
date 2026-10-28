#!/bin/sh
# Build appkit-desk-vz for release and sign it with the virtualization
# entitlement, without which Virtualization.framework refuses to start a VM.
#
#   packages/desk/vz/build.sh            ad hoc signature (local use)
#   APPKIT_CODESIGN_IDENTITY="Developer ID Application: …" packages/desk/vz/build.sh
#
# Prints the path of the signed binary on stdout.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
cd "$here"
swift build -c release -j "${APPKIT_SWIFT_JOBS:-2}" --product appkit-desk-vz >&2
binary="$(swift build -c release --show-bin-path)/appkit-desk-vz"
identity=${APPKIT_CODESIGN_IDENTITY:--}
if [ "$identity" = "-" ]; then
  codesign --force --sign - --entitlements appkit-desk-vz.entitlements "$binary" >&2
else
  # A Developer ID build is hardened and timestamped so it can be notarized.
  codesign --force --sign "$identity" --options runtime --timestamp \
    --entitlements appkit-desk-vz.entitlements "$binary" >&2
fi
codesign --verify --strict "$binary" >&2
echo "$binary"
