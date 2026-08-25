import test from 'node:test';
import assert from 'node:assert/strict';
import { HandInput, drawCoreSample } from '../inputs.js';
import { CONFIG } from '../game-config.js';

function landmarks(pinchRatio) {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .5 }));
  points[0] = { x: .5, y: .62 };
  points[5] = { x: .42, y: .5 };
  points[9] = { x: .48, y: .45 };
  points[13] = { x: .54, y: .47 };
  points[17] = { x: .62, y: .52 };
  points[4] = { x: .45, y: .35 };
  points[8] = { x: .45 + pinchRatio * .2, y: .35 };
  return points;
}

function makeHand(onRelease) {
  const context = { clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {} };
  return new HandInput(CONFIG.hand, {
    overlay: { getContext: () => context, width: 320, height: 240 },
    video: {}, preview: { classList: { add() {} } }, status: { textContent: '' }
  }, { onRelease });
}

test('palm-core sampling uses landmarks 0/5/9/13/17', () => {
  const sample = drawCoreSample(landmarks(.3));
  assert.ok(sample.spread > 0);
  assert.ok(sample.x > .4 && sample.x < .6);
});

test('pinch release fires once and requires re-arming', () => {
  let releases = 0;
  const hand = makeHand(() => { releases += 1; });
  hand.power = hand.targetPower = .8;
  hand.updateReleaseGesture(landmarks(.3), 0);
  hand.updateReleaseGesture(landmarks(.3), 50);
  hand.updateReleaseGesture(landmarks(.3), 100);
  hand.updateReleaseGesture(landmarks(.3), 180);
  hand.updateReleaseGesture(landmarks(.9), 230);
  hand.updateReleaseGesture(landmarks(1), 280);
  assert.equal(releases, 1);
});

test('resetting after tracking loss prevents a late open-hand release', () => {
  let releases = 0;
  const hand = makeHand(() => { releases += 1; });
  hand.power = hand.targetPower = .8;
  hand.updateReleaseGesture(landmarks(.3), 0);
  hand.updateReleaseGesture(landmarks(.3), 180);
  hand.resetGesture();
  hand.updateReleaseGesture(landmarks(.9), 400);
  assert.equal(releases, 0);
});

test('slow opening cancels the release instead of firing', () => {
  let releases = 0;
  const hand = makeHand(() => { releases += 1; });
  hand.power = hand.targetPower = .8;
  for (const time of [0, 50, 100, 180]) hand.updateReleaseGesture(landmarks(.3), time);
  hand.updateReleaseGesture(landmarks(.8), 230);
  hand.updateReleaseGesture(landmarks(.82), 280);
  hand.updateReleaseGesture(landmarks(.84), 480);
  assert.equal(releases, 0);
  assert.equal(hand.pinchHeld, false);
});
