import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm';
import { CONFIG, profileForDistance, resolveQuality } from './game-config.js';
import { GyroInput, HandInput } from './inputs.js';
import { Match } from './match.js';
import { TutorialController } from './tutorial.js';

const $=s=>document.querySelector(s);
const clamp=THREE.MathUtils.clamp;
const lerp=THREE.MathUtils.lerp;
const canvas=$('#game');

const ui={
  score:$('#score'), arrows:$('#arrows'), wind:$('#wind'), powerText:$('#powerText'), powerFill:$('#powerFill'),
  player:$('#playerHud'), distance:$('#distanceHud'),
  message:$('#message'), startPanel:$('#startPanel'), startBtn:$('#startBtn'), mouseBtn:$('#mouseBtn'),
  playerCount:$('#playerCount'), distanceSelect:$('#distanceSelect'), qualitySelect:$('#qualitySelect'),
  calibrateBtn:$('#calibrateBtn'), handCalibrateBtn:$('#handCalibrateBtn'), soundBtn:$('#soundBtn'),
  handPreview:$('#handPreview'), handStatus:$('#handStatus'), handVideo:$('#handVideo'), handOverlay:$('#handOverlay'),
  reticle:$('#reticle'), app:$('#app'), combo:$('#combo'), comboCard:$('#comboCard'), bullseye:$('#bullseyeFx'),
  result:$('#resultPanel'), resultList:$('#resultList'), restartBtn:$('#restartBtn'),
  turnPanel:$('#turnPanel'), turnTitle:$('#turnTitle'), turnMeta:$('#turnMeta'), turnReadyBtn:$('#turnReadyBtn'),
  turnHandSetup:$('#turnHandSetup'), tutorialEnabled:$('#tutorialEnabled'),
  handCoach:$('#handCoach'), handStateLabel:$('#handStateLabel'), handReason:$('#handReason'),menuBtn:$('#menuBtn')
};

let practiceMode=false,turnTimer=null,starting=false;
let selectedTurnPhoneHand=null;
const match=new Match(CONFIG.shotsPerPlayer);
const gyro=new GyroInput(THREE,CONFIG.gyro,()=>({drawPower,fullDrawHold}));
const hand=new HandInput(CONFIG.hand,{
  preview:ui.handPreview,status:ui.handStatus,video:ui.handVideo,overlay:ui.handOverlay
},{
  onRelease:power=>{if(running&&!turnLocked&&!cinematic)fire(power);},
  onState:(state,message)=>updateHandCoach(state,message)
});
let drawPower=0,running=false,mouseMode=false,soundOn=true,wind=0,fullDrawHold=0,releaseKick=0,cinematic=null,turnLocked=true;
let targetZ=-20.5;
let quality=resolveQuality(ui.qualitySelect.value);

function showMessage(text,ms=800){
  ui.message.textContent=text;
  ui.message.classList.add('show');
  clearTimeout(showMessage.timer);
  showMessage.timer=setTimeout(()=>ui.message.classList.remove('show'),ms);
}

function updateHandCoach(state,message){
  const labels={
    loading:'準備中',missing:'未認識',error:'認識エラー',unregistered:'基準未登録',
    'calibration-ready':'手認識OK',registered:'基準登録済み',pinched:'弦をつかんだ',
    'draw-low':'引き不足',ready:'発射可能',released:'リリース検出'
  };
  ui.handCoach.dataset.state=state;
  ui.handStateLabel.textContent=labels[state]||'手認識';
  ui.handReason.textContent=message;
  ui.handCoach.classList.toggle('active',hand.enabled);
  tutorial?.onHandState(state);
}

function applyPhoneHand(side){
  const phoneHand=side==='left'?'left':'right';
  ui.app.classList.toggle('hold-left',phoneHand==='left');
  ui.app.classList.toggle('hold-right',phoneHand==='right');
}

function selectedMenuPhoneHand(){
  return document.querySelector('input[name="phoneHand"]:checked')?.value||'right';
}

for(const option of document.querySelectorAll('input[name="phoneHand"]')){
  option.addEventListener('change',()=>{if(option.checked)applyPhoneHand(option.value);});
}
applyPhoneHand(selectedMenuPhoneHand());

const tutorial=new TutorialController({
  panel:$('#tutorialPanel'),title:$('#tutorialTitle'),text:$('#tutorialText'),
  hint:$('#tutorialHint'),next:$('#tutorialNext'),skip:$('#tutorialSkip')
},{onFinish:()=>endTutorial()});

const renderer=new THREE.WebGLRenderer({canvas,antialias:quality.key==='high',powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,quality.pixelRatioCap));renderer.shadowMap.enabled=quality.shadows;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;

const scene=new THREE.Scene();scene.background=new THREE.Color(0xa8dcff);scene.fog=new THREE.Fog(0xa8dcff,42,95);
const camera=new THREE.PerspectiveCamera(CONFIG.baseFov,1,.1,150);const HOME=new THREE.Vector3(0,1.65,4.5);camera.position.copy(HOME);scene.add(camera);
scene.add(new THREE.HemisphereLight(0xffffff,0x4c6c38,2.2));const sun=new THREE.DirectionalLight(0xffffff,2.4);sun.position.set(-8,14,8);sun.castShadow=true;scene.add(sun);

const ground=new THREE.Mesh(new THREE.PlaneGeometry(130,130),new THREE.MeshStandardMaterial({color:0x72ad52,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const lane=new THREE.Mesh(new THREE.PlaneGeometry(7,48),new THREE.MeshStandardMaterial({color:0xcaa873,roughness:1}));lane.rotation.x=-Math.PI/2;lane.position.set(0,.012,-19.5);lane.receiveShadow=true;scene.add(lane);
const trunkMat=new THREE.MeshStandardMaterial({color:0x765035,roughness:1}),leafMat=new THREE.MeshStandardMaterial({color:0x3b8647,roughness:1});
const treeObjects=[];
function addTree(x,z,s=.9){const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.18*s,.25*s,1.9*s,8),trunkMat);trunk.position.set(x,.95*s,z);scene.add(trunk);const crown=new THREE.Mesh(new THREE.ConeGeometry(1.1*s,2.8*s,9),leafMat);crown.position.set(x,2.7*s,z);scene.add(crown);treeObjects.push([trunk,crown]);}
for(let z=-4;z>-66;z-=quality.treeSpacing){addTree(-7,z);addTree(7,z);}

function applyQuality(nextQuality){
  quality=nextQuality;
  renderer.setPixelRatio(Math.min(devicePixelRatio,quality.pixelRatioCap));
  renderer.shadowMap.enabled=quality.shadows;
  sun.castShadow=quality.shadows;
  const stride=Math.max(1,Math.round(quality.treeSpacing/6));
  treeObjects.forEach((pair,index)=>pair.forEach(mesh=>{mesh.visible=index%stride===0;}));
  ui.app.dataset.quality=quality.key;
  hand.setQuality(quality);
}

applyQuality(quality);

const target=new THREE.Group();target.position.set(0,2.2,targetZ);scene.add(target);
[[1.65,0xf5f2df],[1.35,0x20242a],[1.08,0x2785c6],[.80,0xd73c38],[.52,0xf0c52c],[.20,0xf6d13e]].forEach(([r,c],i)=>{const disk=new THREE.Mesh(new THREE.CylinderGeometry(r,r,.12,64),new THREE.MeshStandardMaterial({color:c,roughness:.75}));disk.rotation.x=Math.PI/2;disk.position.z=i*.011;target.add(disk);});
const standMat=new THREE.MeshStandardMaterial({color:0x7d5738,roughness:1});for(const x of[-.75,.75]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.18,2.4,.18),standMat);leg.position.set(x,-1.55,.2);leg.rotation.z=x<0?-.12:.12;target.add(leg);}

const flagGroup=new THREE.Group();scene.add(flagGroup);const pole=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,3.25,10),new THREE.MeshStandardMaterial({color:0xd6d9d8}));pole.position.y=1.62;flagGroup.add(pole);
const flagGeo=new THREE.PlaneGeometry(1.45,.72,8,2);flagGeo.translate(.72,0,0);const flagBase=Float32Array.from(flagGeo.attributes.position.array);
const flag=new THREE.Mesh(flagGeo,new THREE.MeshStandardMaterial({color:0xf4f0dc,side:THREE.DoubleSide}));flag.position.y=2.62;flagGroup.add(flag);

const bow=new THREE.Group(),bowMat=new THREE.MeshStandardMaterial({color:0x8a4f27,roughness:.5});
function limb(y,r){const m=new THREE.Mesh(new THREE.BoxGeometry(.08,1.15,.07),bowMat);m.position.y=y;m.rotation.z=r;return m;}
const upper=limb(.58,-.18),lower=limb(-.58,.18);bow.add(upper,lower);const grip=new THREE.Mesh(new THREE.BoxGeometry(.14,.38,.13),new THREE.MeshStandardMaterial({color:0x3f2a1f}));bow.add(grip);
const stringPos=new Float32Array([-.1,1.14,0,.18,0,0,-.1,-1.14,0]),stringGeo=new THREE.BufferGeometry();stringGeo.setAttribute('position',new THREE.BufferAttribute(stringPos,3));bow.add(new THREE.Line(stringGeo,new THREE.LineBasicMaterial({color:0xe9e0ca})));
bow.position.set(-.72,-.55,-1.75);bow.rotation.z=.08;bow.scale.setScalar(.72);camera.add(bow);

const audio=(()=>{
  let ctx=null,master=null,bgm=null,step=0;const notes=[261.63,329.63,392,523.25,392,329.63,293.66,369.99,440,587.33,440,369.99];
  function ensure(){if(!ctx){ctx=new(window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=.45;master.connect(ctx.destination);}if(ctx.state==='suspended')ctx.resume().catch(()=>{});return ctx;}
  function tone(f,d=.16,v=.1,type='sine',delay=0){if(!soundOn)return;const c=ensure(),o=c.createOscillator(),g=c.createGain();o.frequency.value=f;o.type=type;g.gain.setValueAtTime(v,c.currentTime+delay);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+delay+d);o.connect(g);g.connect(master);o.start(c.currentTime+delay);o.stop(c.currentTime+delay+d+.02);}
  return{shoot(){tone(155,.22,.22,'triangle');tone(235,.15,.1,'sine',.01);},hit(){tone(88,.16,.18);},score(){tone(880,.23,.09);tone(1320,.28,.06,'sine',.05);},creak(){tone(105,.11,.035,'sawtooth');},start(){if(bgm||!soundOn)return;ensure();bgm=setInterval(()=>{if(running)tone(notes[step++%notes.length],.28,.028,'triangle');},500);},stop(){if(bgm){clearInterval(bgm);bgm=null;}}};
})();

function applyDistance(distance){
  targetZ=HOME.z-distance;
  target.position.z=targetZ;
  flagGroup.position.set(-3.35,0,HOME.z-distance*.48);
  scene.fog.far=Math.max(55,distance+35);
}
function windLimit(){
  return profileForDistance(match.distance||25).windLimit;
}
function setWind(){
  const lim=windLimit();wind=(Math.random()*2-1)*lim;
  ui.wind.textContent=`${Math.abs(wind).toFixed(1)} m/s ${wind>=0?'→':'←'}`;
}
function updateHud(){
  const p=match.current;if(!p)return;
  ui.score.textContent=p.score;ui.arrows.textContent=match.shotsRemaining(p);ui.combo.textContent=`×${Math.max(p.combo,1)}`;
  ui.comboCard.classList.toggle('active',p.combo>=2);ui.player.textContent=`${p.name}/${match.players.length}`;ui.distance.textContent=`${match.distance}m`;
}
function triggerBullseye(){ui.bullseye.classList.remove('fire');void ui.bullseye.offsetWidth;ui.bullseye.classList.add('fire');if(navigator.vibrate)navigator.vibrate([25,25,45]);}

function showTurnPanel(first=false){
  clearTimeout(turnTimer);turnTimer=null;
  turnLocked=true;running=false;hand.resetForTurn();gyro.calibrate();
  const p=match.current,calibration=p.calibration;
  hand.loadCalibration(calibration);
  ui.handCalibrateBtn.textContent=calibration.isHandRegistered?'手の基準を再登録':'手の基準を登録';
  selectedTurnPhoneHand=null;
  ui.turnHandSetup.hidden=calibration.phoneHandConfigured;
  ui.turnReadyBtn.disabled=!calibration.phoneHandConfigured;
  for(const button of ui.turnHandSetup.querySelectorAll('[data-phone-hand]'))button.classList.remove('selected');
  if(calibration.phoneHandConfigured)applyPhoneHand(calibration.phoneHand);
  ui.turnTitle.textContent=`${p.name} の番`;
  ui.turnMeta.textContent=hand.enabled&&!calibration.isHandRegistered
    ?`${match.distance}m ・ 初回は手の基準を登録します`
    :`${match.distance}m ・ ${match.shotsRemaining(p)}射残り ・ 設定を復元済み`;
  ui.turnReadyBtn.textContent=first?'ゲーム開始':'準備OK';
  ui.turnPanel.classList.add('show');
}
function beginTurn(){
  const calibration=match.current.calibration;
  if(!calibration.phoneHandConfigured){
    if(!selectedTurnPhoneHand){showMessage('スマホを持つ手を選んでください',1200);return;}
    calibration.setPhoneHand(selectedTurnPhoneHand);
  }
  applyPhoneHand(calibration.phoneHand);
  hand.loadCalibration(calibration);
  ui.turnPanel.classList.remove('show');turnLocked=false;running=true;setWind();gyro.calibrate();hand.resetForTurn();updateHud();
  if(hand.enabled&&!calibration.isHandRegistered){
    ui.handCalibrateBtn.textContent='手の基準を登録';
    showMessage(`${match.current.name}の手の基準を登録：自然な位置で手を映してください`,2800);
  }else showMessage(`${match.current.name}  ${match.distance}m`,700);
}
function finishShot(points){
  if(practiceMode){showMessage(points?`試射 ${points} POINT`:'試射 MISS',850);return;}
  match.record(points);updateHud();
  if(points===10){triggerBullseye();showMessage('10  BULLSEYE!',1000);}
  else if(points>=8)showMessage(`${points} POINT!${match.current.combo>=2?`  COMBO ×${match.current.combo}`:''}`,900);
  else showMessage(points?`${points} POINT!`:'MISS',850);
}
function afterCinematic(){
  if(practiceMode){tutorial.onPracticeComplete();return;}
  if(match.isComplete()){showResults();return;}
  match.advance();clearTimeout(turnTimer);turnTimer=setTimeout(()=>showTurnPanel(false),180);
}

function makeArrow(){
  const g=new THREE.Group();const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,1.25,10),new THREE.MeshStandardMaterial({color:0xe6d2a2}));shaft.rotation.x=Math.PI/2;shaft.position.z=-.06;g.add(shaft);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(.055,.18,10),new THREE.MeshStandardMaterial({color:0x777b7d,metalness:.5}));tip.rotation.x=-Math.PI/2;tip.position.z=-.78;g.add(tip);return g;
}
const arrows=[],stuck=[],forward=new THREE.Vector3(),tmpQuat=new THREE.Quaternion(),aimEuler=new THREE.Euler(0,0,0,'YXZ');
function orientArrow(mesh,vel){tmpQuat.setFromUnitVectors(new THREE.Vector3(0,0,-1),vel.clone().normalize());mesh.quaternion.copy(tmpQuat);}
function pointsFor(x,y){const r=Math.hypot(x,y);return r<=.2?10:r<=.52?9:r<=.8?8:r<=1.08?6:r<=1.35?4:r<=1.65?2:0;}

function fire(powerOverride=null){
  if(!running||turnLocked||cinematic)return;
  if(hand.enabled&&!match.current.calibration.isHandRegistered){showMessage('基準を登録してください',1300);return;}
  if(hand.enabled&&!hand.detected){showMessage('手をカメラに戻してください',900);return;}
  if(practiceMode&&tutorial.step!=='release'){showMessage('チュートリアルの手順に沿って操作してください',1100);return;}
  const power=hand.enabled?Math.max(.1,powerOverride??drawPower):.82;turnLocked=true;audio.shoot();
  const mesh=makeArrow();camera.getWorldPosition(mesh.position);mesh.position.add(new THREE.Vector3(0,-.08,-.35).applyQuaternion(camera.quaternion));camera.getWorldDirection(forward);
  const physics=profileForDistance(match.distance),speed=lerp(physics.minArrowSpeed,physics.maxArrowSpeed,power),velocity=forward.clone().multiplyScalar(speed);scene.add(mesh);
  const shot={mesh,velocity,life:0,scored:false};arrows.push(shot);releaseKick=1;fullDrawHold=0;cinematic={shot,phase:'launch',time:0,points:null};
  if(practiceMode)tutorial.onPracticeFired();
  if(navigator.vibrate)navigator.vibrate(18);if(hand.enabled)hand.resetForTurn();
}

function updateArrows(dt){
  const physics=profileForDistance(match.distance);
  for(let i=arrows.length-1;i>=0;i--){
    const a=arrows[i];a.life+=dt;const prevZ=a.mesh.position.z;
    a.velocity.y-=physics.gravity*dt;a.velocity.x+=wind*physics.windAcceleration*dt;a.mesh.position.addScaledVector(a.velocity,dt);orientArrow(a.mesh,a.velocity);
    if(!a.scored&&prevZ>targetZ+.12&&a.mesh.position.z<=targetZ+.12){
      a.scored=true;const x=a.mesh.position.x-target.position.x,y=a.mesh.position.y-target.position.y,pts=pointsFor(x,y);
      if(Math.hypot(x,y)<=1.68){
        audio.hit();if(pts>=8)audio.score();finishShot(pts);a.velocity.set(0,0,0);a.mesh.position.z=targetZ+.20;stuck.push(a.mesh);arrows.splice(i,1);
        if(cinematic?.shot===a){cinematic.phase='impact';cinematic.time=0;cinematic.points=pts;cinematic.hitMesh=a.mesh;}continue;
      }
      finishShot(0);if(cinematic?.shot===a){cinematic.phase='return';cinematic.time=0;}continue;
    }
    if(a.mesh.position.y<0||a.life>5){
      if(!a.scored){a.scored=true;finishShot(0);}scene.remove(a.mesh);arrows.splice(i,1);if(cinematic?.shot===a){cinematic.phase='return';cinematic.time=0;}
    }
  }
  while(stuck.length>24)scene.remove(stuck.shift());
}

function updateWind(now){
  const limit=Math.max(windLimit(),.8),strength=clamp(wind/limit,-1,1),arr=flagGeo.attributes.position.array;
  for(let i=0;i<arr.length;i+=3){const x0=flagBase[i],y0=flagBase[i+1],t=clamp(x0/1.45,0,1);arr[i]=x0;arr[i+1]=y0+Math.sin(now*.006+t*5.5)*.065*t*Math.abs(strength);arr[i+2]=Math.abs(strength)*.28*t+Math.sin(now*.008+t*4)*.04*t;}
  flagGeo.attributes.position.needsUpdate=true;flag.scale.x=wind>=0?1:-1;flag.rotation.y=-Math.abs(strength)*.42;
}

function updateDraw(dt){
  hand.updatePower(dt);drawPower=hand.enabled?hand.power:.82;const pct=Math.round(drawPower*100);ui.powerText.textContent=`${pct}%`;ui.powerFill.style.width=`${pct}%`;
  if(drawPower>.86&&!cinematic&&running){fullDrawHold+=dt;if(fullDrawHold>1.25&&Math.floor(fullDrawHold*3)!==Math.floor((fullDrawHold-dt)*3))audio.creak();}else fullDrawHold=Math.max(0,fullDrawHold-dt*3);
  const zoom=THREE.MathUtils.smoothstep(drawPower,.28,1),targetFov=lerp(CONFIG.baseFov,CONFIG.fullDrawFov,zoom);
  if(!cinematic){camera.fov+=(targetFov-camera.fov)*(1-Math.exp(-8*dt));camera.updateProjectionMatrix();}
  ui.reticle.style.setProperty('--draw-scale',lerp(1,.62,zoom).toFixed(3));ui.reticle.classList.toggle('full-draw',drawPower>.86);ui.reticle.classList.toggle('overheld',fullDrawHold>1.5);
  ui.app.style.setProperty('--draw-focus',zoom.toFixed(3));ui.app.style.setProperty('--strain',clamp((fullDrawHold-1.5)/2.5,0,1).toFixed(3));
  const p=stringGeo.attributes.position.array;p[3]=.18+drawPower*.20;p[5]=drawPower*.34;stringGeo.attributes.position.needsUpdate=true;upper.rotation.z=-.18-drawPower*.055;lower.rotation.z=.18+drawPower*.055;
}

function updateCinematic(dt){
  if(!cinematic)return;cinematic.time+=dt;bow.visible=false;ui.reticle.classList.add('cinematic');
  if(cinematic.phase==='launch'&&cinematic.time>.2){cinematic.phase='follow';cinematic.time=0;}
  if(cinematic.phase==='follow'&&cinematic.shot?.mesh?.parent){
    const d=cinematic.shot.velocity.clone().normalize(),desired=cinematic.shot.mesh.position.clone().addScaledVector(d,-2.2).add(new THREE.Vector3(0,.42,0));
    camera.position.lerp(desired,1-Math.exp(-12*dt));camera.lookAt(cinematic.shot.mesh.position.clone().addScaledVector(d,5.5));camera.fov+=(48-camera.fov)*(1-Math.exp(-8*dt));camera.updateProjectionMatrix();return;
  }
  if(cinematic.phase==='impact'){
    if(cinematic.hitMesh){const desired=cinematic.hitMesh.position.clone().add(new THREE.Vector3(.55,.35,2.1));camera.position.lerp(desired,1-Math.exp(-10*dt));camera.lookAt(cinematic.hitMesh.position);camera.fov+=(34-camera.fov)*(1-Math.exp(-10*dt));camera.updateProjectionMatrix();}
    if(cinematic.time>(cinematic.points===10?.58:.34)){cinematic.phase='return';cinematic.time=0;}return;
  }
  if(cinematic.phase==='return'){
    camera.position.lerp(HOME,1-Math.exp(-10*dt));aimEuler.set(gyro.pitch,gyro.yaw,0,'YXZ');const q=new THREE.Quaternion().setFromEuler(aimEuler);camera.quaternion.slerp(q,1-Math.exp(-10*dt));
    camera.fov+=(CONFIG.baseFov-camera.fov)*(1-Math.exp(-8*dt));camera.updateProjectionMatrix();
    if(cinematic.time>.45||camera.position.distanceTo(HOME)<.03){camera.position.copy(HOME);camera.quaternion.copy(q);bow.visible=true;ui.reticle.classList.remove('cinematic');cinematic=null;afterCinematic();}
  }
}

function showResults(){
  clearTimeout(turnTimer);turnTimer=null;running=false;turnLocked=true;audio.stop();
  const ranking=match.ranking();
  ui.resultList.innerHTML=ranking.map((p,i)=>`<div class="rank-row"><span class="rank-pos">${i+1}</span><strong>${p.name}</strong><b>${p.score}</b><small>${p.shots.join(' / ')}</small></div>`).join('');
  ui.result.classList.add('show');
}
function clearArrows(){
  for(const a of arrows)scene.remove(a.mesh);arrows.length=0;for(const a of stuck)scene.remove(a);stuck.length=0;
}
function resetMatch(){
  clearTimeout(turnTimer);turnTimer=null;clearTimeout(showMessage.timer);practiceMode=false;
  clearArrows();match.configure(Number(ui.playerCount.value),Number(ui.distanceSelect.value),selectedMenuPhoneHand());applyDistance(match.distance);
  fullDrawHold=0;drawPower=0;cinematic=null;bow.visible=true;hand.resetMatch();ui.result.classList.remove('show');updateHud();showTurnPanel(true);
}

function startTutorial(){
  practiceMode=true;turnLocked=false;running=true;
  applyPhoneHand(match.current.calibration.phoneHand);
  hand.loadCalibration(match.current.calibration);
  setWind();gyro.calibrate();updateHud();tutorial.start();
}

function endTutorial(){
  practiceMode=false;running=false;turnLocked=true;cinematic=null;bow.visible=true;
  clearArrows();camera.position.copy(HOME);camera.fov=CONFIG.baseFov;camera.updateProjectionMatrix();
  hand.resetForTurn();showTurnPanel(true);
}

async function startGame(useSensors){
  mouseMode=!useSensors;gyro.enabled=useSensors;hand.enabled=useSensors;ui.startPanel.classList.add('hidden');ui.menuBtn.hidden=false;
  clearTimeout(turnTimer);turnTimer=null;practiceMode=false;
  match.configure(Number(ui.playerCount.value),Number(ui.distanceSelect.value),selectedMenuPhoneHand());applyDistance(match.distance);clearArrows();updateHud();hand.resetMatch();camera.fov=CONFIG.baseFov;camera.updateProjectionMatrix();
  if(soundOn)audio.start();
  hand.setQuality(quality);
  if(useSensors){try{await hand.init(FilesetResolver,HandLandmarker,quality);}catch{hand.enabled=false;ui.handPreview.classList.remove('active');ui.handCoach.classList.remove('active');showMessage('カメラなしで開始',1300);}}
  else{hand.enabled=false;drawPower=.82;}
  if(hand.enabled&&ui.tutorialEnabled.checked)startTutorial();else showTurnPanel(true);
}

ui.startBtn.addEventListener('click',async()=>{
  if(starting)return;starting=true;ui.startBtn.disabled=true;ui.mouseBtn.disabled=true;
  try{
    if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){
      const p=await DeviceOrientationEvent.requestPermission();if(p!=='granted')throw new Error();
    }
    await startGame(true);
  }catch{showMessage('センサー許可が必要です',1400);}
  finally{starting=false;if(!ui.startPanel.classList.contains('hidden')){ui.startBtn.disabled=false;ui.mouseBtn.disabled=false;}}
});
ui.mouseBtn.addEventListener('click',async()=>{
  if(starting)return;starting=true;ui.startBtn.disabled=true;ui.mouseBtn.disabled=true;
  try{await startGame(false);}finally{starting=false;}
});
ui.qualitySelect.addEventListener('change',()=>applyQuality(resolveQuality(ui.qualitySelect.value)));
ui.turnReadyBtn.addEventListener('click',e=>{e.stopPropagation();beginTurn();});
for(const button of ui.turnHandSetup.querySelectorAll('[data-phone-hand]')){
  button.addEventListener('click',e=>{
    e.stopPropagation();selectedTurnPhoneHand=button.dataset.phoneHand;
    for(const peer of ui.turnHandSetup.querySelectorAll('[data-phone-hand]'))peer.classList.toggle('selected',peer===button);
    ui.turnReadyBtn.disabled=false;applyPhoneHand(selectedTurnPhoneHand);
  });
}
ui.calibrateBtn.addEventListener('click',e=>{e.stopPropagation();gyro.calibrate();showMessage('照準リセット',500);tutorial.onAimCalibrated();});
ui.handCalibrateBtn.addEventListener('click',e=>{
  e.stopPropagation();
  if(!running||turnLocked){showMessage('プレイヤーの準備後に登録してください',1000);return;}
  const result=hand.registerBaseline();
  if(!result.ok){showMessage(result.reason,1200);return;}
  match.current.calibration.registerHand(result.sample,result.auxiliary);
  hand.loadCalibration(match.current.calibration);
  ui.handCalibrateBtn.textContent='手の基準を再登録';
  showMessage('登録完了。🤏でつまんで奥へ引いてください',1800);
  tutorial.onHandRegistered();
});
ui.soundBtn.addEventListener('click',e=>{e.stopPropagation();soundOn=!soundOn;ui.soundBtn.textContent=soundOn?'♪':'×';if(soundOn&&running)audio.start();else audio.stop();});
ui.restartBtn.addEventListener('click',e=>{e.stopPropagation();resetMatch();if(soundOn)audio.start();});
ui.menuBtn.addEventListener('pointerdown',e=>e.stopPropagation());
ui.menuBtn.addEventListener('click',e=>{
  e.preventDefault();e.stopPropagation();
  if(window.confirm('対戦を終了してメニューに戻りますか？'))window.location.reload();
});
canvas.addEventListener('pointerdown',e=>{if(running){e.preventDefault();fire();}});
window.addEventListener('mousemove',e=>{if(!running||!mouseMode)return;gyro.targetYaw=clamp((e.clientX/innerWidth-.5)*1.15,-1.05,1.05);gyro.targetPitch=clamp((.5-e.clientY/innerHeight)*.68,-.62,.62);},{passive:true});

function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(ui.handVideo.videoWidth)hand.resizeOverlay();}
window.addEventListener('resize',resize,{passive:true});resize();

const clock=new THREE.Clock();
function animate(now=performance.now()){
  requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.033);gyro.update(dt);hand.updateTracking(now);updateDraw(dt);
  const strain=clamp((fullDrawHold-1.5)/2.5,0,1);
  if(!cinematic){camera.position.copy(HOME);releaseKick=Math.max(0,releaseKick-dt*7);const kick=-Math.sin((1-releaseKick)*Math.PI)*.018*releaseKick;aimEuler.set(gyro.pitch+kick,gyro.yaw,0,'YXZ');camera.quaternion.setFromEuler(aimEuler);bow.position.x=-.72+Math.sin(now*.0015)*.006+Math.sin(now*.048)*.004*strain;bow.position.y=-.55+Math.sin(now*.041)*.0025*strain;}
  updateArrows(cinematic?.phase==='impact'?dt*.18:dt);updateCinematic(dt);updateWind(now);renderer.render(scene,camera);
}
match.configure(1,25);applyDistance(25);updateHud();setWind();animate();
