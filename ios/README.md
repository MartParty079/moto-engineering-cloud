# Moto Mission iOS + CarPlay Live Activity

This folder contains the native iPhone wrapper required to show Moto Mission ride data as a Live Activity in CarPlay.

## What the MVP displays

The Ride Settings screen lets the rider enable or disable:

- Speed
- Posted speed limit
- Direction
- Trip time
- Trip mileage

The selected primary metric is the large CarPlay value. The small CarPlay layout shows the primary metric plus up to two additional selected values. The iPhone Lock Screen layout can show more.

## Data sources

- **Speed, direction, and mileage:** native Core Location while a ride is active.
- **Trip time:** the Live Activity start timestamp, rendered by the system timer.
- **Speed limit:** the existing Moto Engineering Cloud `/api/road-info` endpoint, using the configured TomTom, Google Roads, or OpenStreetMap fallback logic.

Road signs and local law always take priority over mapped speed-limit data.

## Requirements

- A Mac capable of running Xcode 26 or newer.
- An iPhone running iOS 26 or newer.
- XcodeGen (`brew install xcodegen`).
- An Apple ID configured in Xcode. A paid Apple Developer membership is recommended for TestFlight and durable installation.
- A CarPlay-compatible display or the Apple CarPlay Simulator.

The web app can still be developed and deployed from Windows. Only the native iOS build/signing step requires macOS.

## Generate and open the Xcode project

```bash
cd ios
xcodegen generate
open MotoMission.xcodeproj
```

In Xcode:

1. Select the **MotoMission** target, open **Signing & Capabilities**, and select your development team.
2. Repeat for **MotoMissionLiveActivity**.
3. Confirm the app target has **Background Modes → Location updates** enabled.
4. Confirm both bundle identifiers are available to your Apple developer team. Change them in `project.yml` if necessary, then regenerate.
5. Build and run on the iPhone.

## First-run permissions

1. Sign in to Moto Mission inside the native wrapper.
2. Open **Ride Center → Settings** and select the Live Activity values.
3. Start a ride.
4. Grant location access. For reliable background updates, change Moto Mission location access to **Always** in iPhone Settings when prompted.
5. Confirm **Settings → Apps → Moto Mission → Live Activities** is enabled.
6. Connect to CarPlay. iOS controls the Live Activity’s placement and automatically presents the small activity layout when appropriate.

## Testing without a vehicle

Use the CarPlay Simulator supplied by Apple. The Live Activity also appears on the iPhone Lock Screen, Dynamic Island on supported devices, and paired Apple Watch.

## Architecture

- `src/live-activity-bridge.js` detects ride start/stop, injects display preferences into the existing Ride Settings modal, and sends messages to the native wrapper.
- `WebAppView.swift` hosts the production Vite app and receives JavaScript bridge messages.
- `RideActivityController.swift` owns background Core Location, distance accumulation, road lookups, and ActivityKit updates.
- `RideActivityAttributes.swift` is shared by the app and widget extension.
- `MotoMissionLiveActivityWidget.swift` defines the Lock Screen, Dynamic Island, and CarPlay-small layouts.

## Current MVP limitations

- This branch provides an XcodeGen source project, but it cannot be signed or validated without Xcode on macOS.
- iOS decides whether and where the Live Activity appears in CarPlay.
- Mapped speed limits can be missing, estimated, or stale. The UI shows `--` when no usable limit is returned.
- Continuous best-navigation GPS increases battery consumption.
- The existing web ride logger can still be suspended by iOS in the background. The native Live Activity remains current because native Core Location owns its ride metrics; moving all cloud sample logging to native code is a later phase.
