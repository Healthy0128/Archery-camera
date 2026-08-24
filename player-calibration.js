const VALID_PHONE_HANDS = new Set(['left', 'right']);

export class PlayerCalibration {
  constructor() {
    this.handBaseline = null;
    this.phoneHand = null;
    this.phoneHandConfigured = false;
  }

  get isHandRegistered() {
    return Boolean(this.handBaseline);
  }

  registerHand(sample, auxiliary = {}) {
    if (!sample || !Number.isFinite(sample.x) || !Number.isFinite(sample.y) || !Number.isFinite(sample.spread) || sample.spread <= 0) {
      throw new TypeError('A valid palm-core sample is required');
    }
    this.handBaseline = Object.freeze({
      x: sample.x,
      y: sample.y,
      spread: sample.spread,
      sampleCount: auxiliary.sampleCount || 1,
      stability: auxiliary.stability ?? null,
      registeredAt: Date.now()
    });
    return this.handBaseline;
  }

  setPhoneHand(side) {
    if (!VALID_PHONE_HANDS.has(side)) throw new TypeError('Phone hand must be left or right');
    this.phoneHand = side;
    this.phoneHandConfigured = true;
  }

  clearHand() {
    this.handBaseline = null;
  }
}
