// src/voice/voice-client.js
// Helper consumed by sidepanel.js (and content scripts indirectly) to start/stop
// recording and obtain refined text via background.

(function (global) {
  let recording = false;

  async function start() {
    if (recording) return { ok: false, error: 'already recording' };
    const res = await chrome.runtime.sendMessage({ action: 'voice:start' });
    if (res && res.ok) recording = true;
    return res || { ok: false, error: 'no response' };
  }

  async function stopAndTranscribe() {
    if (!recording) return { ok: false, error: 'not recording' };
    recording = false;
    const res = await chrome.runtime.sendMessage({ action: 'voice:stopAndProcess' });
    return res || { ok: false, error: 'no response' };
  }

  async function cancel() {
    recording = false;
    return await chrome.runtime.sendMessage({ action: 'voice:cancel' });
  }

  global.VoiceClient = { start, stopAndTranscribe, cancel, isRecording: () => recording };
})(typeof window !== 'undefined' ? window : globalThis);
