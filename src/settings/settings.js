// src/settings/settings.js

// transport:
//   'audio' → POST multipart to /audio/transcriptions (OpenAI/Groq native)
//   'chat'  → POST JSON to /chat/completions with input_audio multimodal (OpenRouter)
const STT_PRESETS = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", models: ["whisper-large-v3-turbo", "whisper-large-v3"], transport: "audio" },
  openai: { baseUrl: "https://api.openai.com/v1", models: ["whisper-1", "gpt-4o-transcribe", "gpt-4o-mini-transcribe"], transport: "audio" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", models: ["openai/whisper-1", "google/gemini-2.0-flash-001"], transport: "chat" },
  custom: { baseUrl: "", models: [], transport: "audio" }
};

const LLM_PRESETS = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen-2.5-32b"] },
  openai: { baseUrl: "https://api.openai.com/v1", models: ["gpt-4o-mini", "gpt-4o"] },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", models: ["anthropic/claude-haiku-4.5", "openai/gpt-4o-mini", "meta-llama/llama-3.3-70b-instruct"] },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", models: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"] },
  custom: { baseUrl: "", models: [] }
};

const DEFAULT_SYSTEM_PROMPT = `You are in a web development environment. Annotations describe UI components (Angular/React/Vue/HTML) or API requests for error traceability.

Rules:
- Preserve EXACT technical terms (component names, CSS classes, selectors, IDs, endpoints, filenames, URLs).
- Auto-detect the spoken language and keep it — do NOT translate. Just fix punctuation and capitalization.
- If you detect an error report, structure it as: [Severity] [Component/Endpoint] [Description].
- Do NOT add information not present in the dictation.
- Return ONLY the corrected text, no explanations or prefixes.`;

const DEFAULT_CONFIG = {
  stt: { provider: "groq", baseUrl: STT_PRESETS.groq.baseUrl, apiKey: "", model: "whisper-large-v3-turbo", language: "es", transport: "audio" },
  llm: { enabled: true, provider: "groq", baseUrl: LLM_PRESETS.groq.baseUrl, apiKey: "", model: "llama-3.3-70b-versatile", systemPrompt: DEFAULT_SYSTEM_PROMPT }
};

const $ = (id) => document.getElementById(id);

function fillModelDatalist(datalistId, models) {
  const dl = $(datalistId);
  dl.innerHTML = '';
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    dl.appendChild(opt);
  });
}

function detectTransport(baseUrl, provider) {
  if (provider !== 'custom') {
    const preset = STT_PRESETS[provider];
    if (preset) return preset.transport;
  }
  if (baseUrl && baseUrl.includes('openrouter.ai')) return 'chat';
  return 'audio';
}

function loadConfig() {
  chrome.storage.local.get(['voice_config'], (result) => {
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

    fillModelDatalist('sttModels', (STT_PRESETS[cfg.stt.provider] || STT_PRESETS.custom).models);
    fillModelDatalist('llmModels', (LLM_PRESETS[cfg.llm.provider] || LLM_PRESETS.custom).models);
    toggleLlmSection();
  });
}

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
  chrome.storage.local.set({ voice_config: cfg }, () => {
    showStatus('Settings saved ✓', 'ok');
  });
}

function showStatus(msg, type) {
  const s = $('status');
  s.textContent = msg;
  s.className = 'status ' + type;
  setTimeout(() => { s.className = 'status'; }, 4000);
}

function toggleLlmSection() {
  $('llmSection').style.opacity = $('llmEnabled').checked ? '1' : '0.4';
  $('llmSection').style.pointerEvents = $('llmEnabled').checked ? 'auto' : 'none';
}

$('sttProvider').addEventListener('change', (e) => {
  const p = STT_PRESETS[e.target.value] || STT_PRESETS.custom;
  if (p.baseUrl) $('sttBaseUrl').value = p.baseUrl;
  if (p.models[0]) $('sttModel').value = p.models[0];
  fillModelDatalist('sttModels', p.models);
});

$('llmProvider').addEventListener('change', (e) => {
  const p = LLM_PRESETS[e.target.value] || LLM_PRESETS.custom;
  if (p.baseUrl) $('llmBaseUrl').value = p.baseUrl;
  if (p.models[0]) $('llmModel').value = p.models[0];
  fillModelDatalist('llmModels', p.models);
});

$('llmEnabled').addEventListener('change', toggleLlmSection);
$('saveBtn').addEventListener('click', saveConfig);

$('testLlmBtn').addEventListener('click', async () => {
  saveConfig();
  showStatus('Testing LLM...', 'ok');
  try {
    const res = await chrome.runtime.sendMessage({ action: 'voice:testLLM', text: 'hello world, microphone test number one' });
    if (res.ok) showStatus('LLM ✓: ' + res.text.slice(0, 200), 'ok');
    else showStatus('LLM error: ' + res.error, 'err');
  } catch (e) { showStatus('Error: ' + e.message, 'err'); }
});

$('testSttBtn').addEventListener('click', async () => {
  saveConfig();
  showStatus('Recording 3s... speak now', 'ok');
  try {
    const res = await chrome.runtime.sendMessage({ action: 'voice:testSTT' });
    if (res.ok) showStatus('STT ✓: ' + res.text, 'ok');
    else showStatus('STT error: ' + res.error, 'err');
  } catch (e) { showStatus('Error: ' + e.message, 'err'); }
});

loadConfig();
