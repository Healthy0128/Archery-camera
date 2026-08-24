const DRAW_CORE_INDEXES = [0, 5, 9, 13, 17];

function landmarkCenter(landmarks) {
  let x = 0;
  let y = 0;
  for (const point of landmarks) {
    x += point.x;
    y += point.y;
  }
  return { x: x / landmarks.length, y: y / landmarks.length };
}

function landmarkSpread(landmarks, center = landmarkCenter(landmarks)) {
  let sum = 0;
  for (const point of landmarks) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    sum += dx * dx + dy * dy;
  }
  return Math.sqrt(sum / landmarks.length);
}

export function drawCoreSample(landmarks) {
  const core = DRAW_CORE_INDEXES.map(index => landmarks[index]);
  const center = landmarkCenter(core);
  return { x: center.x, y: center.y, spread: landmarkSpread(core, center) };
}

export class GyroInput {
  constructor(THREE, config, getDrawState) {
    this.THREE = THREE;
    this.config = config;
    this.getDrawState = getDrawState;
    this.enabled = false;
    this.seen = false;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.currentQuaternion = new THREE.Quaternion();
    this.baseQuaternion = new THREE.Quaternion();
    this.relativeQuaternion = new THREE.Quaternion();
    this.deviceEuler = new THREE.Euler();
    this.relativeEuler = new THREE.Euler();
    this.screenQuaternion = new THREE.Quaternion();
    this.zee = new THREE.Vector3(0, 0, 1);
    this.screenFix = new THREE.Quaternion(-Math.sqrt(.5), 0, 0, Math.sqrt(.5));
    this.boundOrientation = event => this.onOrientation(event);
    window.addEventListener('deviceorientation', this.boundOrientation, { passive: true });
  }

  static deadzoneRad(THREE, value, deadzoneDegrees) {
    const deadzone = THREE.MathUtils.degToRad(deadzoneDegrees);
    const amount = Math.abs(value);
    return amount <= deadzone ? 0 : Math.sign(value) * (amount - deadzone);
  }

  getScreenAngle() {
    const angle = screen.orientation?.angle;
    return Number.isFinite(angle) ? angle : (Number(window.orientation) || 0);
  }

  buildDeviceQuaternion(event) {
    const { THREE } = this;
    const alpha = THREE.MathUtils.degToRad(event.alpha || 0);
    const beta = THREE.MathUtils.degToRad(event.beta || 0);
    const gamma = THREE.MathUtils.degToRad(event.gamma || 0);
    const orientation = THREE.MathUtils.degToRad(this.getScreenAngle());
    this.deviceEuler.set(beta, alpha, -gamma, 'YXZ');
    this.currentQuaternion.setFromEuler(this.deviceEuler).multiply(this.screenFix);
    this.screenQuaternion.setFromAxisAngle(this.zee, -orientation);
    return this.currentQuaternion.multiply(this.screenQuaternion);
  }

  calibrate() {
    if (this.seen) this.baseQuaternion.copy(this.currentQuaternion);
    this.targetYaw = this.yaw = 0;
    this.targetPitch = this.pitch = 0;
  }

  onOrientation(event) {
    if (event.alpha == null) return;
    const { THREE, config } = this;
    this.buildDeviceQuaternion(event);
    if (!this.seen) {
      this.seen = true;
      this.baseQuaternion.copy(this.currentQuaternion);
    }
    if (!this.enabled) return;
    this.relativeQuaternion.copy(this.baseQuaternion).invert().multiply(this.currentQuaternion);
    this.relativeEuler.setFromQuaternion(this.relativeQuaternion, 'YXZ');
    const pitch = GyroInput.deadzoneRad(THREE, this.relativeEuler.x, config.deadzoneDeg);
    const yaw = GyroInput.deadzoneRad(THREE, this.relativeEuler.y, config.deadzoneDeg);
    const { drawPower, fullDrawHold } = this.getDrawState();
    const fatigueProgress = drawPower > .86
      ? THREE.MathUtils.clamp((fullDrawHold - config.fatigueStartSec) / config.fatigueRampSec, 0, 1)
      : 0;
    const fatigue = THREE.MathUtils.lerp(1, config.fatigueMaxMultiplier, fatigueProgress);
    const precision = THREE.MathUtils.lerp(1, config.fullDrawMultiplier, drawPower) * fatigue;
    this.targetYaw = THREE.MathUtils.clamp(yaw * config.yawSensitivity * config.yawSign * precision, -config.maxYaw, config.maxYaw);
    this.targetPitch = THREE.MathUtils.clamp(pitch * config.pitchSensitivity * config.pitchSign * precision, -config.maxPitch, config.maxPitch);
  }

  update(delta) {
    const smoothing = 1 - Math.exp(-this.config.smoothingHz * delta);
    this.yaw += (this.targetYaw - this.yaw) * smoothing;
    this.pitch += (this.targetPitch - this.pitch) * smoothing;
  }
}

export class HandInput {
  constructor(config, elements, callbacks = {}) {
    this.config = config;
    this.elements = elements;
    this.callbacks = callbacks;
    this.enabled = false;
    this.ready = false;
    this.initPromise = null;
    this.detected = false;
    this.landmarker = null;
    this.stream = null;
    this.lastVideoTime = -1;
    this.lastInference = 0;
    this.lastDetectedAt = 0;
    this.lastSample = null;
    this.activeBaseline = null;
    this.calibrationSamples = [];
    this.power = 0;
    this.targetPower = 0;
    this.ctx = elements.overlay.getContext('2d');
    this.pinchHeld = false;
    this.pinchStart = 0;
    this.releaseArmed = false;
    this.lastPinchRatio = null;
    this.state = 'unregistered';
  }

  async init(FilesetResolver, HandLandmarker) {
    if (this.ready) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initialize(FilesetResolver, HandLandmarker);
    try {
      await this.initPromise;
    } finally {
      if (!this.ready) this.initPromise = null;
    }
  }

  async initialize(FilesetResolver, HandLandmarker) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera unavailable');
    this.elements.preview.classList.add('active');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } },
      audio: false
    });
    this.elements.video.srcObject = this.stream;
    await this.elements.video.play();
    this.emitState('loading', '手認識を読み込み中…');
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
    const options = {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: .55,
      minHandPresenceConfidence: .5,
      minTrackingConfidence: .5
    };
    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, options);
    } catch {
      options.baseOptions.delegate = 'CPU';
      this.landmarker = await HandLandmarker.createFromOptions(vision, options);
    }
    this.ready = true;
    this.resizeOverlay();
    this.emitState('missing', '手をカメラに見せてください');
  }

  resizeOverlay() {
    this.elements.overlay.width = this.elements.video.videoWidth || 320;
    this.elements.overlay.height = this.elements.video.videoHeight || 240;
  }

  loadCalibration(calibration) {
    this.activeBaseline = calibration?.handBaseline ? { ...calibration.handBaseline } : null;
    this.calibrationSamples.length = 0;
    this.power = this.targetPower = 0;
    this.resetGesture();
    this.emitState(this.activeBaseline ? 'registered' : 'unregistered', this.activeBaseline ? '基準登録済み' : '基準を登録してください');
  }

  collectCalibrationSample(sample, now) {
    this.calibrationSamples.push({ ...sample, time: now });
    const cutoff = now - this.config.calibrationWindowMs;
    this.calibrationSamples = this.calibrationSamples.filter(item => item.time >= cutoff).slice(-this.config.calibrationMaxSamples);
  }

  getStableBaseline() {
    const samples = this.calibrationSamples;
    if (samples.length < 5 || samples.at(-1).time - samples[0].time < this.config.calibrationWindowMs * .6) return null;
    const average = key => samples.reduce((sum, sample) => sum + sample[key], 0) / samples.length;
    const x = average('x');
    const y = average('y');
    const spread = average('spread');
    const positionDeviation = Math.max(...samples.map(sample => Math.hypot(sample.x - x, sample.y - y)));
    const spreadDeviation = Math.max(...samples.map(sample => Math.abs(sample.spread - spread) / spread));
    if (positionDeviation > this.config.calibrationPositionTolerance || spreadDeviation > this.config.calibrationSpreadTolerance) return null;
    return {
      sample: { x, y, spread },
      auxiliary: { sampleCount: samples.length, stability: Math.max(positionDeviation, spreadDeviation) }
    };
  }

  registerBaseline() {
    if (!this.detected || !this.lastSample) return { ok: false, reason: '手をカメラに戻してください' };
    const stable = this.getStableBaseline();
    if (!stable) return { ok: false, reason: '手を自然な位置で少し止めてください' };
    this.activeBaseline = { ...stable.sample };
    this.power = this.targetPower = 0;
    this.resetGesture();
    this.emitState('registered', '登録完了。🤏でつまんで奥へ引いてください');
    return { ok: true, ...stable };
  }

  computePower(sample) {
    if (!this.activeBaseline) return 0;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const shrink = 1 - sample.spread / Math.max(this.activeBaseline.spread, .0001);
    if (shrink <= this.config.drawStartShrink) return 0;
    const shrinkScore = clamp((shrink - this.config.drawStartShrink) / (this.config.fullDrawShrink - this.config.drawStartShrink), 0, 1);
    const baseOut = Math.abs(this.activeBaseline.x - .5);
    const nowOut = Math.abs(sample.x - .5);
    const positionScore = clamp(Math.max(0, nowOut - baseOut) / .28, 0, 1);
    const verticalPenalty = clamp(Math.abs(sample.y - this.activeBaseline.y) / .35, 0, .25);
    return clamp(shrinkScore * this.config.shrinkWeight + positionScore * this.config.positionWeight - verticalPenalty * this.config.verticalPenalty, 0, 1);
  }

  pinchRatio(landmarks) {
    const tipDistance = Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y);
    const palmWidth = Math.max(Math.hypot(landmarks[5].x - landmarks[17].x, landmarks[5].y - landmarks[17].y), .0001);
    return tipDistance / palmWidth;
  }

  updateReleaseGesture(landmarks, now) {
    const ratio = this.pinchRatio(landmarks);
    const close = ratio <= this.config.pinchCloseRatio;
    const open = ratio >= this.config.pinchOpenRatio;
    const jump = this.lastPinchRatio == null ? 0 : ratio - this.lastPinchRatio;
    const releasePower = Math.max(this.power, this.targetPower);
    if (close) {
      if (!this.pinchHeld) {
        this.pinchHeld = true;
        this.pinchStart = now;
        this.releaseArmed = false;
      }
      if (now - this.pinchStart >= this.config.pinchHoldMs && releasePower >= this.config.minReleasePower) this.releaseArmed = true;
    } else if (this.pinchHeld) {
      if (this.releaseArmed && open && jump >= this.config.pinchReleaseJump) {
        this.resetGesture();
        this.lastPinchRatio = ratio;
        this.callbacks.onRelease?.(releasePower);
        return { ratio, released: true, armed: false };
      }
      if (open) this.resetGesture();
    }
    this.lastPinchRatio = ratio;
    return { ratio, released: false, armed: this.releaseArmed };
  }

  emitState(state, message) {
    this.state = state;
    this.elements.status.textContent = message;
    this.callbacks.onState?.(state, message);
  }

  drawLandmarks(landmarks) {
    const { ctx } = this;
    const width = this.elements.overlay.width;
    const height = this.elements.overlay.height;
    ctx.clearRect(0, 0, width, height);
    if (!landmarks) return;
    const links = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath();
    for (const [from, to] of links) {
      ctx.moveTo((1 - landmarks[from].x) * width, landmarks[from].y * height);
      ctx.lineTo((1 - landmarks[to].x) * width, landmarks[to].y * height);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,210,45,.95)';
    for (const point of landmarks) {
      ctx.beginPath();
      ctx.arc((1 - point.x) * width, point.y * height, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  updateTracking(now) {
    if (!this.enabled || !this.ready || this.elements.video.readyState < 2 || !this.landmarker) return;
    if (now - this.lastInference < 50 || this.elements.video.currentTime === this.lastVideoTime) return;
    this.lastInference = now;
    this.lastVideoTime = this.elements.video.currentTime;
    let result;
    try {
      result = this.landmarker.detectForVideo(this.elements.video, now);
    } catch {
      this.emitState('error', '手認識エラー');
      return;
    }
    const landmarks = result.landmarks?.[0];
    if (!landmarks) {
      const gap = now - this.lastDetectedAt;
      if (gap >= this.config.detectionGraceMs) {
        this.detected = false;
        this.lastSample = null;
        this.targetPower = 0;
        this.resetGesture();
        this.drawLandmarks(null);
        this.emitState('missing', '手をカメラに戻してください');
      }
      return;
    }
    this.detected = true;
    this.lastDetectedAt = now;
    this.lastSample = drawCoreSample(landmarks);
    this.collectCalibrationSample(this.lastSample, now);
    if (!this.activeBaseline) {
      this.targetPower = 0;
      this.resetGesture();
      const stable = this.getStableBaseline();
      this.emitState(stable ? 'calibration-ready' : 'unregistered', stable ? '手認識OK・基準を登録できます' : '基準未登録・自然な位置で止める');
    } else {
      this.targetPower = this.computePower(this.lastSample);
      const gesture = this.updateReleaseGesture(landmarks, now);
      const power = Math.max(this.power, this.targetPower);
      if (gesture.released) this.emitState('released', 'リリース検出');
      else if (gesture.armed) this.emitState('ready', `発射可能・引き ${Math.round(power * 100)}%`);
      else if (this.pinchHeld && power < this.config.minReleasePower) this.emitState('draw-low', '引き不足・もっと奥へ引いてください');
      else if (this.pinchHeld) this.emitState('pinched', '弦をつかんだ・そのまま奥へ');
      else this.emitState('registered', '🤏で弦をつかんでください');
    }
    this.drawLandmarks(landmarks);
  }

  updatePower(delta) {
    const smoothing = 1 - Math.exp(-this.config.smoothingHz * delta);
    this.power += (this.targetPower - this.power) * smoothing;
  }

  resetGesture() {
    this.pinchHeld = false;
    this.pinchStart = 0;
    this.releaseArmed = false;
    this.lastPinchRatio = null;
  }

  resetForTurn() {
    this.power = this.targetPower = 0;
    this.resetGesture();
  }

  resetMatch() {
    this.activeBaseline = null;
    this.calibrationSamples.length = 0;
    this.detected = false;
    this.lastSample = null;
    this.power = this.targetPower = 0;
    this.resetGesture();
  }
}
