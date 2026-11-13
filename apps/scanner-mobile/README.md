# QRdx Scanner for iOS and Android

The QRdx scanner as a native app: `dev.qrdx.scanner`, named "QRdx Scanner". It's built and runs, but it isn't published. The owner is keeping it aside for now; the steps for publishing are at the end of this file.

## What it is

- **The website's scanner, reused.** The app bundles the same React components as [qrdx.dev/scan](https://qrdx.dev/scan) (`apps/docs/components/scanner`): the parser, the result cards, history, batch mode, CSV export and the safe-link preview. It also reuses their strings in all 11 site languages. `vite.config.ts` swaps five browser-only modules for native ones in `src/native/`:
  - `camera-view`: scanning uses the system's own scanner through `@capacitor/barcode-scanner`: Apple Vision on iOS, Google ML Kit on Android. It opens full screen, reads a code and closes. In batch mode it reopens after each new code.
  - `link-check`: the safe-link preview asks `https://qrdx.dev/api/scan/check` over native HTTP. Only the scanned address is sent.
  - `download`: contacts, calendar events and CSV exports go to the share sheet as files.
  - `install-app` and `hairline`: no install button, and a still icon for the empty history.
- **Photos** are picked with the system photo picker and decoded by the website's ZXing reader (WebAssembly), which is bundled so it works offline.
- **History** stays on the device (IndexedDB in the app's WebView). Android cloud backup is off (`allowBackup="false"`).
- **No accounts, no analytics, no ads, no tracking.** The app loads nothing from a server. Its only network request is the link check, made when a scanned code is a web address. Links open in the in-app browser, and only when tapped.
- Light and dark follow the device. The language follows the device's languages, matched the same way the website matches them.

### Why Capacitor

The UI, parser and safety checks already exist as React components. With Capacitor the app runs them as they are and only adds native scanning, sharing and file handling: one scanner, one set of strings. Expo or React Native would mean a second UI, a port of the parser and result actions, and keeping both in step. The camera is still native: the plugin is the official Capacitor one, built on Apple Vision and ML Kit, not a camera stream in a web view.

## It stays out of the monorepo

`apps/scanner-mobile` is excluded from the Bun workspace (`"!apps/scanner-mobile"` in the root `package.json`) and has its own `bun.lock`. Root `bun install`, turbo, CI and the Vercel build never see it. Biome lints its `src/`, and skips the generated `ios/` and `android/` projects.

## Build and run

Prerequisites: Bun, Node 22, Xcode (iOS), Android SDK with Java 21 (Android).

```bash
bun install                          # at the repo root: the app reads apps/docs in place
cd apps/scanner-mobile
bun install                          # the app's own dependencies
bun run build                        # strings + decoder, then the web bundle (dist/)
bunx cap sync                        # copies dist/ into ios/ and android/

bun run android:apk                  # android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

bun run ios:build                    # simulator build, signed to run locally
xcrun simctl install booted ~/Library/Developer/Xcode/DerivedData/qrdx-scanner/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch booted dev.qrdx.scanner
```

Or open `ios/App/App.xcodeproj` in Xcode and `android/` in Android Studio. Keep Xcode's build folder out of `~/Desktop` and `~/Documents`: a debug build links its Swift packages from there, and the simulated app then waits on macOS's folder-access check at launch. `node scripts/icons.mjs` redraws the app icons and launch screens from the QRdx mark. `VITE_QRDX_ORIGIN` points link checks at another QRdx deployment.

## Publishing (when the owner decides to)

Nothing below has been done: no developer accounts, signing keys, provisioning profiles, store listings or uploads exist.

### Before either store

1. **Privacy policy.** Add a section for the apps to `/legal/privacy-policy` (the stores link to it). It must say:
   - Camera frames and photos are decoded on the device and never uploaded.
   - Scan history is stored only in the app on the device. It isn't backed up, and it's deleted with the app or with Clear all.
   - When a scanned code is a web address, only that address is sent to QRdx to check it before it opens. QRdx forwards it to Google Web Risk and doesn't keep it.
   - There are no accounts, analytics, ads, advertising identifiers or tracking, and nothing is sold or shared for advertising.
   - What the camera and photo permissions are for, and how to withdraw them (device settings).
   - The contact address for privacy requests.
2. **Version.** Set the version and build number (`MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in Xcode, `versionName` and `versionCode` in `android/app/build.gradle`).
3. **Screenshots.** Take them from a device or simulator scanning a real code: the camera, a result with its link check, history, and dark mode.

### Apple App Store

1. Join the **Apple Developer Program**: US$99 a year. An organization account needs a D-U-N-S number.
2. In Certificates, Identifiers & Profiles, register the App ID `dev.qrdx.scanner`. In Xcode, pick the team under Signing & Capabilities and let Xcode manage signing (it creates the certificate and profiles).
3. In **App Store Connect**, create the app: name "QRdx Scanner" (if it's taken, choose another), bundle ID `dev.qrdx.scanner`, a SKU, category Utilities, free. It supports iPad too (the Capacitor template is universal): either add iPad screenshots, or set iPhone only (`TARGETED_DEVICE_FAMILY = 1`).
4. **App Privacy (privacy labels).** The only data that leaves the device is a scanned web address, sent for the safety check and not kept by QRdx. Apple doesn't count data that's only used to answer a request in real time and not retained as "collected". Confirm Google Web Risk's retention for lookups. If it fits, answer "Data Not Collected". Otherwise declare Browsing History: used for App Functionality, not linked to the user, not used for tracking.
5. **Privacy manifest.** Capacitor and its plugins ship their own `PrivacyInfo.xcprivacy`. Archive once and run Xcode's Generate Privacy Report. Add an app-level manifest (no tracking, no tracking domains) if the report asks for one.
6. **Export compliance** is already answered in `Info.plist` (`ITSAppUsesNonExemptEncryption = NO`: the app uses only standard HTTPS).
7. Screenshots: 6.9" iPhone (1320 × 2868), plus 13" iPad if iPad stays on. Also a description, keywords, a support URL (https://qrdx.dev/docs/help) and the privacy policy URL.
8. **Review notes.** "No account is needed. Scan any QR code with the Camera tab, or pick a photo with a QR code in the Image tab. Web links are checked with qrdx.dev before they open, and only when the person taps Open. The app uses native camera scanning (Apple Vision), the photo picker and the share sheet, and works offline apart from link checks." Native scanning, sharing and offline use matter here, because review rejects apps that are only a website in a wrapper (guideline 4.2).
9. Archive in Xcode (Product › Archive › Distribute App), test with TestFlight, then submit for review.

### Google Play

1. Create a **Google Play Console** developer account: US$25, once, with identity verification. A new personal account must run a closed test with at least 12 testers for 14 days before it can publish to production. An organization account needs a D-U-N-S number.
2. **Signing.** Generate an upload key and keep it out of the repository (for example `keytool -genkeypair -v -keystore qrdx-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000`). Turn on Play App Signing, which keeps the app signing key. Point a `release` signing config in `android/app/build.gradle` at the keystore through a git-ignored `keystore.properties`, then build an app bundle with `cd android && ./gradlew bundleRelease`.
3. **Store listing:** name (30 characters), short description (80), full description, a 512 × 512 icon, a 1024 × 500 feature graphic, 2–8 phone screenshots, the privacy policy URL and a contact email. Category: Tools.
4. **Data safety form.** Unlike Apple, Google counts data processed in real time as collected. Declare it as processed ephemerally:
   - Web browsing (the scanned web address).
   - Purpose: Fraud prevention, security, and compliance.
   - Processed ephemerally, encrypted in transit, required (it runs on every scanned link), not shared (Google Web Risk acts as a service provider).
   - No other data. The app doesn't use the advertising ID.
5. **App content:** content rating questionnaire, target audience (not designed for children), no ads, no login needed for app access, and a permissions check. The app uses `CAMERA` only. Photos come through the system photo picker, which needs no storage permission.
6. Upload the `.aab` to the closed test, then promote it to production.

## Not done yet

- The iOS permission prompts are in English only (`InfoPlist.strings` per language would translate them).
- Some reused strings still say "in this browser" (history); the app could get its own wording.
- No share extension (sharing an image to the app from Photos); the installable web scanner does that on Android.
- No automated tests run in CI for the app. The reused components are tested in `apps/docs`.
