// src/settings/settings.js

// transport:
//   'audio' -> POST multipart to /audio/transcriptions (OpenAI/Groq native)
//   'chat'  -> POST JSON to /chat/completions with input_audio multimodal (OpenRouter)
const STT_PRESETS = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', models: ['whisper-large-v3-turbo', 'whisper-large-v3'], transport: 'audio' },
  openai: { baseUrl: 'https://api.openai.com/v1', models: ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'], transport: 'audio' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', models: ['openai/whisper-1', 'google/gemini-2.0-flash-001'], transport: 'chat' },
  custom: { baseUrl: '', models: [], transport: 'audio' }
};

const LLM_PRESETS = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen-2.5-32b'] },
  openai: { baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o'] },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', models: ['anthropic/claude-haiku-4.5', 'openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct'] },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'] },
  custom: { baseUrl: '', models: [] }
};

const DEFAULT_SYSTEM_PROMPT = `You are in a web development environment. Annotations describe UI components (Angular/React/Vue/HTML) or API requests for error traceability.

Rules:
- Preserve EXACT technical terms (component names, CSS classes, selectors, IDs, endpoints, filenames, URLs).
- Auto-detect the spoken language and keep it. Do NOT translate. Just fix punctuation and capitalization.
- If you detect an error report, structure it as: [Severity] [Component/Endpoint] [Description].
- Do NOT add information not present in the dictation.
- Return ONLY the corrected text, no explanations or prefixes.`;

const DEFAULT_CONFIG = {
  stt: { provider: 'groq', baseUrl: STT_PRESETS.groq.baseUrl, apiKey: '', model: 'whisper-large-v3-turbo', language: 'es', transport: 'audio' },
  llm: { enabled: true, provider: 'groq', baseUrl: LLM_PRESETS.groq.baseUrl, apiKey: '', model: 'llama-3.3-70b-versatile', systemPrompt: DEFAULT_SYSTEM_PROMPT }
};

const DEFAULT_SHORTCUT_SOUND_ENABLED = true;

const $ = (id) => document.getElementById(id);

/**
 * 將模型名稱清單填入 datalist，讓使用者可以快速選擇預設模型。
 * 參數：
 * - datalistId：目標 datalist 的 DOM id。
 * - models：要寫入的模型名稱陣列。
 * 回傳值：無。
 */
function fillModelDatalist(datalistId, models) {
  const dl = $(datalistId);
  dl.innerHTML = '';
  models.forEach((model) => {
    const opt = document.createElement('option');
    opt.value = model;
    dl.appendChild(opt);
  });
}

/**
 * 根據 STT provider 與 base URL 推斷使用 audio endpoint 或 chat completions。
 * 參數：
 * - baseUrl：STT 服務的 base URL。
 * - provider：目前選擇的 provider。
 * 回傳值：'audio' 或 'chat'。
 */
function detectTransport(baseUrl, provider) {
  if (provider !== 'custom') {
    const preset = STT_PRESETS[provider];
    if (preset) return preset.transport;
  }
  if (baseUrl && baseUrl.includes('openrouter.ai')) return 'chat';
  return 'audio';
}

/**
 * 讀取已儲存的設定，並回填到設定頁面。
 * 參數：無。
 * 回傳值：無。
 */
function loadConfig() {
  chrome.storage.local.get(['voice_config', 'shortcut_sound_enabled'], (result) => {
    const stored = result.voice_config || {};
    const cfg = {
      stt: { ...DEFAULT_CONFIG.stt, ...(stored.stt || {}) },
      llm: { ...DEFAULT_CONFIG.llm, ...(stored.llm || {}) }
    };

    $('sttProvider').value = cfg.stt.provider;
    $('sttBaseUrl').value = cfg.stt.baseUrl;
    $('sttApiKey').value = cfg.stt.apiKey;
    $('sttModel').value = cfg.stt.model;
    $('sttLanguage').value = cfg.stt.language;

    $('llmEnabled').checked = cfg.llm.enabled;
    $('llmProvider').value = cfg.llm.provider;
    $('llmBaseUrl').value = cfg.llm.baseUrl;
    $('llmApiKey').value = cfg.llm.apiKey;
    $('llmModel').value = cfg.llm.model;
    $('llmSystemPrompt').value = cfg.llm.systemPrompt || DEFAULT_SYSTEM_PROMPT;

    $('shortcutSoundEnabled').checked = result.shortcut_sound_enabled !== false && DEFAULT_SHORTCUT_SOUND_ENABLED;

    fillModelDatalist('sttModels', (STT_PRESETS[cfg.stt.provider] || STT_PRESETS.custom).models);
    fillModelDatalist('llmModels', (LLM_PRESETS[cfg.llm.provider] || LLM_PRESETS.custom).models);
    toggleLlmSection();
  });
}

/**
 * 將設定頁面的內容儲存到 Chrome 本機儲存空間。
 * 參數：無。
 * 回傳值：無。
 */
function saveConfig() {
  const baseUrl = $('sttBaseUrl').value.trim();
  const provider = $('sttProvider').value;
  const cfg = {
    stt: {
      provider,
      baseUrl,
      apiKey: $('sttApiKey').value.trim(),
      model: $('sttModel').value.trim(),
      language: $('sttLanguage').value.trim() || 'es',
      transport: detectTransport(baseUrl, provider)
    },
    llm: {
      enabled: $('llmEnabled').checked,
      provider: $('llmProvider').value,
      baseUrl: $('llmBaseUrl').value.trim(),
      apiKey: $('llmApiKey').value.trim(),
      model: $('llmModel').value.trim(),
      systemPrompt: $('llmSystemPrompt').value.trim() || DEFAULT_SYSTEM_PROMPT
    }
  };

  chrome.storage.local.set(
    {
      voice_config: cfg,
      shortcut_sound_enabled: $('shortcutSoundEnabled').checked
    },
    () => {
      showStatus('Settings saved ✓', 'ok');
    }
  );
}

/**
 * 顯示一段短暫的狀態訊息。
 * 參數：
 * - msg：要顯示的訊息內容。
 * - type：訊息樣式，支援 ok / err。
 * 回傳值：無。
 */
function showStatus(msg, type) {
  const s = $('status');
  s.textContent = msg;
  s.className = 'status ' + type;
  setTimeout(() => {
    s.className = 'status';
  }, 4000);
}

/**
 * 根據 LLM 啟用狀態切換設定區塊的可見度。
 * 參數：無。
 * 回傳值：無。
 */
function toggleLlmSection() {
  $('llmSection').style.opacity = $('llmEnabled').checked ? '1' : '0.4';
  $('llmSection').style.pointerEvents = $('llmEnabled').checked ? 'auto' : 'none';
}

/**
 * 當 STT provider 變更時，自動帶入對應的預設 base URL 與模型清單。
 * 參數：無。
 * 回傳值：無。
 */
$('sttProvider').addEventListener('change', (e) => {
  const p = STT_PRESETS[e.target.value] || STT_PRESETS.custom;
  if (p.baseUrl) $('sttBaseUrl').value = p.baseUrl;
  if (p.models[0]) $('sttModel').value = p.models[0];
  fillModelDatalist('sttModels', p.models);
});

/**
 * 當 LLM provider 變更時，自動帶入對應的預設 base URL 與模型清單。
 * 參數：無。
 * 回傳值：無。
 */
$('llmProvider').addEventListener('change', (e) => {
  const p = LLM_PRESETS[e.target.value] || LLM_PRESETS.custom;
  if (p.baseUrl) $('llmBaseUrl').value = p.baseUrl;
  if (p.models[0]) $('llmModel').value = p.models[0];
  fillModelDatalist('llmModels', p.models);
});

/**
 * 切換 LLM 區塊的啟用狀態。
 * 參數：無。
 * 回傳值：無。
 */
$('llmEnabled').addEventListener('change', toggleLlmSection);
$('saveBtn').addEventListener('click', saveConfig);

$('testLlmBtn').addEventListener('click', async () => {
  saveConfig();
  showStatus('Testing LLM...', 'ok');
  try {
    const res = await chrome.runtime.sendMessage({ action: 'voice:testLLM', text: 'hello world, microphone test number one' });
    if (res.ok) showStatus('LLM ✓ ' + res.text.slice(0, 200), 'ok');
    else showStatus('LLM error: ' + res.error, 'err');
  } catch (e) {
    showStatus('Error: ' + e.message, 'err');
  }
});

$('testSttBtn').addEventListener('click', async () => {
  saveConfig();
  showStatus('Recording 3s... speak now', 'ok');
  try {
    const res = await chrome.runtime.sendMessage({ action: 'voice:testSTT' });
    if (res.ok) showStatus('STT ✓ ' + res.text, 'ok');
    else showStatus('STT error: ' + res.error, 'err');
  } catch (e) {
    showStatus('Error: ' + e.message, 'err');
  }
});

loadConfig();
