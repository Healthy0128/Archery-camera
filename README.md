# Gyro Archery Web — Hand Tracking Prototype

Mobile web archery prototype for iPhone/Android/desktop.

## Current controls
- Gyroscope: aim
- Front camera + MediaPipe Hand Landmarker: draw strength
- Tap/click: release arrow
- `手の基準`: register the free hand's relaxed/starting position
- `照準リセット`: use the current phone orientation as the center aim
- Desktop fallback: mouse aim, fixed draw power

## Draw-strength prototype
The app intentionally does not rely on monocular depth alone.

Power is estimated from:
1. outward movement of the palm from screen center (main signal)
2. reduction in apparent palm size (secondary signal)
3. a small vertical-motion penalty to reduce false draws

The result is smoothed into a 0–100% draw meter. Arrow launch speed changes with draw power.

## Multiplayer calibration
- Each player owns an independent palm-core baseline and phone-hand setting.
- A baseline is registered only after a short stable-sample window and is restored on that player's next turn.
- Pinch acquisition requires three consecutive frames, and release requires two consecutive open frames with a minimum opening speed. A slow opening is cancelled instead of firing.
- If the hand disappears from the camera, the pinch state is cleared immediately, so returning the hand cannot cause a late release.
- The optional guided practice arrow is excluded from match scores.

## Device performance settings
- `自動` uses a conservative standard profile when browser capability data is unavailable (including many iPhone/iPad environments), and starts light on devices reporting limited memory/CPU.
- While playing in `自動`, sustained frame rates below 24 fps lower the profile one step without interrupting the match.
- `標準`, `軽量`, and `高画質` adjust renderer pixel ratio, shadows, tree density, camera resolution, and hand-inference interval.
- The setting can be changed from the start menu and is applied without reloading the page. A live camera track is updated where the browser supports it. Camera frames remain on-device.

## Code structure
- `inputs.js`: gyroscope and MediaPipe hand input
- `player-calibration.js`: per-player hand and phone-side data
- `match.js`: turn order, scores and player ownership
- `game-config.js`: distance-specific physics and input tuning
- `tutorial.js`: guided practice state machine
- `main.js`: Three.js scene, arrow lifecycle and UI orchestration

## Run
Camera and motion sensors require a secure context on iPhone. Use GitHub Pages or another HTTPS host.

Opening `index.html` directly from the Files app is not sufficient for camera/sensor testing.

## External runtime dependencies
- Three.js 0.180.0
- MediaPipe Tasks Vision 1.0.1
- Google MediaPipe Hand Landmarker model

Hand image processing is performed on device by MediaPipe Tasks. The app does not upload camera frames itself.

## v4 additions
- Full-draw hold tremor: aiming stays stable briefly, then gradually becomes harder after about 1.5 seconds.
- Bow strain feedback: subtle visual strain and a generated bow-creak sound while overholding.
- Release feedback: short recoil motion and vibration where supported.
- Arrow follow camera: the camera moves behind the flying arrow after launch.
- Impact cinematic: short slow-motion close view on target hits.
- Automatic return to the archer view after the shot.
