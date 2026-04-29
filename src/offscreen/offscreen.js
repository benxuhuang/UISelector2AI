// src/offscreen/offscreen.js
// Hidden extension page with mic permission. Talks to background via runtime messages.

let mediaRecorder = null;
let chunks = [];
let stream = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;

  if (msg.action === 'startRecording') {
    startRecording().then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.action === 'stopRecording') {
    stopRecording().then(base64 => sendResponse({ ok: true, audio: base64 }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.action === 'convertToWav') {
    webmToWavBase64(msg.audioBase64)
      .then(wav => sendResponse({ ok: true, audio: wav }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

async function startRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    throw new Error('Already recording');
  }
  // 16 kHz mono — optimal for speech recognition APIs.
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });
  chunks = [];
  // 128 kbps Opus — much higher than default ~32 kbps. Big improvement on STT
  // accuracy for low-volume voices and noisy environments.
  mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'audio/webm;codecs=opus',
    audioBitsPerSecond: 128000
  });
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  mediaRecorder.start();
}

function stopRecording() {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') {
      reject(new Error('Not recording'));
      return;
    }
    mediaRecorder.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        stream = null;
        mediaRecorder = null;
        chunks = [];
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        resolve(base64);
      } catch (e) { reject(e); }
    };
    mediaRecorder.stop();
  });
}

// WebM → WAV conversion. Needed because OpenRouter (chat completions transport)
// expects WAV format for input_audio, while MediaRecorder produces WebM/Opus.
async function webmToWavBase64(webmBase64) {
  const binary = atob(webmBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'audio/webm' });

  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  let audioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    await audioCtx.close();
  }

  const wavBlob = encodeWavBlob(audioBuffer);
  const wavArray = await wavBlob.arrayBuffer();
  const wavBytes = new Uint8Array(wavArray);
  let binary2 = '';
  for (let i = 0; i < wavBytes.length; i++) binary2 += String.fromCharCode(wavBytes[i]);
  return btoa(binary2);
}

function encodeWavBlob(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bitsPerSample = 16;
  const length = audioBuffer.length;

  const data = new Float32Array(length * numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i * numChannels + ch] = channelData[i];
    }
  }

  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = length * numChannels * bitsPerSample / 8;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
