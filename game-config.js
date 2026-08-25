export const CONFIG = Object.freeze({
  gyro: Object.freeze({
    yawSensitivity: .38,
    pitchSensitivity: .34,
    fullDrawMultiplier: .58,
    deadzoneDeg: .8,
    smoothingHz: 5.2,
    maxYaw: 1.05,
    maxPitch: .62,
    yawSign: 1,
    pitchSign: 1,
    fatigueStartSec: .7,
    fatigueRampSec: 2.2,
    fatigueMaxMultiplier: 2.15
  }),
  hand: Object.freeze({
    drawStartShrink: .12,
    fullDrawShrink: .42,
    shrinkWeight: .9,
    positionWeight: .1,
    verticalPenalty: .04,
    smoothingHz: 8,
    pinchCloseRatio: .42,
    pinchOpenRatio: .72,
    pinchReleaseJump: .16,
    pinchConfirmFrames: 3,
    releaseConfirmFrames: 2,
    releaseMinVelocity: 1.15,
    releaseWindowMs: 220,
    releaseCooldownMs: 500,
    minReleasePower: .55,
    pinchHoldMs: 140,
    detectionGraceMs: 180,
    calibrationWindowMs: 450,
    calibrationMaxSamples: 18,
    calibrationSpreadTolerance: .12,
    calibrationPositionTolerance: .035
  }),
  shotsPerPlayer: 5,
  baseFov: 58,
  fullDrawFov: 36,
  distances: Object.freeze([10, 18, 25, 35])
});

export const DISTANCE_PROFILES = Object.freeze({
  10: Object.freeze({ minArrowSpeed: 30, maxArrowSpeed: 64, gravity: 3.25, windAcceleration: .26, windLimit: .7 }),
  18: Object.freeze({ minArrowSpeed: 27, maxArrowSpeed: 63, gravity: 3.75, windAcceleration: .40, windLimit: 1.45 }),
  25: Object.freeze({ minArrowSpeed: 24, maxArrowSpeed: 62, gravity: 4.2, windAcceleration: .54, windLimit: 2.25 }),
  35: Object.freeze({ minArrowSpeed: 23, maxArrowSpeed: 61, gravity: 4.55, windAcceleration: .66, windLimit: 3.05 })
});

export const QUALITY_PROFILES = Object.freeze({
  high: Object.freeze({ key: 'high', label: '高画質', pixelRatioCap: 2, shadows: true, treeSpacing: 6, handInferenceIntervalMs: 50, cameraWidth: 640, cameraHeight: 480 }),
  balanced: Object.freeze({ key: 'balanced', label: '標準', pixelRatioCap: 1.5, shadows: false, treeSpacing: 9, handInferenceIntervalMs: 65, cameraWidth: 512, cameraHeight: 384 }),
  lite: Object.freeze({ key: 'lite', label: '軽量', pixelRatioCap: 1, shadows: false, treeSpacing: 14, handInferenceIntervalMs: 90, cameraWidth: 384, cameraHeight: 288 })
});

export function resolveQuality(choice = 'auto', capabilities) {
  if (choice !== 'auto' && QUALITY_PROFILES[choice]) return QUALITY_PROFILES[choice];
  const device = capabilities || (typeof navigator !== 'undefined' ? navigator : {});
  const memory = device.deviceMemory;
  const cores = device.hardwareConcurrency;
  if ((Number.isFinite(memory) && memory <= 3) || (Number.isFinite(cores) && cores <= 4)) return QUALITY_PROFILES.lite;
  if (Number.isFinite(memory) && memory >= 6 && Number.isFinite(cores) && cores >= 6) return QUALITY_PROFILES.high;
  return QUALITY_PROFILES.balanced;
}

export function lowerQuality(profile) {
  if (profile?.key === 'high') return QUALITY_PROFILES.balanced;
  if (profile?.key === 'balanced') return QUALITY_PROFILES.lite;
  return QUALITY_PROFILES.lite;
}

export function profileForDistance(distance) {
  return DISTANCE_PROFILES[distance] || DISTANCE_PROFILES[25];
}
