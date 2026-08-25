import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../match.js';
import { lowerQuality, profileForDistance, resolveQuality } from '../game-config.js';

test('P1→P2→P3→P4→P1 restores independent hand and phone settings', () => {
  const match = new Match(5);
  match.configure(4, 25, 'right');
  const spreads = [.08, .10, .12, .14];
  const phoneHands = ['right', 'left', 'right', 'left'];

  for (let index = 0; index < 4; index += 1) {
    const player = match.current;
    if (!player.calibration.phoneHandConfigured) player.calibration.setPhoneHand(phoneHands[index]);
    player.calibration.registerHand({ x: .4 + index * .01, y: .5, spread: spreads[index] });
    match.record(8);
    match.advance();
  }

  assert.equal(match.current.name, 'P1');
  for (let index = 0; index < 4; index += 1) {
    const calibration = match.players[index].calibration;
    assert.equal(calibration.phoneHand, phoneHands[index]);
    assert.equal(calibration.handBaseline.spread, spreads[index]);
    assert.equal(match.players[index].shots.length, 1);
  }
});

test('a new match does not retain scores, arrows or calibration data', () => {
  const match = new Match(5);
  match.configure(2, 18, 'right');
  match.current.calibration.registerHand({ x: .5, y: .5, spread: .1 });
  match.record(10);
  match.configure(2, 18, 'left');

  assert.equal(match.totalShots, 0);
  assert.equal(match.players[0].score, 0);
  assert.equal(match.players[0].shots.length, 0);
  assert.equal(match.players[0].calibration.isHandRegistered, false);
  assert.equal(match.players[0].calibration.phoneHand, 'left');
});

test('four players complete exactly five alternating shots each', () => {
  const match = new Match(5);
  match.configure(4, 35, 'right');
  const order = [];
  while (!match.isComplete()) {
    order.push(match.current.name);
    match.record(6);
    if (!match.isComplete()) assert.equal(match.advance(), true);
  }
  assert.deepEqual(order, ['P1','P2','P3','P4','P1','P2','P3','P4','P1','P2','P3','P4','P1','P2','P3','P4','P1','P2','P3','P4']);
  assert.equal(match.totalShots, 20);
  assert.ok(match.players.every(player => player.shots.length === 5 && player.score === 30));
});

test('distance profiles increase wind challenge without a sudden jump', () => {
  const distances = [10, 18, 25, 35];
  const windEffects = distances.map(distance => {
    const profile = profileForDistance(distance);
    return profile.windLimit * profile.windAcceleration;
  });
  assert.deepEqual([...windEffects].sort((a, b) => a - b), windEffects);
  for (let index = 1; index < windEffects.length; index += 1) {
    assert.ok(windEffects[index] / windEffects[index - 1] < 4);
  }
});

test('automatic quality is conservative when iOS-style capability data is unavailable', () => {
  assert.equal(resolveQuality('auto', {}).key, 'balanced');
  assert.equal(resolveQuality('auto', { hardwareConcurrency: 4 }).key, 'lite');
  assert.equal(resolveQuality('auto', { deviceMemory: 8, hardwareConcurrency: 8 }).key, 'high');
  assert.equal(resolveQuality('lite', { deviceMemory: 8, hardwareConcurrency: 8 }).key, 'lite');
});

test('performance fallback only lowers quality and stops at lite', () => {
  assert.equal(lowerQuality(resolveQuality('high')).key, 'balanced');
  assert.equal(lowerQuality(resolveQuality('balanced')).key, 'lite');
  assert.equal(lowerQuality(resolveQuality('lite')).key, 'lite');
});
