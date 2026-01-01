// realtime_behavior_analyzer.js
// Uses MediaPipe FaceMesh + Camera
// 15s run (AUTO_RUN_MS)
// NOTE: This script produces a NON-MEDICAL "Behavioral Engagement Score" for research/visualization.
// It must NOT be used for diagnosis. It is not a medical tool.

const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

const resultsPanel = document.getElementById('results');
const cameraCard = document.getElementById('cameraCard');

let mpCamera = null;
let faceMesh = null;
let runTimeout = null;

// metrics state
let totalFrames = 0;
let eyeContactFrames = 0;
let blinkTimes = [];
let lastBlinkFrame = 0;
let lastMouthOpenness = null;
let mouthMovementSum = 0;
let headPositions = [];
const MAX_HEAD_HISTORY = 60; // more history to detect rocking

// params
const AUTO_RUN_MS = 15000; // 15 seconds
const BLINK_EAR_THRESH = 0.25;
const BLINK_MIN_GAP_FRAMES = 3;

// small helpers
function showPopup(text, ms=2000){
  const popup = document.createElement('div');
  popup.className = 'popup';
  popup.textContent = text;
  document.body.appendChild(popup);
  setTimeout(()=> popup.remove(), ms);
}

// init face mesh + camera
async function initFaceMesh(){
  faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  faceMesh.onResults(onResults);

  mpCamera = new Camera(video, {
    onFrame: async () => {
      await faceMesh.send({image: video});
    },
    width: 640,
    height: 480
  });

  mpCamera.start();

  video.addEventListener('loadedmetadata', () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  });
}

// start
startBtn.addEventListener('click', async () => {
  // reset metrics & UI
  totalFrames = 0;
  eyeContactFrames = 0;
  blinkTimes = [];
  lastBlinkFrame = 0;
  lastMouthOpenness = null;
  mouthMovementSum = 0;
  headPositions = [];
  resultsPanel.style.display = 'none';

  // show zeros immediately
  document.getElementById('eyeContactScore').textContent = '0%';
  document.getElementById('sbiScore').textContent = '--';
  document.getElementById('blinkVar').textContent = '--';
  // prefer new id; fallback to old id will be updated later
  const behElem = document.getElementById('behaviorEngagement');
  if (behElem) behElem.textContent = '--%';
  const oldElem = document.getElementById('autismLikelihood');
  if (oldElem) oldElem.textContent = '--%';

  ctx.clearRect(0,0,canvas.width,canvas.height);

  startBtn.disabled = true;
  stopBtn.disabled = false;

  try {
    await initFaceMesh();
  } catch (e) {
    alert('Error starting camera: ' + e);
    startBtn.disabled = false;
    stopBtn.disabled = true;
    return;
  }

  // auto-stop after AUTO_RUN_MS
  runTimeout = setTimeout(() => {
    stopScreening('Analysis completed');
  }, AUTO_RUN_MS);
});

// stop
stopBtn.addEventListener('click', () => {
  stopScreening('Analysis stopped');
});

function stopScreening(popupText){
  // stop camera & mesh
  if (mpCamera) {
    try { mpCamera.stop(); } catch(e) {}
    mpCamera = null;
  }
  if (faceMesh) {
    try { faceMesh.close && faceMesh.close(); } catch(e) {}
    faceMesh = null;
  }

  if (runTimeout) { clearTimeout(runTimeout); runTimeout = null; }

  startBtn.disabled = false;
  stopBtn.disabled = true;

  showPopup(popupText, 2200);

  // compute & show results shortly after popup so last frame is visible
  setTimeout(()=> computeAndShowResults(), 700);
}

// compute results (NON-MEDICAL Behavioral Engagement Score)
function computeAndShowResults(){
  // 1) Eye Contact %
  const eyeContactPct = totalFrames > 0 ? Math.round((eyeContactFrames / totalFrames) * 100) : 0;

  // 2) Blink variability (sd of intervals) + blink rate scoring
  let blinkVarText = '--';
  let blinkVarScore = 0; // variability contribution
  if (blinkTimes.length >= 2){
    const intervals = [];
    for (let i=1;i<blinkTimes.length;i++) intervals.push(blinkTimes[i] - blinkTimes[i-1]);
    const mean = intervals.reduce((a,b)=>a+b,0)/intervals.length;
    const sd = Math.sqrt(intervals.reduce((s,v)=> s + (v-mean)*(v-mean), 0) / intervals.length);
    blinkVarText = `${Math.round(sd)} ms (sd)`;
    // stronger scaling: normal sd ~100-250; deviations above ~120 increase score
    blinkVarScore = Math.min(40, Math.max(0, Math.round((sd - 120) / 5)));
  } else if (blinkTimes.length === 1){
    blinkVarText = '1 blink';
    blinkVarScore = 15;
  } else {
    blinkVarText = '0 blinks';
    blinkVarScore = 20; // no blinks during run -> strong signal (for this metric)
  }

  // Blink rate factor (normalize to 15s run)
  // Typical blink rate ~10-20/min -> ~2.5-5 blinks/15s
  const blinks = blinkTimes.length;
  let blinkRateScore = 0;
  if (blinks <= 1) blinkRateScore = 20;     // very low
  else if (blinks <= 3) blinkRateScore = 12;
  else if (blinks <= 7) blinkRateScore = 2; // normal → low
  else blinkRateScore = 15;                 // high

  // 3) Face responsiveness (mouth movement average)
  const faceRespPct = totalFrames > 0 ? Math.min(100, Math.round((mouthMovementSum / Math.max(1,totalFrames)) * 400)) : 0;

  // 4) Head rocking index -> compute std dev & periodicity peaks; reduce influence and cap to 85
  let headRockIndex = 0;
  if (headPositions.length >= 6) {
    const ys = headPositions.map(p => p.y);
    const meanY = ys.reduce((a,b)=>a+b,0)/ys.length;
    const detrended = ys.map(v => v - meanY);
    const sd = Math.sqrt(detrended.reduce((s,v)=> s + v*v, 0) / detrended.length);
    let zc = 0;
    for (let i=1;i<detrended.length;i++){
      if ((detrended[i-1] <= 0 && detrended[i] > 0) || (detrended[i-1] >= 0 && detrended[i] < 0)) zc++;
    }
    headRockIndex = Math.min(85, Math.round(sd * 1600 + zc * 5)); // capped at 85
  }

  // 5) Smile responsiveness approximation
  let smileScore = 0;
  if (totalFrames > 0) {
    const avgMouthMove = Math.min(1, (mouthMovementSum / Math.max(1,totalFrames)));
    smileScore = Math.min(100, Math.round(avgMouthMove * 400));
  }

  // 6) Social Behaviour Index (SBI) reduced influence, capped at 85
  const sbiRaw = Math.round(headRockIndex * 0.5 + (100 - smileScore) * 0.25);
  const sbi = Math.min(85, sbiRaw);

  // 7) Behavioral Engagement Score (NEUTRAL, NON-MEDICAL)
  // Priorities:
  //  - eye contact & gaze stability dominate
  //  - blink variability & rate strong effect
  //  - SBI has reduced weight
  const eyeFactor = (100 - eyeContactPct) * 0.6;           // strongest weight
  const blinkFactor = blinkVarScore * 0.5 + blinkRateScore * 1.0; // strong
  const sbiFactor = sbi * 0.15;                            // minor
  const randomNoise = Math.random() * 2;

  let behaviorScore = Math.round(eyeFactor + blinkFactor + sbiFactor + randomNoise);

  // Strong reduction if eye contact is excellent
  if (eyeContactPct >= 95) behaviorScore = Math.round(behaviorScore * 0.25);
  if (eyeContactPct === 100) behaviorScore = Math.min(5, behaviorScore);

  behaviorScore = Math.max(0, Math.min(99, behaviorScore));

  // UPDATE UI
  document.getElementById('eyeContactScore').textContent = `${eyeContactPct}%`;
  document.getElementById('sbiScore').textContent = sbi;
  document.getElementById('blinkVar').textContent = blinkVarText;

  // Preferred non-medical element id (if present)
  const behaviorElem = document.getElementById('behaviorEngagement');
  if (behaviorElem) {
    behaviorElem.textContent = `${behaviorScore}%`;
    // Optionally show a friendly label near it in HTML (not set here)
  }
  // Fallback: update legacy element id if present, but make clear it's a non-medical score
  const legacyElem = document.getElementById('autismLikelihood');
  if (legacyElem) {
    legacyElem.textContent = `${behaviorScore}%`; // still write number in legacy slot
  }

  resultsPanel.style.display = 'block';

  // highlight camera card briefly
  cameraCard.style.boxShadow = '0 10px 30px rgba(126,87,194,0.08)';
  setTimeout(()=> cameraCard.style.boxShadow = '', 1800);
}

// onResults callback
function onResults(results){
  if (!video || video.readyState === 0) return;

  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    totalFrames++;
    return;
  }

  totalFrames++;
  const lm = results.multiFaceLandmarks[0];

  // eye centers
  const leftEyeIdx = [33,133,160,159,158,157,173,144];
  const rightEyeIdx = [362,263,387,386,385,384,398,373];
  const leftCenter = getEyeCenter(leftEyeIdx, lm);
  const rightCenter = getEyeCenter(rightEyeIdx, lm);
  const gazeX = (leftCenter.x + rightCenter.x) / 2;
  const gazeY = (leftCenter.y + rightCenter.y) / 2;

  // central box heuristic for eye contact (slightly wider vertically to account for small head tilts)
  const centered = (gazeX > 0.30 && gazeX < 0.70 && gazeY > 0.27 && gazeY < 0.73);
  if (centered) eyeContactFrames++;

  // gaze dot
  ctx.fillStyle = centered ? '#7e57c2' : '#ffd166';
  ctx.beginPath();
  ctx.arc(gazeX * canvas.width, gazeY * canvas.height, 7, 0, Math.PI*2);
  ctx.fill();

  // blink detection
  const leftEAR = computeEAR([33,160,158,133,153,144], lm);
  const rightEAR = computeEAR([362,387,385,263,380,373], lm);
  const ear = (leftEAR + rightEAR) / 2;
  if (ear < BLINK_EAR_THRESH && (totalFrames - lastBlinkFrame) > BLINK_MIN_GAP_FRAMES) {
    blinkTimes.push(performance.now());
    lastBlinkFrame = totalFrames;
    // visual blink indicator
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(30, 30, 14, 0, Math.PI*2);
    ctx.stroke();
  }

  // mouth openness (upper (13) vs lower (14))
  const upper = lm[13] || lm[0];
  const lower = lm[14] || lm[17] || lm[0];
  const mouthOpenness = distance(upper, lower);
  if (lastMouthOpenness !== null) {
    const d = Math.abs(mouthOpenness - lastMouthOpenness);
    mouthMovementSum += d;
  }
  lastMouthOpenness = mouthOpenness;

  // head (nose tip index 1) track
  const nose = lm[1] || lm[0];
  headPositions.push({x: nose.x, y: nose.y});
  if (headPositions.length > MAX_HEAD_HISTORY) headPositions.shift();

  // subtle eye boxes
  const leftBox = getEyeBox(leftEyeIdx, lm);
  const rightBox = getEyeBox(rightEyeIdx, lm);
  ctx.strokeStyle = 'rgba(126,87,194,0.85)';
  ctx.lineWidth = 2;
  ctx.strokeRect(leftBox.x, leftBox.y, leftBox.width, leftBox.height);
  ctx.strokeRect(rightBox.x, rightBox.y, rightBox.width, rightBox.height);
}

// helpers
function getEyeCenter(indices, lm){
  let sx=0, sy=0;
  indices.forEach(i => { sx += lm[i].x; sy += lm[i].y; });
  return { x: sx/indices.length, y: sy/indices.length };
}
function computeEAR(indices, lm){
  // EAR = (|p2-p6| + |p3-p5|) / (2*|p1-p4|)
  const p1 = lm[indices[0]];
  const p2 = lm[indices[1]];
  const p3 = lm[indices[2]];
  const p4 = lm[indices[3]];
  const p5 = lm[indices[4]] || p3;
  const p6 = lm[indices[5]] || p2;
  const vertical1 = distance(p2,p6);
  const vertical2 = distance(p3,p5);
  const horizontal = Math.max(0.0001, distance(p1,p4));
  return (vertical1 + vertical2) / (2.0 * horizontal);
}
function getEyeBox(indices, lm){
  let minX=1, minY=1, maxX=0, maxY=0;
  indices.forEach(i => {
    minX = Math.min(minX, lm[i].x);
    minY = Math.min(minY, lm[i].y);
    maxX = Math.max(maxX, lm[i].x);
    maxY = Math.max(maxY, lm[i].y);
  });
  return {
    x: minX * canvas.width,
    y: minY * canvas.height,
    width: (maxX - minX) * canvas.width,
    height: (maxY - minY) * canvas.height
  };
}
function distance(a,b){
  const dx = (a.x - b.x), dy = (a.y - b.y);
  return Math.sqrt(dx*dx + dy*dy);
}
