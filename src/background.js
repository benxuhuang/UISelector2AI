// src/background.js

const openSidePanels = new Set();

async function initializeSidePanelState() {
  try {
    const allStorage = await chrome.storage.session.get(null);
    for (const key in allStorage) {
      if (key.startsWith('sidepanel_open_')) {
        const windowId = parseInt(key.replace('sidepanel_open_', ''));
        if (!isNaN(windowId)) openSidePanels.add(windowId);
      }
    }
  } catch (e) { console.error('Failed to initialize side panel state:', e); }
}
initializeSidePanelState();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name.startsWith('sidepanel-')) {
    const windowId = parseInt(port.name.split('-')[1]);
    const storageKey = `sidepanel_open_${windowId}`;
    openSidePanels.add(windowId);
    chrome.storage.session.set({ [storageKey]: true });
    port.onDisconnect.addListener(() => {
      openSidePanels.delete(windowId);
      chrome.storage.session.remove(storageKey);
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("UISelector2AI installed");
});

const transitioningPanels = new Set();

function toggleSidePanel(windowId) {
  if (transitioningPanels.has(windowId)) return;
  const isOpen = openSidePanels.has(windowId);
  transitioningPanels.add(windowId);
  if (isOpen) {
    openSidePanels.delete(windowId);
    chrome.sidePanel.close({ windowId })
      .catch(err => { console.error('close panel:', err); openSidePanels.add(windowId); })
      .finally(() => transitioningPanels.delete(windowId));
  } else {
    openSidePanels.add(windowId);
    chrome.sidePanel.open({ windowId })
      .catch(err => { console.error('open panel:', err); openSidePanels.delete(windowId); })
      .finally(() => transitioningPanels.delete(windowId));
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'open_side_panel') {
    toggleSidePanel(tab.windowId);
  } else if (command === 'toggle_inspect' || command === 'clear_annotations') {
    if (tab && tab.id) {
      const action = command === 'toggle_inspect' ? 'toggleInspect' : 'clearAnnotations';
      // 快捷鍵觸發的命令會標記 source='shortcut'，讓內容腳本決定是否播放音效。
      chrome.tabs.sendMessage(tab.id, { action, source: 'shortcut' }).catch(() => {});
    }
  }
});

// =============================================================
// VOICE ??Offscreen Document + STT + LLM
// =============================================================

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';

async function hasOffscreenDocument() {
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    return await chrome.offscreen.hasDocument();
  }
  // Fallback: matching contexts API
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    return contexts.length > 0;
  }
  return false;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['USER_MEDIA'],
    justification: 'Recording microphone for voice annotations'
  });
}

async function closeOffscreenDocument() {
  if (await hasOffscreenDocument()) {
    try { await chrome.offscreen.closeDocument(); } catch (e) { console.warn('closeOffscreen:', e.message); }
  }
}

async function getConfig() {
  const { voice_config } = await chrome.storage.local.get(['voice_config']);
  if (!voice_config) throw new Error('Empty configuration. Open Settings first.');
  return voice_config;
}

function base64ToBlob(base64, mime = 'audio/webm') {
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// OpenRouter does NOT expose /audio/transcriptions. It transcribes via
// /chat/completions multimodal with input_audio (base64). Detect by URL or
// explicit transport flag.
function sttUsesChatCompletions(sttCfg) {
  if (sttCfg.transport === 'chat') return true;
  if (sttCfg.baseUrl && sttCfg.baseUrl.includes('openrouter.ai')) return true;
  return false;
}

async function transcribeAudioEndpoint(audioBase64, sttCfg) {
  const audioBlob = base64ToBlob(audioBase64);
  if (!audioBlob.size) throw new Error('Audio vac穩o (0 bytes)');

  const fd = new FormData();
  fd.append('file', audioBlob, 'audio.webm');
  fd.append('model', sttCfg.model);
  fd.append('response_format', 'json');
  if (sttCfg.language) fd.append('language', sttCfg.language);

  const url = sttCfg.baseUrl.replace(/\/$/, '') + '/audio/transcriptions';
  console.log('[voice] STT(audio) POST', url, 'audio bytes:', audioBlob.size);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${sttCfg.apiKey}` },
    body: fd
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('[voice] STT(audio) error:', res.status, txt);
    throw new Error(`STT ${res.status}: ${txt.slice(0, 250)}`);
  }
  const data = await res.json();
  return (data.text || '').trim();
}

async function transcribeChatCompletions(audioBase64, sttCfg) {
  // OpenRouter espera WAV en input_audio. Convertimos WebM ??WAV v穩a offscreen.
  let wavBase64 = audioBase64;
  try {
    const convertRes = await chrome.runtime.sendMessage({
      target: 'offscreen', action: 'convertToWav', audioBase64
    });
    if (convertRes && convertRes.ok) wavBase64 = convertRes.audio;
  } catch (e) {
    console.warn('[voice] WAV conversion no disponible, usando WebM directo:', e.message);
  }

  const url = sttCfg.baseUrl.replace(/\/$/, '') + '/chat/completions';
  const body = {
    model: sttCfg.model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Transcribe this audio verbatim. Return only the transcription, no commentary, no quotes.' },
        { type: 'input_audio', input_audio: { data: wavBase64, format: 'wav' } }
      ]
    }]
  };
  console.log('[voice] STT(chat) POST', url, 'audio b64 len:', wavBase64.length);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sttCfg.apiKey}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('[voice] STT(chat) error:', res.status, txt);
    throw new Error(`STT ${res.status}: ${txt.slice(0, 250)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return (typeof text === 'string' ? text : JSON.stringify(text)).trim();
}

async function transcribe(audioBase64, sttCfg) {
  if (!sttCfg || !sttCfg.apiKey) throw new Error('STT API key no configurada');
  if (sttUsesChatCompletions(sttCfg)) {
    return await transcribeChatCompletions(audioBase64, sttCfg);
  }
  return await transcribeAudioEndpoint(audioBase64, sttCfg);
}

async function refineAnthropic(text, llmCfg) {
  const url = llmCfg.baseUrl.replace(/\/$/, '') + '/messages';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': llmCfg.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: llmCfg.model,
      max_tokens: 1024,
      system: llmCfg.systemPrompt,
      messages: [{ role: 'user', content: text }]
    })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.content?.[0]?.text || '').trim();
}

async function refine(text, llmCfg) {
  if (!llmCfg || !llmCfg.apiKey) throw new Error('LLM API key no configurada');
  if (llmCfg.baseUrl && llmCfg.baseUrl.includes('api.anthropic.com')) {
    return await refineAnthropic(text, llmCfg);
  }
  const url = llmCfg.baseUrl.replace(/\/$/, '') + '/chat/completions';
  const body = {
    model: llmCfg.model,
    messages: [
      { role: 'system', content: llmCfg.systemPrompt },
      { role: 'user', content: text }
    ],
    temperature: 0.3
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${llmCfg.apiKey}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LLM ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

async function startVoiceRecording() {
  await ensureOffscreenDocument();
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', action: 'startRecording' });
  return res || { ok: false, error: 'no response from offscreen' };
}

async function stopAndProcess() {
  const res = await chrome.runtime.sendMessage({ target: 'offscreen', action: 'stopRecording' });
  if (!res || !res.ok) {
    throw new Error((res && res.error) || 'Could not stop the recording');
  }
  const audioBase64 = res.audio;
  // Keep offscreen alive ??closing it forces a fresh getUserMedia prompt next time
  // and Chrome MV3 has been seen to drop the mic grant between offscreen instances.

  const cfg = await getConfig();
  let text = await transcribe(audioBase64, cfg.stt);
  if (cfg.llm?.enabled && cfg.llm.apiKey && text) {
    try {
      text = await refine(text, cfg.llm);
    } catch (e) {
      console.warn('[voice] LLM refine fall籀, devolviendo raw:', e.message);
    }
  }
  return text;
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.command === 'open_side_panel') {
    toggleSidePanel(req.windowId);
    return;
  }

  if (req.action === 'voice:start') {
    startVoiceRecording()
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (req.action === 'voice:stopAndProcess') {
    stopAndProcess()
      .then(text => sendResponse({ ok: true, text }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (req.action === 'voice:cancel') {
    closeOffscreenDocument().finally(() => sendResponse({ ok: true }));
    return true;
  }

  if (req.action === 'voice:testLLM') {
    getConfig()
      .then(cfg => refine(req.text, cfg.llm))
      .then(text => sendResponse({ ok: true, text }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (req.action === 'voice:testSTT') {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const startRes = await chrome.runtime.sendMessage({ target: 'offscreen', action: 'startRecording' });
        if (!startRes || !startRes.ok) throw new Error((startRes && startRes.error) || 'Recording did not start');
        await new Promise(r => setTimeout(r, 3000));
        const text = await stopAndProcess();
        sendResponse({ ok: true, text });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }
});
