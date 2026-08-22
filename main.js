import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm';

const $=s=>document.querySelector(s);
const clamp=THREE.MathUtils.clamp;
const lerp=THREE.MathUtils.lerp;
const canvas=$('#game');

const ui={
  score:$('#score'), arrows:$('#arrows'), wind:$('#wind'), powerText:$('#powerText'), powerFill:$('#powerFill'),
  message:$('#message'), startPanel:$('#startPanel'), startBtn:$('#startBtn'), mouseBtn:$('#mouseBtn'),
  calibrateBtn:$('#calibrateBtn'), handCalibrateBtn:$('#handCalibrateBtn'), soundBtn:$('#soundBtn'),
  handPreview:$('#handPreview'), handStatus:$('#handStatus'), handVideo:$('#handVideo'), handOverlay:$('#handOverlay'),
  reticle:$('#reticle'), app:$('#app'), combo:$('#combo'), comboCard:$('#comboCard'), bullseye:$('#bullseyeFx'),
  result:$('#resultPanel'), resultScore:$('#resultScore'), resultAvg:$('#resultAvg'), resultBest:$('#resultBest'),
  resultTens:$('#resultTens'), resultCombo:$('#resultCombo'), restartBtn:$('#restartBtn')
};

const CONFIG={
  gyro:{
    yawSensitivity:.38,
    pitchSensitivity:.34,
    fullDrawMultiplier:.58,
    deadzoneDeg:.8,
    smoothingHz:5.2,
    maxYaw:1.05,
    maxPitch:.62,
    // Portrait iPhone directions after quaternion conversion.
    yawSign:1,
    pitchSign:1
  },
  hand:{
    fullDrawShrink:.35,
    shrinkWeight:.88,
    positionWeight:.12,
    verticalPenalty:.04,
    smoothingHz:8
  },
  physics:{
    minArrowSpeed:24,
    maxArrowSpeed:62,
    gravity:4.2,
    windAcceleration:.11
  },
  arrowsPerRound:10,
  targetZ:-25,
  baseFov:58,
  fullDrawFov:36
};

function showMessage(text,ms=800){
  ui.message.textContent=text;
  ui.message.classList.add('show');
  clearTimeout(showMessage.timer);
  showMessage.timer=setTimeout(()=>ui.message.classList.remove('show'),ms);
}

class GyroInput{
  constructor(){
    this.enabled=false;
    this.seen=false;
    this.targetYaw=0;
    this.targetPitch=0;
    this.yaw=0;
    this.pitch=0;
    this.currentQuaternion=new THREE.Quaternion();
    this.baseQuaternion=new THREE.Quaternion();
    this.relativeQuaternion=new THREE.Quaternion();
    this.deviceEuler=new THREE.Euler();
    this.relativeEuler=new THREE.Euler();
    this.screenQuaternion=new THREE.Quaternion();
    this.zee=new THREE.Vector3(0,0,1);
    this.screenFix=new THREE.Quaternion(-Math.sqrt(.5),0,0,Math.sqrt(.5));
    window.addEventListener('deviceorientation',e=>this.onOrientation(e),{passive:true});
  }
  static deadzoneRad(v,dzDeg){
    const dz=THREE.MathUtils.degToRad(dzDeg);
    const a=Math.abs(v);
    if(a<=dz) return 0;
    return Math.sign(v)*(a-dz);
  }
  getScreenAngle(){
    const angle=screen.orientation?.angle;
    if(Number.isFinite(angle)) return angle;
    return Number(window.orientation)||0;
  }
  buildDeviceQuaternion(event){
    const alpha=THREE.MathUtils.degToRad(event.alpha||0);
    const beta=THREE.MathUtils.degToRad(event.beta||0);
    const gamma=THREE.MathUtils.degToRad(event.gamma||0);
    const orient=THREE.MathUtils.degToRad(this.getScreenAngle());

    this.deviceEuler.set(beta,alpha,-gamma,'YXZ');
    this.currentQuaternion.setFromEuler(this.deviceEuler);
    this.currentQuaternion.multiply(this.screenFix);
    this.screenQuaternion.setFromAxisAngle(this.zee,-orient);
    this.currentQuaternion.multiply(this.screenQuaternion);
    return this.currentQuaternion;
  }
  calibrate(){
    if(this.seen) this.baseQuaternion.copy(this.currentQuaternion);
    this.targetYaw=this.yaw=0;
    this.targetPitch=this.pitch=0;
    showMessage('照準リセット',500);
  }
  onOrientation(event){
    if(event.alpha==null) return;
    this.buildDeviceQuaternion(event);
    if(!this.seen){
      this.seen=true;
      this.baseQuaternion.copy(this.currentQuaternion);
    }
    if(!this.enabled) return;

    this.relativeQuaternion.copy(this.baseQuaternion).invert().multiply(this.currentQuaternion);
    this.relativeEuler.setFromQuaternion(this.relativeQuaternion,'YXZ');

    let pitch=GyroInput.deadzoneRad(this.relativeEuler.x,CONFIG.gyro.deadzoneDeg);
    let yaw=GyroInput.deadzoneRad(this.relativeEuler.y,CONFIG.gyro.deadzoneDeg);
    const precision=lerp(1,CONFIG.gyro.fullDrawMultiplier,drawPower);

    this.targetYaw=clamp(yaw*CONFIG.gyro.yawSensitivity*CONFIG.gyro.yawSign*precision,-CONFIG.gyro.maxYaw,CONFIG.gyro.maxYaw);
    this.targetPitch=clamp(pitch*CONFIG.gyro.pitchSensitivity*CONFIG.gyro.pitchSign*precision,-CONFIG.gyro.maxPitch,CONFIG.gyro.maxPitch);
  }
  update(dt){
    const k=1-Math.exp(-CONFIG.gyro.smoothingHz*dt);
    this.yaw+=(this.targetYaw-this.yaw)*k;
    this.pitch+=(this.targetPitch-this.pitch)*k;
  }
}

function landmarkCenter(lm){
  let x=0,y=0;
  for(const p of lm){ x+=p.x; y+=p.y; }
  return {x:x/lm.length,y:y/lm.length};
}
function landmarkSpread(lm,center=landmarkCenter(lm)){
  let sum=0;
  for(const p of lm){
    const dx=p.x-center.x,dy=p.y-center.y;
    sum+=dx*dx+dy*dy;
  }
  return Math.sqrt(sum/lm.length);
}

class HandInput{
  constructor(){
    this.enabled=false;
    this.ready=false;
    this.detected=false;
    this.landmarker=null;
    this.stream=null;
    this.lastVideoTime=-1;
    this.lastInference=0;
    this.lastSample=null;
    this.baseline=null;
    this.power=0;
    this.targetPower=0;
    this.ctx=ui.handOverlay.getContext('2d');
  }
  async init(){
    if(!navigator.mediaDevices?.getUserMedia) throw new Error('camera unavailable');
    ui.handPreview.classList.add('active');
    this.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}},audio:false});
    ui.handVideo.srcObject=this.stream;
    await ui.handVideo.play();

    ui.handStatus.textContent='手認識を読み込み中…';
    const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
    const options={baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.55,minHandPresenceConfidence:.5,minTrackingConfidence:.5};
    try{ this.landmarker=await HandLandmarker.createFromOptions(vision,options); }
    catch{ options.baseOptions.delegate='CPU'; this.landmarker=await HandLandmarker.createFromOptions(vision,options); }
    this.ready=true;
    this.resizeOverlay();
    ui.handStatus.textContent='手をカメラに見せてください';
  }
  resizeOverlay(){
    ui.handOverlay.width=ui.handVideo.videoWidth||320;
    ui.handOverlay.height=ui.handVideo.videoHeight||240;
  }
  registerBaseline(){
    if(!this.lastSample){ showMessage('手が見えていません',900); return false; }
    this.baseline={...this.lastSample};
    this.power=this.targetPower=0;
    ui.handStatus.textContent='基準登録OK。手を奥へ引こう';
    showMessage('手の基準を登録',700);
    return true;
  }
  computePower(sample){
    if(!this.baseline) return 0;
    const shrink=1-sample.spread/Math.max(this.baseline.spread,.0001);
    const shrinkScore=clamp(shrink/CONFIG.hand.fullDrawShrink,0,1);
    const baseOut=Math.abs(this.baseline.x-.5);
    const nowOut=Math.abs(sample.x-.5);
    const positionScore=clamp(Math.max(0,nowOut-baseOut)/.28,0,1);
    const verticalPenalty=clamp(Math.abs(sample.y-this.baseline.y)/.35,0,.25);
    return clamp(shrinkScore*CONFIG.hand.shrinkWeight + positionScore*CONFIG.hand.positionWeight - verticalPenalty*CONFIG.hand.verticalPenalty,0,1);
  }
  drawLandmarks(lm){
    const ctx=this.ctx,w=ui.handOverlay.width,h=ui.handOverlay.height;
    ctx.clearRect(0,0,w,h);
    if(!lm) return;
    const links=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    ctx.lineWidth=4; ctx.strokeStyle='rgba(255,255,255,.95)'; ctx.beginPath();
    for(const [a,b] of links){ ctx.moveTo((1-lm[a].x)*w,lm[a].y*h); ctx.lineTo((1-lm[b].x)*w,lm[b].y*h); }
    ctx.stroke();
    ctx.fillStyle='rgba(255,210,45,.95)';
    for(const p of lm){ ctx.beginPath(); ctx.arc((1-p.x)*w,p.y*h,4,0,Math.PI*2); ctx.fill(); }
  }
  updateTracking(now){
    if(!this.enabled||!this.ready||ui.handVideo.readyState<2||!this.landmarker) return;
    if(now-this.lastInference<50||ui.handVideo.currentTime===this.lastVideoTime) return;
    this.lastInference=now;
    this.lastVideoTime=ui.handVideo.currentTime;
    let result;
    try{ result=this.landmarker.detectForVideo(ui.handVideo,now); }
    catch{ ui.handStatus.textContent='手認識エラー'; return; }
    const lm=result.landmarks?.[0];
    this.detected=!!lm;
    if(!lm){
      this.lastSample=null;
      this.targetPower=0;
      this.drawLandmarks(null);
      ui.handStatus.textContent='手をカメラに見せてください';
      return;
    }
    const center=landmarkCenter(lm);
    this.lastSample={x:center.x,y:center.y,spread:landmarkSpread(lm,center)};
    if(!this.baseline){
      this.targetPower=0;
      ui.handStatus.textContent='構え位置で「手の基準」を押す';
    }else{
      this.targetPower=this.computePower(this.lastSample);
      const shrinkPct=Math.max(0,Math.round((1-this.lastSample.spread/this.baseline.spread)*100));
      ui.handStatus.textContent=this.targetPower>.86?`フルドロー！  手サイズ -${shrinkPct}%`:this.targetPower>.35?`引き ${Math.round(this.targetPower*100)}%  手サイズ -${shrinkPct}%`:'手を奥へ引こう';
    }
    this.drawLandmarks(lm);
  }
  updatePower(dt){
    const k=1-Math.exp(-CONFIG.hand.smoothingHz*dt);
    this.power+=(this.targetPower-this.power)*k;
  }
  reset(){
    this.baseline=null;
    this.power=this.targetPower=0;
  }
}

const gyro=new GyroInput();
const hand=new HandInput();
let drawPower=0;
let running=false;
let mouseMode=false;
let soundOn=true;
let score=0;
let arrowsLeft=CONFIG.arrowsPerRound;
let wind=0;
let combo=0;
let bestCombo=0;
let shotScores=[];
let fullDrawHold=0;
let releaseKick=0;
let cinematic=null;

const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;

const scene=new THREE.Scene();
scene.background=new THREE.Color(0xa8dcff);
scene.fog=new THREE.Fog(0xa8dcff,42,95);
const camera=new THREE.PerspectiveCamera(CONFIG.baseFov,1,.1,150);
const HOME=new THREE.Vector3(0,1.65,4.5);
camera.position.copy(HOME);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xffffff,0x4c6c38,2.2));
const sun=new THREE.DirectionalLight(0xffffff,2.4); sun.position.set(-8,14,8); sun.castShadow=true; scene.add(sun);

const ground=new THREE.Mesh(new THREE.PlaneGeometry(130,130),new THREE.MeshStandardMaterial({color:0x72ad52,roughness:1}));
ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
const lane=new THREE.Mesh(new THREE.PlaneGeometry(7,42),new THREE.MeshStandardMaterial({color:0xcaa873,roughness:1}));
lane.rotation.x=-Math.PI/2; lane.position.set(0,.012,-17); lane.receiveShadow=true; scene.add(lane);

const trunkMat=new THREE.MeshStandardMaterial({color:0x765035,roughness:1});
const leafMat=new THREE.MeshStandardMaterial({color:0x3b8647,roughness:1});
function addTree(x,z,s=.9){
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.18*s,.25*s,1.9*s,8),trunkMat); trunk.position.set(x,.95*s,z); scene.add(trunk);
  const crown=new THREE.Mesh(new THREE.ConeGeometry(1.1*s,2.8*s,9),leafMat); crown.position.set(x,2.7*s,z); scene.add(crown);
}
for(let z=-4;z>-66;z-=6){ addTree(-7,z); addTree(7,z); }

const target=new THREE.Group(); target.position.set(0,2.2,CONFIG.targetZ); scene.add(target);
[[1.65,0xf5f2df],[1.35,0x20242a],[1.08,0x2785c6],[.80,0xd73c38],[.52,0xf0c52c],[.20,0xf6d13e]].forEach(([r,c],i)=>{
  const disk=new THREE.Mesh(new THREE.CylinderGeometry(r,r,.12,64),new THREE.MeshStandardMaterial({color:c,roughness:.75}));
  disk.rotation.x=Math.PI/2; disk.position.z=i*.011; target.add(disk);
});
const standMat=new THREE.MeshStandardMaterial({color:0x7d5738,roughness:1});
for(const x of[-.75,.75]){ const leg=new THREE.Mesh(new THREE.BoxGeometry(.18,2.4,.18),standMat); leg.position.set(x,-1.55,.2); leg.rotation.z=x<0?-.12:.12; target.add(leg); }

const flagGroup=new THREE.Group(); flagGroup.position.set(-3.35,0,-12); scene.add(flagGroup);
const pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,3.25,10),new THREE.MeshStandardMaterial({color:0xd6d9d8})); pole.position.y=1.62; flagGroup.add(pole);
const flagGeo=new THREE.PlaneGeometry(1.45,.72,8,2); flagGeo.translate(.72,0,0); const flagBase=Float32Array.from(flagGeo.attributes.position.array);
const flag=new THREE.Mesh(flagGeo,new THREE.MeshStandardMaterial({color:0xf4f0dc,side:THREE.DoubleSide})); flag.position.y=2.62; flagGroup.add(flag);

const bow=new THREE.Group();
const bowMat=new THREE.MeshStandardMaterial({color:0x8a4f27,roughness:.5});
function limb(y,r){ const m=new THREE.Mesh(new THREE.BoxGeometry(.08,1.15,.07),bowMat); m.position.y=y; m.rotation.z=r; return m; }
const upper=limb(.58,-.18),lower=limb(-.58,.18); bow.add(upper,lower);
const grip=new THREE.Mesh(new THREE.BoxGeometry(.14,.38,.13),new THREE.MeshStandardMaterial({color:0x3f2a1f})); bow.add(grip);
const stringPos=new Float32Array([-.1,1.14,0,.18,0,0,-.1,-1.14,0]);
const stringGeo=new THREE.BufferGeometry(); stringGeo.setAttribute('position',new THREE.BufferAttribute(stringPos,3));
bow.add(new THREE.Line(stringGeo,new THREE.LineBasicMaterial({color:0xe9e0ca})));
bow.position.set(-.72,-.55,-1.75); bow.rotation.z=.08; bow.scale.setScalar(.72); camera.add(bow);

const audio=(()=>{
  let ctx=null,master=null,bgm=null,step=0;
  const notes=[261.63,329.63,392,523.25,392,329.63,293.66,369.99,440,587.33,440,369.99];
  function ensure(){ if(!ctx){ctx=new(window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=.45;master.connect(ctx.destination);} if(ctx.state==='suspended')ctx.resume().catch(()=>{});return ctx; }
  function tone(f,d=.16,v=.1,type='sine',delay=0){ if(!soundOn)return; const c=ensure(),o=c.createOscillator(),g=c.createGain();o.frequency.value=f;o.type=type;g.gain.setValueAtTime(v,c.currentTime+delay);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+delay+d);o.connect(g);g.connect(master);o.start(c.currentTime+delay);o.stop(c.currentTime+delay+d+.02); }
  return {
    shoot(){tone(155,.22,.22,'triangle');tone(235,.15,.1,'sine',.01);}, hit(){tone(88,.16,.18);}, score(){tone(880,.23,.09);tone(1320,.28,.06,'sine',.05);}, creak(){tone(105,.11,.035,'sawtooth');},
    start(){if(bgm||!soundOn)return;ensure();const tick=()=>{if(running){const f=notes[step++%notes.length];tone(f,.28,.028,'triangle');}};tick();bgm=setInterval(tick,500);},
    stop(){if(bgm){clearInterval(bgm);bgm=null;}}
  };
})();

function setWind(){ wind=Math.random()*4-2; ui.wind.textContent=`${Math.abs(wind).toFixed(1)} m/s ${wind>=0?'→':'←'}`; }
function updateHud(){ ui.score.textContent=score; ui.arrows.textContent=arrowsLeft; ui.combo.textContent=`×${Math.max(combo,1)}`; ui.comboCard.classList.toggle('active',combo>=2); }
function updateCombo(points){ if(points>=8){combo++;bestCombo=Math.max(bestCombo,combo);}else combo=0; updateHud(); }
function triggerBullseye(){ ui.bullseye.classList.remove('fire'); void ui.bullseye.offsetWidth; ui.bullseye.classList.add('fire'); if(navigator.vibrate)navigator.vibrate([25,25,45]); }

function makeArrow(){
  const g=new THREE.Group();
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,1.25,10),new THREE.MeshStandardMaterial({color:0xe6d2a2})); shaft.rotation.x=Math.PI/2; shaft.position.z=-.06; g.add(shaft);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(.055,.18,10),new THREE.MeshStandardMaterial({color:0x777b7d,metalness:.5})); tip.rotation.x=-Math.PI/2; tip.position.z=-.78; g.add(tip);
  return g;
}
const arrows=[];
const stuck=[];
const forward=new THREE.Vector3();
const tmpQuat=new THREE.Quaternion();
const aimEuler=new THREE.Euler(0,0,0,'YXZ');
function orientArrow(mesh,vel){ tmpQuat.setFromUnitVectors(new THREE.Vector3(0,0,-1),vel.clone().normalize()); mesh.quaternion.copy(tmpQuat); }
function pointsFor(x,y){const r=Math.hypot(x,y);return r<=.2?10:r<=.52?9:r<=.8?8:r<=1.08?6:r<=1.35?4:r<=1.65?2:0;}

function fire(){
  if(!running||arrowsLeft<=0||cinematic)return;
  if(hand.enabled&&!hand.baseline){showMessage('先に手の基準を登録',850);return;}
  if(hand.enabled&&!hand.detected){showMessage('手が見えていません',700);return;}
  const power=hand.enabled?Math.max(.1,drawPower):.82;
  arrowsLeft--; updateHud(); audio.shoot();
  const mesh=makeArrow(); camera.getWorldPosition(mesh.position); mesh.position.add(new THREE.Vector3(0,-.08,-.35).applyQuaternion(camera.quaternion));
  camera.getWorldDirection(forward);
  const speed=lerp(CONFIG.physics.minArrowSpeed,CONFIG.physics.maxArrowSpeed,power);
  const velocity=forward.clone().multiplyScalar(speed);
  scene.add(mesh);
  const shot={mesh,velocity,life:0,scored:false}; arrows.push(shot); releaseKick=1; fullDrawHold=0; cinematic={shot,phase:'launch',time:0,points:0};
  if(navigator.vibrate)navigator.vibrate(18);
  if(hand.enabled){hand.power=hand.targetPower=0;}
}

function updateArrows(dt){
  for(let i=arrows.length-1;i>=0;i--){
    const a=arrows[i]; a.life+=dt; const prevZ=a.mesh.position.z;
    a.velocity.y-=CONFIG.physics.gravity*dt;
    a.velocity.x+=wind*CONFIG.physics.windAcceleration*dt;
    a.mesh.position.addScaledVector(a.velocity,dt); orientArrow(a.mesh,a.velocity);
    if(!a.scored&&prevZ>CONFIG.targetZ+.12&&a.mesh.position.z<=CONFIG.targetZ+.12){
      a.scored=true; const x=a.mesh.position.x-target.position.x,y=a.mesh.position.y-target.position.y,pts=pointsFor(x,y);
      if(Math.hypot(x,y)<=1.68){
        audio.hit(); if(pts>=8)audio.score(); score+=pts; shotScores.push(pts); updateCombo(pts);
        if(pts===10){triggerBullseye();showMessage('10  BULLSEYE!',1000);}else if(pts>=8)showMessage(`${pts} POINT!${combo>=2?`  COMBO ×${combo}`:''}`,900);else showMessage(pts?`${pts} POINT!`:'MISS',850);
        a.velocity.set(0,0,0); a.mesh.position.z=CONFIG.targetZ+.20; stuck.push(a.mesh); arrows.splice(i,1);
        if(cinematic?.shot===a){cinematic.phase='impact';cinematic.time=0;cinematic.points=pts;cinematic.hitMesh=a.mesh;}
        continue;
      }
      shotScores.push(0);updateCombo(0);showMessage('MISS',650);
    }
    if(a.mesh.position.y<0||a.life>5){
      if(!a.scored){a.scored=true;shotScores.push(0);updateCombo(0);showMessage('MISS',650);}scene.remove(a.mesh);arrows.splice(i,1);if(cinematic?.shot===a){cinematic.phase='return';cinematic.time=0;}
    }
  }
  while(stuck.length>18)scene.remove(stuck.shift());
}

function updateWind(now){
  const strength=clamp(wind/2,-1,1),arr=flagGeo.attributes.position.array;
  for(let i=0;i<arr.length;i+=3){const x0=flagBase[i],y0=flagBase[i+1],t=clamp(x0/1.45,0,1);arr[i]=x0;arr[i+1]=y0+Math.sin(now*.006+t*5.5)*.055*t*Math.abs(strength);arr[i+2]=strength*.24*t+Math.sin(now*.008+t*4)*.035*t;}
  flagGeo.attributes.position.needsUpdate=true; flag.rotation.y=-strength*.38;
}

function updateDraw(dt){
  hand.updatePower(dt);
  drawPower=hand.enabled?hand.power:.82;
  const pct=Math.round(drawPower*100); ui.powerText.textContent=`${pct}%`; ui.powerFill.style.width=`${pct}%`;
  if(drawPower>.86&&!cinematic){fullDrawHold+=dt;if(fullDrawHold>1.25&&Math.floor(fullDrawHold*3)!==Math.floor((fullDrawHold-dt)*3))audio.creak();}else fullDrawHold=Math.max(0,fullDrawHold-dt*3);
  const zoom=THREE.MathUtils.smoothstep(drawPower,.28,1),targetFov=lerp(CONFIG.baseFov,CONFIG.fullDrawFov,zoom);
  if(!cinematic){camera.fov+=(targetFov-camera.fov)*(1-Math.exp(-8*dt));camera.updateProjectionMatrix();}
  ui.reticle.style.setProperty('--draw-scale',lerp(1,.62,zoom).toFixed(3));ui.reticle.classList.toggle('full-draw',drawPower>.86);ui.reticle.classList.toggle('overheld',fullDrawHold>1.5);
  ui.app.style.setProperty('--draw-focus',zoom.toFixed(3));ui.app.style.setProperty('--strain',clamp((fullDrawHold-1.5)/2.5,0,1).toFixed(3));
  const p=stringGeo.attributes.position.array;p[3]=.18+drawPower*.20;p[5]=drawPower*.34;stringGeo.attributes.position.needsUpdate=true;upper.rotation.z=-.18-drawPower*.055;lower.rotation.z=.18+drawPower*.055;
}

function updateCinematic(dt){
  if(!cinematic)return false; cinematic.time+=dt; bow.visible=false; ui.reticle.classList.add('cinematic');
  if(cinematic.phase==='launch'&&cinematic.time>.2){cinematic.phase='follow';cinematic.time=0;}
  if(cinematic.phase==='follow'&&cinematic.shot?.mesh?.parent){const d=cinematic.shot.velocity.clone().normalize(),desired=cinematic.shot.mesh.position.clone().addScaledVector(d,-2.2).add(new THREE.Vector3(0,.42,0));camera.position.lerp(desired,1-Math.exp(-12*dt));camera.lookAt(cinematic.shot.mesh.position.clone().addScaledVector(d,5.5));camera.fov+=(48-camera.fov)*(1-Math.exp(-8*dt));camera.updateProjectionMatrix();return true;}
  if(cinematic.phase==='impact'){if(cinematic.hitMesh){const desired=cinematic.hitMesh.position.clone().add(new THREE.Vector3(.55,.35,2.1));camera.position.lerp(desired,1-Math.exp(-10*dt));camera.lookAt(cinematic.hitMesh.position);camera.fov+=(34-camera.fov)*(1-Math.exp(-10*dt));camera.updateProjectionMatrix();}if(cinematic.time>(cinematic.points===10?.58:.34)){cinematic.phase='return';cinematic.time=0;}return true;}
  if(cinematic.phase==='return'){camera.position.lerp(HOME,1-Math.exp(-10*dt));aimEuler.set(gyro.pitch,gyro.yaw,0,'YXZ');const q=new THREE.Quaternion().setFromEuler(aimEuler);camera.quaternion.slerp(q,1-Math.exp(-10*dt));camera.fov+=(CONFIG.baseFov-camera.fov)*(1-Math.exp(-8*dt));camera.updateProjectionMatrix();if(cinematic.time>.45||camera.position.distanceTo(HOME)<.03){camera.position.copy(HOME);camera.quaternion.copy(q);bow.visible=true;ui.reticle.classList.remove('cinematic');cinematic=null;if(arrowsLeft===0&&shotScores.length>=CONFIG.arrowsPerRound)setTimeout(showResults,260);}return true;}
  return true;
}

function showResults(){
  const best=shotScores.length?Math.max(...shotScores):0,tens=shotScores.filter(v=>v===10).length,avg=shotScores.length?score/shotScores.length:0;
  ui.resultScore.textContent=score;ui.resultAvg.textContent=avg.toFixed(1);ui.resultBest.textContent=best;ui.resultTens.textContent=tens;ui.resultCombo.textContent=bestCombo;ui.result.classList.add('show');
}
function resetRound(){
  for(const a of arrows)scene.remove(a.mesh);arrows.length=0;for(const a of stuck)scene.remove(a);stuck.length=0;score=0;arrowsLeft=CONFIG.arrowsPerRound;combo=bestCombo=0;shotScores=[];fullDrawHold=0;cinematic=null;bow.visible=true;hand.reset();setWind();gyro.calibrate();ui.result.classList.remove('show');updateHud();showMessage('NEW ROUND',700);
}

async function startGame(useSensors){
  running=true;mouseMode=!useSensors;gyro.enabled=useSensors;hand.enabled=useSensors;ui.startPanel.classList.add('hidden');score=0;arrowsLeft=CONFIG.arrowsPerRound;combo=bestCombo=0;shotScores=[];updateHud();setWind();hand.reset();camera.fov=CONFIG.baseFov;camera.updateProjectionMatrix();gyro.calibrate();if(soundOn)audio.start();
  if(useSensors){try{await hand.init();showMessage('手を映して基準登録',1300);}catch{hand.enabled=false;ui.handPreview.classList.remove('active');showMessage('カメラなしで開始',1300);}}
  else{hand.enabled=false;drawPower=.82;showMessage('マウスで狙ってクリック！',1100);}
}

ui.startBtn.addEventListener('click',async()=>{try{if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){const p=await DeviceOrientationEvent.requestPermission();if(p!=='granted')throw new Error();}await startGame(true);}catch{showMessage('センサー許可が必要です',1400);}});
ui.mouseBtn.addEventListener('click',()=>startGame(false));
ui.calibrateBtn.addEventListener('click',e=>{e.stopPropagation();gyro.calibrate();});
ui.handCalibrateBtn.addEventListener('click',e=>{e.stopPropagation();hand.registerBaseline();});
ui.soundBtn.addEventListener('click',e=>{e.stopPropagation();soundOn=!soundOn;ui.soundBtn.textContent=soundOn?'♪':'×';if(soundOn&&running)audio.start();else audio.stop();});
ui.restartBtn.addEventListener('click',e=>{e.stopPropagation();resetRound();});
canvas.addEventListener('pointerdown',e=>{if(running){e.preventDefault();fire();}});
window.addEventListener('mousemove',e=>{if(!running||!mouseMode)return;gyro.targetYaw=clamp((e.clientX/innerWidth-.5)*1.15,-1.05,1.05);gyro.targetPitch=clamp((.5-e.clientY/innerHeight)*.68,-.62,.62);},{passive:true});

function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(ui.handVideo.videoWidth)hand.resizeOverlay();}
window.addEventListener('resize',resize,{passive:true});resize();

const clock=new THREE.Clock();
function animate(now=performance.now()){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.033);
  gyro.update(dt);
  hand.updateTracking(now);
  updateDraw(dt);
  const strain=clamp((fullDrawHold-1.5)/2.5,0,1),tremorYaw=(Math.sin(now*.021)+Math.sin(now*.037)*.55)*.0065*strain,tremorPitch=(Math.sin(now*.026+1.2)+Math.sin(now*.043)*.45)*.0055*strain;
  if(!cinematic){camera.position.copy(HOME);releaseKick=Math.max(0,releaseKick-dt*7);const kick=-Math.sin((1-releaseKick)*Math.PI)*.018*releaseKick;aimEuler.set(gyro.pitch+tremorPitch+kick,gyro.yaw+tremorYaw,0,'YXZ');camera.quaternion.setFromEuler(aimEuler);bow.position.x=-.72+Math.sin(now*.0015)*.006+Math.sin(now*.048)*.008*strain;bow.position.y=-.55+Math.sin(now*.041)*.005*strain;}
  updateArrows(cinematic?.phase==='impact'?dt*.18:dt);updateCinematic(dt);updateWind(now);renderer.render(scene,camera);
}
setWind();updateHud();animate();