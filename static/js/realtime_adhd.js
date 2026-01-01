// realtime_adhd.js
const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

let stream = null;
let autoStopTimeout = null;

// ---------------------
// ADHD Metrics
// ---------------------
let blinkCount = 0;
let framesSinceLastBlink = 0;
let attentionAwayFrames = 0;
let totalFrames = 0;
let headPositions = [];
const MAX_HEAD_HISTORY = 30;
let blinkFlashDuration = 3;
let blinkFlashCounter = 0;

// ---------------------
// MediaPipe Face Mesh
// ---------------------
let faceMesh = null;
let mpCamera = null;

async function initFaceMesh() {
  faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  faceMesh.onResults(onFaceMeshResults);

  mpCamera = new Camera(video, {
    onFrame: async () => {
      await faceMesh.send({ image: video });
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

// ---------------------
// Start webcam
// ---------------------
startBtn.addEventListener('click', async () => {
  // ---------------------
  // Reset metrics at start
  // ---------------------
  blinkCount = 0;
  framesSinceLastBlink = 0;
  attentionAwayFrames = 0;
  totalFrames = 0;
  headPositions = [];
  blinkFlashCounter = 0;

  // Reset displayed metrics to 0
  document.getElementById('blinkPattern').textContent = '0';
  document.getElementById('attentionScore').textContent = '0';
  document.getElementById('hyperactivity').textContent = '0';
  document.getElementById('adhdLikelihood').textContent = '0';

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;
    video.play();

    startBtn.disabled = true;
    stopBtn.disabled = false;

    await initFaceMesh();

    const stopTime = 10000 + Math.random() * 5000;
    autoStopTimeout = setTimeout(() => {
      stopBtn.click();
      showTemporaryPopup("Screening completed! See metrics above.");
    }, stopTime);

  } catch (err) {
    alert('Error accessing webcam: ' + err);
  }
});


// ---------------------
// Stop webcam
// ---------------------
stopBtn.addEventListener('click', () => {
  if (stream) stream.getTracks().forEach(track => track.stop());
  if (mpCamera) mpCamera.stop();

  showTemporaryPopup("Screening stopped");

  startBtn.disabled = false;
  stopBtn.disabled = true;

  clearTimeout(autoStopTimeout);
});

// ---------------------
// Temporary popup function
// ---------------------
function showTemporaryPopup(message) {
  const popup = document.createElement('div');
  popup.classList.add('popup');
  popup.textContent = message;
  document.body.appendChild(popup);

  setTimeout(() => {
    popup.remove();
  }, 2500);
}

// ---------------------
// Handle FaceMesh results
// ---------------------
function onFaceMeshResults(results) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) return;

  totalFrames++;
  const landmarks = results.multiFaceLandmarks[0];

  // ---------------------
  // Eye boxes
  // ---------------------
  const leftEyeIndices = [33, 133, 160, 159, 158, 157, 173, 144];
  const rightEyeIndices = [362, 263, 387, 386, 385, 384, 398, 373];

  const leftEye = getEyeBox(leftEyeIndices, landmarks);
  const rightEye = getEyeBox(rightEyeIndices, landmarks);

  let eyeColor = 'lime';
  if (blinkFlashCounter > 0) {
    eyeColor = 'red';
    blinkFlashCounter--;
  }

  ctx.strokeStyle = eyeColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(leftEye.x, leftEye.y, leftEye.width, leftEye.height);
  ctx.strokeRect(rightEye.x, rightEye.y, rightEye.width, rightEye.height);

  // ---------------------
  // Blink Detection
  // ---------------------
  const leftEAR = computeEAR([33, 160, 158, 133, 153, 144], landmarks);
  const rightEAR = computeEAR([263, 387, 385, 362, 380, 373], landmarks);
  const ear = (leftEAR + rightEAR) / 2;

  if (ear < 0.25 && framesSinceLastBlink > 2) {
    blinkCount++;
    framesSinceLastBlink = 0;
    blinkFlashCounter = 3;
  } else framesSinceLastBlink++;

  const blinkPattern = blinkCount < 10 ? 'Normal' : 'Frequent';
  document.getElementById('blinkPattern').textContent = blinkPattern;

  ctx.fillStyle = 'white';
  ctx.font = '18px Arial';
  ctx.fillText(`Blinks: ${blinkCount}`, 10, 25);

  // ---------------------
  // Gaze / Attention
  // ---------------------
  const leftCenter = getEyeCenter(leftEyeIndices, landmarks);
  const rightCenter = getEyeCenter(rightEyeIndices, landmarks);

  const gazeX = (leftCenter.x + rightCenter.x) / 2;
  const gazeY = (leftCenter.y + rightCenter.y) / 2;

  const centerX = 0.5;
  const centerY = 0.5;
  const gazeDeviation = Math.sqrt((gazeX - centerX) ** 2 + (gazeY - centerY) ** 2);

  if (gazeDeviation > 0.1) attentionAwayFrames++;

  const attentionScore = Math.max(0, 100 - Math.round((attentionAwayFrames / totalFrames) * 100));
  document.getElementById('attentionScore').textContent = attentionScore;

  ctx.fillStyle = 'lime';
  ctx.beginPath();
  ctx.arc(gazeX * canvas.width, gazeY * canvas.height, 8, 0, 2 * Math.PI);
  ctx.fill();

  if (attentionScore < 70) {
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
  }

  // ---------------------
  // Head movement / Hyperactivity
  // ---------------------
  const noseTip = landmarks[1];
  headPositions.push([noseTip.x, noseTip.y]);
  if (headPositions.length > MAX_HEAD_HISTORY) headPositions.shift();

  ctx.strokeStyle = 'cyan';
  ctx.lineWidth = 2;
  ctx.beginPath();
  headPositions.forEach((pos, i) => {
    const x = pos[0] * canvas.width;
    const y = pos[1] * canvas.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // ---------------------
  // Calculate head movement velocity
  // ---------------------
  let velocity = 0;
  for (let i = 1; i < headPositions.length; i++) {
    velocity += distance(
      {x: headPositions[i][0], y: headPositions[i][1]}, 
      {x: headPositions[i-1][0], y: headPositions[i-1][1]}
    );
  }

  // ---------------------
  // Hyperactivity score = attention + head movement + random
  // ---------------------
  const attentionFactor = (100 - attentionScore) * 0.5;
  const headMovementFactor = velocity * 500; // scaled
  const randomFactor = Math.random() * 10;
  const hyperactivityIndex = Math.min(100, Math.round(attentionFactor + headMovementFactor + randomFactor));

  document.getElementById('hyperactivity').textContent = hyperactivityIndex;

  // ---------------------
  // ADHD Likelihood
  // ---------------------
  const adhdLikelihood = Math.min(99, Math.round((100 - attentionScore + hyperactivityIndex * 0.3) / 1.3));
  document.getElementById('adhdLikelihood').textContent = adhdLikelihood;
}

// ---------------------
// Eye Aspect Ratio
// ---------------------
function computeEAR(indices, landmarks) {
  const p1 = landmarks[indices[0]];
  const p2 = landmarks[indices[1]];
  const p3 = landmarks[indices[2]];
  const p4 = landmarks[indices[3]];
  const p5 = landmarks[indices[4]];
  const p6 = landmarks[indices[5]];

  const vertical1 = distance(p2, p6);
  const vertical2 = distance(p3, p5);
  const horizontal = distance(p1, p4);

  return (vertical1 + vertical2) / (2.0 * horizontal);
}

// ---------------------
// Eye Center
// ---------------------
function getEyeCenter(indices, landmarks) {
  let xSum = 0, ySum = 0;
  indices.forEach(i => {
    xSum += landmarks[i].x;
    ySum += landmarks[i].y;
  });
  return { x: xSum / indices.length, y: ySum / indices.length };
}

// ---------------------
// Eye Box
// ---------------------
function getEyeBox(indices, landmarks) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  indices.forEach(i => {
    minX = Math.min(minX, landmarks[i].x);
    minY = Math.min(minY, landmarks[i].y);
    maxX = Math.max(maxX, landmarks[i].x);
    maxY = Math.max(maxY, landmarks[i].y);
  });
  return {
    x: minX * canvas.width,
    y: minY * canvas.height,
    width: (maxX - minX) * canvas.width,
    height: (maxY - minY) * canvas.height
  };
}

// ---------------------
// Distance helper
// ---------------------
function distance(p1, p2) {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}
