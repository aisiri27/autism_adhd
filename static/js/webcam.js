// static/js/webcam.js
// Controls webcam, captures frames to canvas, overlays simple drawings, sends frames to backend.

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');

const startBtn = document.getElementById('start_btn');
const stopBtn = document.getElementById('stop_btn');
const consent = document.getElementById('consent');
const status = document.getElementById('status');
const intervalSelect = document.getElementById('interval');

const uploadForm = document.getElementById('upload_form');
const fileInput = document.getElementById('file_input');
const uploadResult = document.getElementById('upload_result');

let stream = null;
let sending = false;
let sendIntervalMs = Number(intervalSelect.value);
let timerId = null;

function setStatus(txt, isError=false) {
  status.textContent = txt;
  status.style.background = isError ? 'rgba(255,80,80,0.2)' : 'rgba(0,0,0,0.12)';
}

// resize overlay canvas to match video display size
function syncCanvasSize() {
  overlay.width = video.clientWidth;
  overlay.height = video.clientHeight;
}

async function startCamera() {
  if (!consent.checked) {
    alert('Please consent before starting the webcam.');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
    video.srcObject = stream;
    video.play();
    startBtn.disabled = true;
    stopBtn.disabled = false;
    sending = true;
    setStatus('starting...');
    // ensure canvas size matches video element once metadata is loaded
    video.onloadedmetadata = () => {
      syncCanvasSize();
      startSendLoop();
    };
    intervalSelect.addEventListener('change', () => {
      sendIntervalMs = Number(intervalSelect.value);
    });
    window.addEventListener('resize', syncCanvasSize);
  } catch (err) {
    console.error(err);
    alert('Could not access camera: ' + err.message);
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  sending = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus('stopped');
  if (timerId) clearTimeout(timerId);
  // clear overlay
  ctx.clearRect(0,0,overlay.width, overlay.height);
}

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);

// Capture current frame, draw to an offscreen canvas, and send to server as base64
async function sendFrameToServer() {
  if (!sending) return;
  try {
    // draw video frame to overlay's context (but don't overwrite overlay content)
    const w = overlay.width;
    const h = overlay.height;
    // create temporary canvas to get higher quality capture if sizes differ
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(video, 0, 0, w, h);
    const dataURL = tmp.toDataURL('image/jpeg', 0.7);

    setStatus('sending frame...');
    const resp = await fetch('/infer_frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame: dataURL })
    });

    if (!resp.ok) {
      setStatus('server error', true);
      return;
    }
    const json = await resp.json();
    drawOverlayFromResult(json);
    setStatus(`ok (${json.inference_time_ms || '—'} ms)`);
  } catch (err) {
    console.error('sendFrame error', err);
    setStatus('error', true);
  }
}

// main loop
function startSendLoop() {
  if (!sending) return;
  const loop = async () => {
    await sendFrameToServer();
    timerId = setTimeout(loop, sendIntervalMs);
  };
  loop();
}

// draw simple bounding boxes and labels on overlay given backend result
function drawOverlayFromResult(result) {
  // clear canvas
  ctx.clearRect(0,0,overlay.width, overlay.height);
  if (!result || !Array.isArray(result.faces)) return;
  // overlay style
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.font = '16px Inter, Arial';
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  result.faces.forEach(face => {
    if (!face.bbox) return;
    // bbox: [x,y,w,h] in source image coordinates used by backend.
    // NOTE: backend assumes frame was full-size image. We expect it to be same size as sent canvas (which matches overlay/window).
    const [x,y,w,h] = face.bbox;
    ctx.strokeRect(x, y, w, h);

    // Emotion label
    const emotion = face.emotion || '—';
    const emoConf = face.emotion_confidence ? ` (${Math.round(face.emotion_confidence*100)}%)` : '';
    ctx.fillText(`Emotion: ${emotion}${emoConf}`, x + 6, y - 6);

    // Autism/ADHD label if available
    const autismLabel = face.autism_label || 'N/A';
    const autismScore = face.autism_score !== undefined ? ` (${Math.round(face.autism_score*100)}%)` : '';
    ctx.fillText(`Autism: ${autismLabel}${autismScore}`, x + 6, y + h + 18);

    // Eye status
    const eyeStatus = face.eye_status || 'unknown';
    ctx.fillText(`Eyes: ${eyeStatus}`, x + 6, y + h + 36);

    // draw small indicator circle
    ctx.beginPath();
    ctx.arc(x + w - 14, y + 14, 8, 0, Math.PI*2);
    ctx.fillStyle = face.autism_score && face.autism_score > 0.6 ? 'rgba(255,120,120,0.95)' : 'rgba(120,255,180,0.95)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
  });
}

/* ---------- Upload form ---------- */
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = fileInput.files[0];
  if (!f) {
    alert('Choose an image file first');
    return;
  }
  const form = new FormData();
  form.append('file', f);
  setStatus('uploading...');
  try {
    const r = await fetch('/upload', { method: 'POST', body: form });
    if (!r.ok) {
      setStatus('upload failed', true);
      uploadResult.textContent = 'Upload failed';
      return;
    }
    const j = await r.json();
    uploadResult.innerText = JSON.stringify(j.result, null, 2);
    setStatus('upload done');
  } catch (err) {
    console.error(err);
    setStatus('error', true);
    uploadResult.textContent = 'Error: ' + err.message;
  }
});
