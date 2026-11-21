#!/usr/bin/env bash
# Builds Sticky-Days.apk locally (no Android Studio, no Gradle).
# Uses the portable JDK and Android build-tools under .android-build/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILDROOT="$ROOT/.android-build"
JDK="$BUILDROOT/jdk"
SDK="$BUILDROOT/sdk"
BT="$SDK/build-tools/34.0.0"
PLATFORM="$SDK/platforms/android-35/android.jar"
APP="$BUILDROOT/app"
BUILD="$BUILDROOT/build"
KS="$BUILDROOT/release.keystore"

w() { cygpath -w "$1"; }

[ -x "$JDK/bin/java.exe" ] || { echo "missing JDK at $JDK"; exit 1; }
[ -f "$PLATFORM" ] || { echo "missing android.jar at $PLATFORM"; exit 1; }
[ -f "$BT/lib/d8.jar" ] || { echo "missing d8.jar"; exit 1; }
[ -f "$BT/lib/apksigner.jar" ] || { echo "missing apksigner.jar"; exit 1; }

echo "==> preparing assets"
node "$ROOT/scripts/build-apk-asset.mjs"
echo "==> standalone html copy"
node "$ROOT/scripts/build-standalone.mjs"
mkdir -p "$APP/res/drawable-nodpi"
cp "$ROOT/sticky-days/icons/icon-512.png" "$APP/res/drawable-nodpi/ic_launcher.png"

echo "==> cleaning"
rm -rf "$BUILD"
mkdir -p "$BUILD/flat" "$BUILD/classes" "$BUILD/dex" "$BUILD/rjava"

echo "==> aapt2 compile"
"$BT/aapt2.exe" compile --dir "$(w "$APP/res")" -o "$(w "$BUILD/flat")"

echo "==> aapt2 link"
FLATS=()
while IFS= read -r line; do FLATS+=("$(w "$line")"); done < <(find "$BUILD/flat" -name '*.flat')
"$BT/aapt2.exe" link \
  -o "$(w "$BUILD/unsigned.apk")" \
  -I "$(w "$PLATFORM")" \
  --manifest "$(w "$APP/AndroidManifest.xml")" \
  -A "$(w "$APP/assets")" \
  --min-sdk-version 23 \
  --target-sdk-version 34 \
  --version-code 18 \
  --version-name 2.7 \
  --java "$(w "$BUILD/rjava")" \
  "${FLATS[@]}"

echo "==> javac"
SRCS=()
while IFS= read -r line; do SRCS+=("$(w "$line")"); done < <(find "$APP/java" "$BUILD/rjava" -name '*.java')
"$JDK/bin/javac.exe" -nowarn -encoding UTF-8 -source 8 -target 8 \
  -bootclasspath "$(w "$PLATFORM")" \
  -d "$(w "$BUILD/classes")" "${SRCS[@]}"

echo "==> d8"
CLASSES=()
while IFS= read -r line; do CLASSES+=("$(w "$line")"); done < <(find "$BUILD/classes" -name '*.class')
"$JDK/bin/java.exe" -cp "$(w "$BT/lib/d8.jar")" com.android.tools.r8.D8 \
  --release --lib "$(w "$PLATFORM")" --min-api 23 \
  --output "$(w "$BUILD/dex")" "${CLASSES[@]}"

echo "==> adding classes.dex"
(cd "$BUILD/dex" && "$JDK/bin/jar.exe" uf "$(w "$BUILD/unsigned.apk")" classes.dex)

echo "==> zipalign"
"$BT/zipalign.exe" -f -p 4 "$(w "$BUILD/unsigned.apk")" "$(w "$BUILD/aligned.apk")"

if [ ! -f "$KS" ]; then
  echo "==> creating signing key"
  "$JDK/bin/keytool.exe" -genkeypair -keystore "$(w "$KS")" -alias stickydays \
    -keyalg RSA -keysize 2048 -validity 10950 \
    -storepass stickydays -keypass stickydays \
    -dname "CN=Sticky Days, OU=Personal, O=Sticky Days, L=Home, C=IN" >/dev/null 2>&1
fi

echo "==> signing"
"$JDK/bin/java.exe" -jar "$(w "$BT/lib/apksigner.jar")" sign \
  --ks "$(w "$KS")" --ks-key-alias stickydays \
  --ks-pass pass:stickydays --key-pass pass:stickydays \
  --out "$(w "$ROOT/Sticky-Days.apk")" "$(w "$BUILD/aligned.apk")"

echo "==> verifying"
"$JDK/bin/java.exe" -jar "$(w "$BT/lib/apksigner.jar")" verify --print-certs "$(w "$ROOT/Sticky-Days.apk")" | head -6

cp "$ROOT/Sticky-Days.apk" "$ROOT/sticky-days/Sticky-Days.apk"
ls -l "$ROOT/Sticky-Days.apk"
echo "APK OK"
