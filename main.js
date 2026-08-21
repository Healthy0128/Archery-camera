import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm';

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa8dcff);
scene.fog = new THREE.Fog(0xa8dcff, 42, 95);

const BASE_FOV=58, FULL_DRAW_FOV=36;
const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 150);
camera.position.set(0, 1.65, 4.5);
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xffffff, 0x4c6c38, 2.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(-8, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left=-20; sun.shadow.camera.right=20; sun.shadow.camera.top=20; sun.shadow.camera.bottom=-20;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(130, 130),
  new THREE.MeshStandardMaterial({ color:0x72ad52, roughness:1 })
);
ground.rotation.x = -Math.PI/2;
ground.receiveShadow = true;
scene.add(ground);

const lane = new THREE.Mesh(
  new THREE.PlaneGeometry(7, 42),
  new THREE.MeshStandardMaterial({ color:0xcaa873, roughness:1 })
);
lane.rotation.x = -Math.PI/2;
lane.position.set(0,.012,-17);
lane.receiveShadow = true;
scene.add(lane);

const trunkMat = new THREE.MeshStandardMaterial({color:0x765035, roughness:1});
const leafMat = new THREE.MeshStandardMaterial({color:0x3b8647, roughness:1});
function addTree(x,z,s=1){
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.18*s,.25*s,1.9*s,8),trunkMat);
  trunk.position.set(x,.95*s,z); trunk.castShadow=true; scene.add(trunk);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(1.1*s,2.8*s,9),leafMat);
  crown.position.set(x,2.7*s,z); crown.castShadow=true; scene.add(crown);
}
for(let z=-4; z>-66; z-=6){ addTree(-6.4-(Math.random()*2),z,.8+Math.random()*.35); addTree(6.4+(Math.random()*2),z,.8+Math.random()*.35); }

for(let i=0;i<8;i++){
  const cloud = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.85});
  for(let j=0;j<4;j++){
    const p=new THREE.Mesh(new THREE.SphereGeometry(.8+Math.random()*.6,12,8),mat);
    p.position.set(j*.8,Math.random()*.4,Math.random()*.3); cloud.add(p);
  }
  cloud.position.set(-22+Math.random()*44,9+Math.random()*8,-28-Math.random()*45); scene.add(cloud);
}

// Wind-readable scenery: a flag and grass tufts respond to the same wind used by arrow physics.
const windVisual = new THREE.Group();
windVisual.position.set(-3.35, 0, -12);
scene.add(windVisual);
const pole = new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,3.25,10), new THREE.MeshStandardMaterial({color:0xd6d9d8,metalness:.35,roughness:.5}));
pole.position.y=1.62; pole.castShadow=true; windVisual.add(pole);
const flagGeo = new THREE.PlaneGeometry(1.45,.72,8,2);
flagGeo.translate(.72,0,0);
const flagBase = Float32Array.from(flagGeo.attributes.position.array);
const flag = new THREE.Mesh(flagGeo,new THREE.MeshStandardMaterial({color:0xf4f0dc,side:THREE.DoubleSide,roughness:.9}));
flag.position.set(0,2.62,0); windVisual.add(flag);
const grassTufts=[];
const grassMat=new THREE.MeshStandardMaterial({color:0x4d8d3e,side:THREE.DoubleSide,roughness:1});
for(let i=0;i<28;i++){
  const blade=new THREE.Mesh(new THREE.PlaneGeometry(.10,.55),grassMat);
  const side=i%2?-1:1;
  blade.position.set(side*(2.4+Math.random()*3.3),.27,-4-Math.random()*20);
  blade.rotation.y=Math.random()*Math.PI;
  blade.userData.phase=Math.random()*Math.PI*2;
  scene.add(blade); grassTufts.push(blade);
}
function updateWindVisual(now){
  const strength=THREE.MathUtils.clamp(wind/2,-1,1);
  const arr=flagGeo.attributes.position.array;
  for(let i=0;i<arr.length;i+=3){
    const x0=flagBase[i], y0=flagBase[i+1];
    const t=THREE.MathUtils.clamp(x0/1.45,0,1);
    arr[i]=x0;
    arr[i+1]=y0 + Math.sin(now*.006+t*5.5)*.055*t*Math.abs(strength);
    arr[i+2]=strength*.24*t + Math.sin(now*.008+t*4)*.035*t;
  }
  flagGeo.attributes.position.needsUpdate=true;
  flag.rotation.y=-strength*.38;
  for(const g of grassTufts){
    g.rotation.z = -strength*.20 + Math.sin(now*.004+g.userData.phase)*.035;
  }
}

const TARGET_Z = -25;
const targetGroup = new THREE.Group();
targetGroup.position.set(0,2.2,TARGET_Z);
scene.add(targetGroup);

const rings = [
  [1.65,0xf5f2df],[1.35,0x20242a],[1.08,0x2785c6],[.80,0xd73c38],[.52,0xf0c52c],[.20,0xf6d13e]
];
rings.forEach(([r,c], idx)=>{
  const disk=new THREE.Mesh(new THREE.CylinderGeometry(r,r,.12,64),new THREE.MeshStandardMaterial({color:c,roughness:.75}));
  disk.rotation.x=Math.PI/2; disk.position.z=idx*.011; disk.castShadow=true; targetGroup.add(disk);
});
const standMat = new THREE.MeshStandardMaterial({color:0x7d5738,roughness:1});
for(const x of [-.75,.75]){
  const leg=new THREE.Mesh(new THREE.BoxGeometry(.18,2.4,.18),standMat); leg.position.set(x,-1.55,.2); leg.rotation.z=x<0?-.12:.12; leg.castShadow=true; targetGroup.add(leg);
}
const bar=new THREE.Mesh(new THREE.BoxGeometry(2.25,.18,.18),standMat); bar.position.set(0,-.58,.22); targetGroup.add(bar);

// First-person bow. The center of the string moves backward as draw power increases.
const bow = new THREE.Group();
const bowMat = new THREE.MeshStandardMaterial({color:0x8a4f27,roughness:.5,metalness:.05});
const stringMat = new THREE.LineBasicMaterial({color:0xe9e0ca});
function limb(y, rot){
  const m=new THREE.Mesh(new THREE.BoxGeometry(.08,1.15,.07),bowMat); m.position.set(0,y,0); m.rotation.z=rot; m.castShadow=true; return m;
}
const upperLimb=limb(.58,-.18), lowerLimb=limb(-.58,.18);
bow.add(upperLimb,lowerLimb);
const grip=new THREE.Mesh(new THREE.BoxGeometry(.14,.38,.13),new THREE.MeshStandardMaterial({color:0x3f2a1f,roughness:.9})); bow.add(grip);
const stringPositions = new Float32Array([-0.10,1.14,0, 0.18,0,0, -0.10,-1.14,0]);
const strGeo=new THREE.BufferGeometry();
strGeo.setAttribute('position',new THREE.BufferAttribute(stringPositions,3));
const bowString=new THREE.Line(strGeo,stringMat); bow.add(bowString);
bow.position.set(-.72,-.55,-1.75); bow.rotation.z=.08; bow.scale.setScalar(.72); camera.add(bow);

let running=false, gyroMode=false, orientationSeen=false, handMode=false;
let baseAlpha=0, baseBeta=0, baseGamma=0, raw={alpha:0,beta:0,gamma:0};
let aimYaw=0, aimPitch=0, targetYaw=0, targetPitch=0;
let score=0, arrowsLeft=10, wind=0;
let combo=0, bestCombo=0;
let shotScores=[];
let fullDrawHold=0, releaseKick=0;
let shotCinematic=null;
const HOME_CAMERA_POS = new THREE.Vector3(0, 1.65, 4.5);
const activeArrows=[];
const stuckArrows=[];
const forward = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const euler = new THREE.Euler(0,0,0,'YXZ');

// Hand tracking state
let handLandmarker=null, handStream=null, handReady=false, lastHandVideoTime=-1, lastHandInference=0;
let handDetected=false, handBaseline=null, drawPower=0, drawPowerTarget=0;
let lastHandSample=null;
const handVideo=document.querySelector('#handVideo');
const handOverlay=document.querySelector('#handOverlay');
const handCtx=handOverlay.getContext('2d');

const ui={
 score:document.querySelector('#score'), arrows:document.querySelector('#arrows'), wind:document.querySelector('#wind'),
 powerText:document.querySelector('#powerText'), powerFill:document.querySelector('#powerFill'),
 msg:document.querySelector('#message'), panel:document.querySelector('#startPanel'), start:document.querySelector('#startBtn'),
 mouse:document.querySelector('#mouseBtn'), calibrate:document.querySelector('#calibrateBtn'), handCalibrate:document.querySelector('#handCalibrateBtn'),
 sound:document.querySelector('#soundBtn'), handPreview:document.querySelector('#handPreview'), handStatus:document.querySelector('#handStatus'),
 reticle:document.querySelector('#reticle'), app:document.querySelector('#app'),
 combo:document.querySelector('#combo'), comboCard:document.querySelector('#comboCard'), bullseye:document.querySelector('#bullseyeFx'),
 result:document.querySelector('#resultPanel'), resultScore:document.querySelector('#resultScore'), resultAvg:document.querySelector('#resultAvg'), resultBest:document.querySelector('#resultBest'), resultTens:document.querySelector('#resultTens'), resultCombo:document.querySelector('#resultCombo'), restart:document.querySelector('#restartBtn')
};
const audioEngine = (()=>{
  let ctx=null, master=null, bgmTimer=null, bgmStep=0;
  const notes=[261.63,329.63,392.00,523.25,392.00,329.63,293.66,369.99,440.00,587.33,440.00,369.99];
  function ensure(){
    if(!ctx){ ctx=new (window.AudioContext||window.webkitAudioContext)(); master=ctx.createGain(); master.gain.value=.45; master.connect(ctx.destination); }
    if(ctx.state==='suspended') ctx.resume().catch(()=>{});
    return ctx;
  }
  function tone(freq,dur=.16,vol=.12,type='sine',when=0){
    if(!soundOn) return;
    const c=ensure(), o=c.createOscillator(), g=c.createGain();
    o.type=type; o.frequency.value=freq; g.gain.setValueAtTime(vol,c.currentTime+when); g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+when+dur);
    o.connect(g); g.connect(master); o.start(c.currentTime+when); o.stop(c.currentTime+when+dur+.02);
  }
  function noise(dur=.12,vol=.08){
    if(!soundOn) return;
    const c=ensure(), n=Math.max(1,Math.floor(c.sampleRate*dur)), b=c.createBuffer(1,n,c.sampleRate), a=b.getChannelData(0);
    for(let i=0;i<n;i++) a[i]=(Math.random()*2-1)*(1-i/n);
    const src=c.createBufferSource(), g=c.createGain(); src.buffer=b; g.gain.value=vol; src.connect(g); g.connect(master); src.start();
  }
  function shoot(){ tone(155,.22,.24,'triangle'); tone(235,.16,.11,'sine',.01); noise(.08,.08); }
  function hit(){ tone(88,.16,.20,'sine'); noise(.09,.11); }
  function score(){ tone(880,.24,.10,'sine'); tone(1320,.30,.07,'sine',.05); }
  function creak(){ tone(105,.12,.045,'sawtooth'); }
  function startBgm(){
    if(bgmTimer||!soundOn) return; ensure();
    const tick=()=>{ if(soundOn&&running){ const f=notes[bgmStep++%notes.length]; tone(f,.28,.035,'triangle'); if(bgmStep%4===1) tone(f/2,.45,.018,'sine'); } };
    tick(); bgmTimer=setInterval(tick,500);
  }
  function stopBgm(){ if(bgmTimer){ clearInterval(bgmTimer); bgmTimer=null; } }
  return {ensure,shoot,hit,score,creak,startBgm,stopBgm};
})();
let soundOn=true;

function setWind(){ wind=(Math.random()*4-2); ui.wind.textContent=`${Math.abs(wind).toFixed(1)} m/s ${wind>=0?'→':'←'}`; }
setWind();
function calibrate(){ baseAlpha=raw.alpha||0; baseBeta=raw.beta||0; baseGamma=raw.gamma||0; targetYaw=aimYaw=0; targetPitch=aimPitch=0; fullDrawHold=0; showMessage('照準リセット',500); }

function angleDiff(a,b){ return (a-b+540)%360-180; }
window.addEventListener('deviceorientation',(ev)=>{
  if(ev.alpha==null) return;
  raw={alpha:ev.alpha||0,beta:ev.beta||0,gamma:ev.gamma||0};
  if(!orientationSeen){ orientationSeen=true; baseAlpha=raw.alpha; baseBeta=raw.beta; baseGamma=raw.gamma; }
  if(!running || !gyroMode) return;
  const yawDeg=angleDiff(raw.alpha,baseAlpha);
  const pitchDeg=raw.beta-baseBeta;
  const rollDeg=raw.gamma-baseGamma;
  targetYaw=THREE.MathUtils.clamp(-THREE.MathUtils.degToRad(yawDeg)*.92 + THREE.MathUtils.degToRad(rollDeg)*.12,-1.15,1.15);
  targetPitch=THREE.MathUtils.clamp(THREE.MathUtils.degToRad(pitchDeg)*.78,-.72,.72);
},{passive:true});

async function createHandLandmarker(){
  if(handLandmarker) return handLandmarker;
  ui.handStatus.textContent='手認識を読み込み中…';
  const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
  const options={
    baseOptions:{
      modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate:'GPU'
    },
    runningMode:'VIDEO', numHands:1,
    minHandDetectionConfidence:.55, minHandPresenceConfidence:.5, minTrackingConfidence:.5
  };
  try{
    handLandmarker=await HandLandmarker.createFromOptions(vision,options);
  }catch(err){
    options.baseOptions.delegate='CPU';
    handLandmarker=await HandLandmarker.createFromOptions(vision,options);
  }
  handReady=true;
  return handLandmarker;
}

async function startHandTracking(){
  if(!navigator.mediaDevices?.getUserMedia) throw new Error('camera unavailable');
  ui.handPreview.classList.add('active');
  handStream=await navigator.mediaDevices.getUserMedia({
    video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}}, audio:false
  });
  handVideo.srcObject=handStream;
  await handVideo.play();
  await createHandLandmarker();
  resizeHandOverlay();
  ui.handStatus.textContent='手をカメラに見せてください';
}

function resizeHandOverlay(){
  const w=handVideo.videoWidth||320, h=handVideo.videoHeight||240;
  handOverlay.width=w; handOverlay.height=h;
}

function palmScale(lm){
  const dist=(a,b)=>Math.hypot(lm[a].x-lm[b].x,lm[a].y-lm[b].y);
  return (dist(0,9)+dist(5,17)+dist(0,5)+dist(0,17))/4;
}
function palmCenter(lm){
  const ids=[0,5,9,13,17];
  let x=0,y=0; for(const i of ids){x+=lm[i].x;y+=lm[i].y;}
  return {x:x/ids.length,y:y/ids.length};
}

function registerHandBaseline(){
  if(!lastHandSample){ showMessage('手が見えていません',900); return false; }
  handBaseline={...lastHandSample};
  drawPowerTarget=drawPower=0;
  ui.handStatus.textContent='基準登録OK。手を外側へ引こう';
  showMessage('手の基準を登録',700);
  return true;
}

function computeDrawPower(sample){
  if(!handBaseline) return 0;
  const baseOut=Math.abs(handBaseline.x-.5);
  const nowOut=Math.abs(sample.x-.5);
  const outward=Math.max(0,nowOut-baseOut);
  const moveScore=THREE.MathUtils.clamp(outward/.25,0,1);
  const ratio=handBaseline.scale/Math.max(sample.scale,.0001);
  const sizeScore=THREE.MathUtils.clamp((ratio-1)/.42,0,1);
  const verticalPenalty=THREE.MathUtils.clamp(Math.abs(sample.y-handBaseline.y)/.28,0,.35);
  return THREE.MathUtils.clamp(moveScore*.76 + sizeScore*.24 - verticalPenalty*.18,0,1);
}

function drawHandPreview(lm){
  const w=handOverlay.width,h=handOverlay.height;
  handCtx.clearRect(0,0,w,h);
  if(!lm) return;
  const links=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  handCtx.lineWidth=4; handCtx.strokeStyle='rgba(255,255,255,.95)';
  handCtx.beginPath();
  for(const [a,b] of links){ handCtx.moveTo((1-lm[a].x)*w,lm[a].y*h); handCtx.lineTo((1-lm[b].x)*w,lm[b].y*h); }
  handCtx.stroke();
  handCtx.fillStyle='rgba(255,210,45,.95)';
  for(const p of lm){ handCtx.beginPath(); handCtx.arc((1-p.x)*w,p.y*h,4,0,Math.PI*2); handCtx.fill(); }
}

function updateHandTracking(now){
  if(!handMode || !handReady || handVideo.readyState<2 || !handLandmarker) return;
  if(now-lastHandInference<50) return;
  if(handVideo.currentTime===lastHandVideoTime) return;
  lastHandInference=now; lastHandVideoTime=handVideo.currentTime;
  let result;
  try{ result=handLandmarker.detectForVideo(handVideo,now); }
  catch(err){ ui.handStatus.textContent='手認識エラー'; return; }
  const lm=result.landmarks?.[0];
  handDetected=!!lm;
  if(!lm){
    lastHandSample=null; drawPowerTarget=0; drawHandPreview(null);
    ui.handStatus.textContent='手をカメラに見せてください';
    return;
  }
  const c=palmCenter(lm), s=palmScale(lm);
  lastHandSample={x:c.x,y:c.y,scale:s};
  if(!handBaseline){
    ui.handStatus.textContent='構え位置で「手の基準」を押す';
    drawPowerTarget=0;
  }else{
    drawPowerTarget=computeDrawPower(lastHandSample);
    ui.handStatus.textContent=drawPowerTarget>.82?'フルドロー！':drawPowerTarget>.35?'そのまま引いて…':'手を外側へ引こう';
  }
  drawHandPreview(lm);
}

async function startGame(useGyro){
  gyroMode=useGyro; handMode=useGyro; running=true; ui.panel.classList.add('hidden');
  score=0; arrowsLeft=10; combo=0; bestCombo=0; shotScores=[]; ui.score.textContent='0'; ui.arrows.textContent='10'; ui.comboCard?.classList.remove('active'); ui.result?.classList.remove('show'); setWind();
  drawPower=drawPowerTarget=0; handBaseline=null;
  camera.fov=BASE_FOV; camera.updateProjectionMatrix();
  calibrate();
  if(soundOn) audioEngine.startBgm();
  if(useGyro){
    try{
      await startHandTracking();
      showMessage('手を映して基準登録',1300);
    }catch(err){
      handMode=false; ui.handPreview.classList.remove('active');
      showMessage('カメラなしで開始',1300);
    }
  }else{
    handMode=false; drawPower=drawPowerTarget=.82;
    ui.handPreview.classList.remove('active');
    showMessage('マウスで狙ってクリック！',1100);
  }
}

ui.start.addEventListener('click',async()=>{
  try{
    if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
      const p=await DeviceOrientationEvent.requestPermission();
      if(p!=='granted') throw new Error('orientation permission denied');
    }
    await startGame(true);
  }catch(e){ showMessage('センサー許可が必要です',1400); }
});
ui.mouse.addEventListener('click',()=>startGame(false));
ui.calibrate.addEventListener('click',(e)=>{e.stopPropagation(); calibrate();});
ui.handCalibrate.addEventListener('click',(e)=>{e.stopPropagation(); registerHandBaseline();});
ui.sound.addEventListener('click',(e)=>{e.stopPropagation(); soundOn=!soundOn; ui.sound.textContent=soundOn?'♪':'×'; if(soundOn&&running) audioEngine.startBgm(); else audioEngine.stopBgm();});

function showMessage(text,ms=800){ ui.msg.textContent=text; ui.msg.classList.add('show'); clearTimeout(showMessage.t); showMessage.t=setTimeout(()=>ui.msg.classList.remove('show'),ms); }

function triggerBullseye(){
  if(!ui.bullseye) return;
  ui.bullseye.classList.remove('fire');
  void ui.bullseye.offsetWidth;
  ui.bullseye.classList.add('fire');
  if(navigator.vibrate) navigator.vibrate([25,25,45]);
}
function updateCombo(pts){
  if(pts>=8){ combo++; bestCombo=Math.max(bestCombo,combo); }
  else combo=0;
  if(ui.comboCard){
    ui.combo.textContent=`×${Math.max(combo,1)}`;
    ui.comboCard.classList.toggle('active',combo>=2);
  }
}
function showResults(){
  if(!ui.result) return;
  const best=shotScores.length?Math.max(...shotScores):0;
  const tens=shotScores.filter(v=>v===10).length;
  const avg=shotScores.length?score/shotScores.length:0;
  ui.resultScore.textContent=score;
  ui.resultAvg.textContent=avg.toFixed(1);
  ui.resultBest.textContent=best;
  ui.resultTens.textContent=tens;
  ui.resultCombo.textContent=bestCombo;
  ui.result.classList.add('show');
}
function resetRound(){
  for(const a of activeArrows) scene.remove(a.mesh);
  activeArrows.length=0;
  for(const a of stuckArrows) scene.remove(a);
  stuckArrows.length=0;
  score=0; arrowsLeft=10; combo=0; bestCombo=0; shotScores=[];
  ui.score.textContent='0'; ui.arrows.textContent='10';
  ui.comboCard?.classList.remove('active');
  ui.result?.classList.remove('show');
  drawPower=drawPowerTarget=0; fullDrawHold=0; shotCinematic=null; bow.visible=true;
  setWind(); calibrate();
  showMessage('NEW ROUND',700);
}
ui.restart?.addEventListener('click',(e)=>{ e.stopPropagation(); resetRound(); });

function makeArrow(){
  const g=new THREE.Group();
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,1.25,10),new THREE.MeshStandardMaterial({color:0xe6d2a2,roughness:.7}));
  shaft.rotation.x=Math.PI/2; shaft.position.z=-.06; g.add(shaft);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(.055,.18,10),new THREE.MeshStandardMaterial({color:0x777b7d,metalness:.5,roughness:.4}));
  tip.rotation.x=-Math.PI/2; tip.position.z=-.78; g.add(tip);
  const featherMat=new THREE.MeshStandardMaterial({color:0xe34c43,side:THREE.DoubleSide});
  const f1=new THREE.Mesh(new THREE.BoxGeometry(.025,.16,.22),featherMat); f1.position.z=.52; g.add(f1);
  const f2=f1.clone(); f2.rotation.z=Math.PI/2; g.add(f2);
  g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  return g;
}

function fire(){
  if(!running || arrowsLeft<=0 || shotCinematic) return;
  if(handMode && !handBaseline){ showMessage('先に手の基準を登録',850); return; }
  if(handMode && !handDetected){ showMessage('手が見えていません',700); return; }
  const power=handMode?Math.max(.10,drawPower):.82;
  arrowsLeft--; ui.arrows.textContent=arrowsLeft; audioEngine.shoot();
  const arrow=makeArrow();
  camera.getWorldPosition(arrow.position);
  arrow.position.add(new THREE.Vector3(0,-.08,-.35).applyQuaternion(camera.quaternion));
  camera.getWorldDirection(forward);
  const speed=15 + power*23;
  const velocity=forward.clone().multiplyScalar(speed);
  scene.add(arrow);
  const shot={mesh:arrow,velocity,life:0,scored:false};
  activeArrows.push(shot);
  releaseKick=1;
  fullDrawHold=0;
  if(navigator.vibrate) navigator.vibrate(18);
  shotCinematic={arrow:shot, phase:'launch', elapsed:0, hitMesh:null};
  if(handMode){
    handBaseline=lastHandSample?{...lastHandSample}:handBaseline;
    drawPowerTarget=drawPower=0;
  }
}

canvas.addEventListener('pointerdown',(e)=>{ if(running){e.preventDefault(); fire();} });
window.addEventListener('mousemove',(e)=>{
  if(!running || gyroMode) return;
  targetYaw=THREE.MathUtils.clamp((e.clientX/innerWidth-.5)*1.5,-1.1,1.1);
  targetPitch=THREE.MathUtils.clamp((.5-e.clientY/innerHeight)*.9,-.65,.65);
},{passive:true});

function scoreHit(x,y){
  const r=Math.hypot(x,y);
  if(r<=.20) return 10;
  if(r<=.52) return 9;
  if(r<=.80) return 8;
  if(r<=1.08) return 6;
  if(r<=1.35) return 4;
  if(r<=1.65) return 2;
  return 0;
}

function orientArrow(mesh,vel){
  const dir=vel.clone().normalize();
  tmpQuat.setFromUnitVectors(new THREE.Vector3(0,0,-1),dir);
  mesh.quaternion.copy(tmpQuat);
}

const clock=new THREE.Clock();
function updateArrows(dt){
  for(let i=activeArrows.length-1;i>=0;i--){
    const a=activeArrows[i]; a.life+=dt;
    const prevZ=a.mesh.position.z;
    a.velocity.y-=9.81*dt;
    a.velocity.x += wind*.11*dt;
    a.mesh.position.addScaledVector(a.velocity,dt);
    orientArrow(a.mesh,a.velocity);
    if(!a.scored && prevZ>TARGET_Z+.12 && a.mesh.position.z<=TARGET_Z+.12){
      a.scored=true;
      const localX=a.mesh.position.x-targetGroup.position.x;
      const localY=a.mesh.position.y-targetGroup.position.y;
      const pts=scoreHit(localX,localY);
      if(Math.hypot(localX,localY)<=1.68){
        audioEngine.hit();
        if(pts>=8) audioEngine.score();
        score+=pts; shotScores.push(pts); ui.score.textContent=score; updateCombo(pts);
        if(pts===10){ triggerBullseye(); showMessage('10  BULLSEYE!',1000); }
        else if(pts>=8) showMessage(`${pts} POINT!  ${combo>=2?`COMBO ×${combo}`:''}`,900);
        else showMessage(pts?`${pts} POINT!`:'MISS',850);
        a.velocity.set(0,0,0); a.mesh.position.z=TARGET_Z+.20; stuckArrows.push(a.mesh); activeArrows.splice(i,1);
        if(shotCinematic?.arrow===a){ shotCinematic.phase='impact'; shotCinematic.elapsed=0; shotCinematic.hitMesh=a.mesh; shotCinematic.points=pts; }
        continue;
      }
      shotScores.push(0); updateCombo(0); showMessage('MISS',650);
    }
    if(a.mesh.position.y<0 || a.life>5){
      if(!a.scored){ a.scored=true; shotScores.push(0); updateCombo(0); showMessage('MISS',650); }
      scene.remove(a.mesh); activeArrows.splice(i,1);
      if(shotCinematic?.arrow===a){ shotCinematic.phase='return'; shotCinematic.elapsed=0; }
    }
  }
  while(stuckArrows.length>18){ scene.remove(stuckArrows.shift()); }
}

function updateDrawVisual(dt){
  const smoothing=1-Math.exp(-10*dt);
  drawPower += (drawPowerTarget-drawPower)*smoothing;
  const pct=Math.round(drawPower*100);
  ui.powerText.textContent=`${pct}%`;
  ui.powerFill.style.width=`${pct}%`;

  if(drawPower>.86 && !shotCinematic){
    fullDrawHold += dt;
    if(fullDrawHold>1.25 && soundOn && Math.floor(fullDrawHold*3)!==Math.floor((fullDrawHold-dt)*3)) audioEngine.creak();
  }else{
    fullDrawHold=Math.max(0,fullDrawHold-dt*3);
  }

  const zoomT=THREE.MathUtils.smoothstep(drawPower,.28,1);
  const targetFov=THREE.MathUtils.lerp(BASE_FOV,FULL_DRAW_FOV,zoomT);
  if(!shotCinematic){
    camera.fov += (targetFov-camera.fov)*.10;
    camera.updateProjectionMatrix();
  }
  if(ui.reticle){
    const reticleScale=THREE.MathUtils.lerp(1,.62,zoomT);
    ui.reticle.style.setProperty('--draw-scale',reticleScale.toFixed(3));
    ui.reticle.classList.toggle('full-draw',drawPower>.86);
    ui.reticle.classList.toggle('overheld',fullDrawHold>1.5);
  }
  if(ui.app){
    ui.app.style.setProperty('--draw-focus',zoomT.toFixed(3));
    ui.app.style.setProperty('--strain',THREE.MathUtils.clamp((fullDrawHold-1.5)/2.5,0,1).toFixed(3));
  }

  const pos=strGeo.attributes.position.array;
  pos[3]=.18 + drawPower*.20;
  pos[5]=drawPower*.34;
  strGeo.attributes.position.needsUpdate=true;
  upperLimb.rotation.z=-.18-drawPower*.055;
  lowerLimb.rotation.z=.18+drawPower*.055;
}

function updateCinematic(dt){
  if(!shotCinematic) return false;
  const c=shotCinematic;
  c.elapsed += dt;
  bow.visible=false;
  ui.reticle?.classList.add('cinematic');

  if(c.phase==='launch' && c.elapsed>.20){ c.phase='follow'; c.elapsed=0; }

  if(c.phase==='launch'){
    camera.position.copy(HOME_CAMERA_POS);
    euler.set(aimPitch + Math.sin(c.elapsed*35)*.006, aimYaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(euler);
    return true;
  }

  if(c.phase==='follow' && c.arrow?.mesh?.parent){
    const dir=c.arrow.velocity.clone().normalize();
    const desired=c.arrow.mesh.position.clone().addScaledVector(dir,-2.2).add(new THREE.Vector3(0,.42,0));
    camera.position.lerp(desired,1-Math.exp(-12*dt));
    const look=c.arrow.mesh.position.clone().addScaledVector(dir,5.5);
    camera.lookAt(look);
    camera.fov += (48-camera.fov)*(1-Math.exp(-8*dt));
    camera.updateProjectionMatrix();
    return true;
  }

  if(c.phase==='impact'){
    const mesh=c.hitMesh;
    if(mesh){
      const desired=mesh.position.clone().add(new THREE.Vector3(.55,.35,2.1));
      camera.position.lerp(desired,1-Math.exp(-10*dt));
      camera.lookAt(mesh.position);
      camera.fov += (34-camera.fov)*(1-Math.exp(-10*dt));
      camera.updateProjectionMatrix();
    }
    if(c.elapsed>(c.points===10?.58:.34)){ c.phase='return'; c.elapsed=0; }
    return true;
  }

  if(c.phase==='return'){
    camera.position.lerp(HOME_CAMERA_POS,1-Math.exp(-10*dt));
    euler.set(aimPitch,aimYaw,0,'YXZ');
    const targetQ=new THREE.Quaternion().setFromEuler(euler);
    camera.quaternion.slerp(targetQ,1-Math.exp(-10*dt));
    camera.fov += (BASE_FOV-camera.fov)*(1-Math.exp(-8*dt));
    camera.updateProjectionMatrix();
    if(c.elapsed>.45 || camera.position.distanceTo(HOME_CAMERA_POS)<.03){
      camera.position.copy(HOME_CAMERA_POS);
      camera.quaternion.copy(targetQ);
      bow.visible=true;
      ui.reticle?.classList.remove('cinematic');
      shotCinematic=null;
      if(arrowsLeft===0 && shotScores.length>=10) setTimeout(showResults,260);
    }
    return true;
  }
  return true;
}

function resize(){
  const w=innerWidth,h=innerHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
  if(handVideo.videoWidth) resizeHandOverlay();
}
window.addEventListener('resize',resize,{passive:true});
resize();

const clock=new THREE.Clock();
function animate(now=performance.now()){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.033);
  aimYaw += (targetYaw-aimYaw)*(1-Math.exp(-9*dt));
  aimPitch += (targetPitch-aimPitch)*(1-Math.exp(-9*dt));

  updateHandTracking(now);
  updateDrawVisual(dt);

  const strain=THREE.MathUtils.clamp((fullDrawHold-1.5)/2.5,0,1);
  const tremorYaw=(Math.sin(now*.021)+Math.sin(now*.037)*.55)*.0065*strain;
  const tremorPitch=(Math.sin(now*.026+1.2)+Math.sin(now*.043)*.45)*.0055*strain;

  if(!shotCinematic){
    camera.position.copy(HOME_CAMERA_POS);
    releaseKick=Math.max(0,releaseKick-dt*7);
    const kickPitch=-Math.sin((1-releaseKick)*Math.PI)*.018*releaseKick;
    euler.set(aimPitch+tremorPitch+kickPitch,aimYaw+tremorYaw,0,'YXZ');
    camera.quaternion.setFromEuler(euler);
    bow.position.x=-.72 + Math.sin(now*.0015)*.006 + Math.sin(now*.048)*.008*strain;
    bow.position.y=-.55 + Math.sin(now*.041)*.005*strain;
  }

  const physicsDt=shotCinematic?.phase==='impact' ? dt*.18 : dt;
  updateArrows(physicsDt);
  updateCinematic(dt);
  updateWindVisual(now);
  renderer.render(scene,camera);
}
animate();
