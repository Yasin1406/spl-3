if (typeof importScripts === "function") importScripts("supabaseConfig.js", "../content/keybindings.js", "account.js");

const DEFAULTS = Object.freeze({
  baaAssistantEnabled: true,
  baaCustomKeybindings: {},
  baaNoiseReductionEnabled: false,
  baaFormGuidanceEnabled: true,
  baaTranslationEnabled: false,
  baaTranslationVerbosity: "balanced",
  baaImageShortcutGuidanceEnabled: true,
  baaAiTranslationEnabled: true,
  baaAiSummaryEnabled: true,
  baaSummaryDetail: "standard",
  baaBackendUrl: "http://127.0.0.1:3000"
});
const translationCache = new Map();
const summaryRequests = new Map();
let voiceSession = null;
let offscreenCreating = null;
let accounts = null;
const accountsReady = globalThis.BAA_ACCOUNTS ? (async () => {
  // Keep persistent sessions out of content scripts. Preferences are delivered
  // through the filtered message bridge rather than exposing local storage.
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  accounts = globalThis.BAA_ACCOUNTS.createAccountManager({ storage: chrome.storage.local, defaults: DEFAULTS,
    keybindings: globalThis.BAA_KEYBINDINGS, config: globalThis.BAA_SUPABASE_CONFIG });
  await accounts.ready;
  return accounts;
})() : Promise.resolve(null);

if (globalThis.BAA_ACCOUNTS) {
  accountsReady.then(manager => manager.sync()).catch(() => {});
  chrome.alarms.create("baa-account-sync", { periodInMinutes: 5 });
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === "baa-account-sync") accountsReady.then(manager => manager.sync()).catch(() => {}); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const filtered = Object.fromEntries(Object.entries(changes).filter(([key]) => key in DEFAULTS));
    if (!Object.keys(filtered).length) return;
    chrome.tabs.query({}).then(tabs => Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: "BAA_PREFERENCES_CHANGED", changes: filtered }).catch(() => {})))).catch(() => {});
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (current) => {
    const missing = Object.fromEntries(Object.entries(DEFAULTS).filter(([key]) => current[key] === undefined));
    if (Object.keys(missing).length > 0) chrome.storage.local.set(missing);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (["BAA_GET_ACCOUNT_STATUS", "BAA_SIGN_IN", "BAA_SIGN_UP", "BAA_RECOVER_ACCOUNT", "BAA_RESEND_OTP", "BAA_RESET_PASSWORD", "BAA_VERIFY_OTP", "BAA_SIGN_OUT", "BAA_SYNC_PREFERENCES", "BAA_SAVE_PREFERENCES"].includes(message?.type)) {
    const senderPage = typeof sender.url === "string" ? sender.url.split(/[?#]/, 1)[0] : "";
    const trusted = sender.id === chrome.runtime.id && ["settings/settings.html", "popup/popup.html"].some(path => senderPage === chrome.runtime.getURL(path));
    if (!trusted) { sendResponse({ error: "ACCOUNT_ACCESS_DENIED" }); return; }
    accountsReady.then(async manager => {
      if (!manager) throw new Error("ACCOUNT_NOT_CONFIGURED");
      if (message.type === "BAA_GET_ACCOUNT_STATUS") return { account: await manager.getStatus() };
      if (message.type === "BAA_SIGN_IN") return manager.signIn(message.email, message.password);
      if (message.type === "BAA_SIGN_UP") return manager.signUp(message.email, message.password);
      if (message.type === "BAA_RECOVER_ACCOUNT") return manager.recover(message.email);
      if (message.type === "BAA_RESEND_OTP") return manager.resendOtp();
      if (message.type === "BAA_RESET_PASSWORD") return manager.resetPassword(message.password);
      if (message.type === "BAA_VERIFY_OTP") return manager.verifyOtp(message.email, message.token, message.purpose);
      if (message.type === "BAA_SIGN_OUT") return manager.signOut();
      if (message.type === "BAA_SYNC_PREFERENCES") return { account: await manager.sync() };
      return manager.save(message.preferences);
    }).then(sendResponse).catch(error => sendResponse({ error: error.message || "ACCOUNT_SERVICE_ERROR" }));
    return true;
  }
  if (message?.target === "voice-offscreen") return;
  if (["BAA_VOICE_START", "BAA_VOICE_STOP", "BAA_VOICE_CANCEL"].includes(message?.type)) {
    handleVoiceControl(message, sender).then(sendResponse).catch(() => sendResponse({ error: "VOICE_EXTENSION_UNAVAILABLE" }));
    return true;
  }
  if (["BAA_VOICE_CAPTURED", "BAA_VOICE_CAPTURE_PROCESSING", "BAA_VOICE_CAPTURE_ERROR"].includes(message?.type)) {
    if (sender.url !== chrome.runtime.getURL("voice/offscreen.html")) return;
    handleVoiceCapture(message).then(sendResponse).catch(() => sendResponse({ error: "VOICE_EXTENSION_UNAVAILABLE" }));
    return true;
  }
  if (message?.type === "BAA_SUMMARIZE_PAGE") {
    summarizePage(message, sender).then(sendResponse).catch(error => sendResponse({ error: error.message || "SUMMARY_FAILED" }));
    return true;
  }
  if (message?.type === "BAA_CANCEL_SUMMARY") {
    summaryRequests.get(`${sender.tab?.id ?? "extension"}:${message.requestId}`)?.abort();
    sendResponse({ cancelled: true }); return;
  }
  if (message?.type === "BAA_GET_PREFERENCES") {
    if (globalThis.BAA_ACCOUNTS) accountsReady.then(manager => manager.getPreferences()).then(sendResponse).catch(() => sendResponse({ ...DEFAULTS }));
    else chrome.storage.local.get(DEFAULTS, sendResponse);
    return true;
  }
  if (message?.type === "BAA_TRANSLATE_BATCH") {
    translateBatch(message.items, message.verbosity).then(sendResponse).catch((error) => sendResponse({ error: error.message || "AI_TRANSLATION_FAILED" }));
    return true;
  }
  if (message?.type === "BAA_ANALYZE_IMAGE") {
    analyzeImage(message).then(sendResponse).catch((error) => {
      const code = error.message || "IMAGE_ANALYSIS_FAILED";
      console.warn(`Image analysis failed: ${code}`);
      sendResponse({ error: code });
    });
    return true;
  }
});

function validVoiceDestinations(destinations) {
  return Array.isArray(destinations) && destinations.length > 0 && destinations.length <= 200 &&
    destinations.every((entry, index) => entry?.id === `d${index + 1}` && entry.number === index + 1 &&
      typeof entry.label === "string" && entry.label.trim() && entry.label.length <= 400);
}
async function ensureVoiceOffscreen() {
  if (!offscreenCreating) offscreenCreating = (async () => {
    if (!await chrome.offscreen.hasDocument()) await chrome.offscreen.createDocument({
      url: "voice/offscreen.html", reasons: ["USER_MEDIA"], justification: "Capture one user-requested, ten-second Bangla navigation command."
    });
  })().finally(() => { offscreenCreating = null; });
  return offscreenCreating;
}
async function voiceEvent(session, detail) {
  if (voiceSession !== session) return;
  await chrome.tabs.sendMessage(session.tabId, { type: "BAA_VOICE_EVENT", requestId: session.requestId, ...detail },
    { frameId: session.frameId }).catch(() => cancelVoice(session));
}
async function cancelVoice(session) {
  if (voiceSession !== session) return;
  voiceSession = null; clearTimeout(session.timer); session.controller.abort();
  await chrome.runtime.sendMessage({ target: "voice-offscreen", type: "BAA_CAPTURE_CANCEL", requestId: session.requestId }).catch(() => {});
}
async function handleVoiceControl(message, sender) {
  if (!sender.tab || sender.frameId !== 0 || !/^voice-\d+-\d+$/.test(message.requestId || "")) return { error: "INVALID_VOICE_REQUEST" };
  if (message.type !== "BAA_VOICE_START") {
    const session = voiceSession;
    if (!session || session.tabId !== sender.tab.id || session.frameId !== sender.frameId || session.requestId !== message.requestId) return { cancelled: true };
    if (message.type === "BAA_VOICE_CANCEL") { await cancelVoice(session); return { cancelled: true }; }
    return chrome.runtime.sendMessage({ target: "voice-offscreen", type: "BAA_CAPTURE_STOP", requestId: session.requestId });
  }
  if (!validVoiceDestinations(message.destinations)) return { error: "INVALID_VOICE_DESTINATIONS" };
  if (voiceSession) return { error: "VOICE_BUSY" };
  // Reserve before any await: immediate cancellation must also stop pending preference/permission work.
  const session = { tabId: sender.tab.id, frameId: sender.frameId, requestId: message.requestId,
    destinations: message.destinations.map(({ id, number, label }) => ({ id, number, label })), controller: new AbortController(), timer: null };
  voiceSession = session;
  session.timer = setTimeout(async () => { await voiceEvent(session, { error: "VOICE_TIMEOUT" }); await cancelVoice(session); }, 150000);
  try {
    const preferences = await chrome.storage.local.get(DEFAULTS);
    if (voiceSession !== session) return { error: "VOICE_CANCELLED" };
    if (preferences.baaAssistantEnabled === false) { await cancelVoice(session); return { error: "ASSISTANT_DISABLED" }; }
    await ensureVoiceOffscreen();
    if (voiceSession !== session) return { error: "VOICE_CANCELLED" };
    const response = await chrome.runtime.sendMessage({ target: "voice-offscreen", type: "BAA_CAPTURE_START", requestId: session.requestId });
    if (response?.error) {
      await cancelVoice(session);
      if (response.error === "MIC_PERMISSION_REQUIRED") await chrome.tabs.create({ url: chrome.runtime.getURL("voice/microphone.html") });
    }
    return response || { error: "VOICE_RECORDING_FAILED" };
  } catch { await cancelVoice(session); return { error: "MIC_UNAVAILABLE" }; }
}
async function handleVoiceCapture(message) {
  const session = voiceSession;
  if (!session || session.requestId !== message.requestId) return { cancelled: true };
  if (message.type === "BAA_VOICE_CAPTURE_PROCESSING") { await voiceEvent(session, { stage: "processing" }); return { ok: true }; }
  if (message.type === "BAA_VOICE_CAPTURE_ERROR") {
    await voiceEvent(session, { error: message.error }); await cancelVoice(session); return { ok: true };
  }
  if (session.processing) return { error: "VOICE_ALREADY_PROCESSING" };
  session.processing = true;
  try {
    if (message.mimeType !== "audio/wav" || typeof message.audioBase64 !== "string" || message.audioBase64.length > 900000) throw new Error("INVALID_VOICE_AUDIO");
    const preferences = await chrome.storage.local.get(DEFAULTS);
    if (preferences.baaAssistantEnabled === false) throw new Error("ASSISTANT_DISABLED");
    const backendUrl = String(preferences.baaBackendUrl || DEFAULTS.baaBackendUrl).replace(/\/$/, "");
    const response = await fetch(`${backendUrl}/api/v1/assist/voice-navigation`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: session.controller.signal,
      body: JSON.stringify({ audioBase64: message.audioBase64, mimeType: message.mimeType, destinations: session.destinations })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "VOICE_SERVICE_UNAVAILABLE");
    if (!result || !["match", "no_match"].includes(result.result) ||
        (result.result === "match" ? !session.destinations.some(entry => entry.id === result.destination_id) : result.destination_id !== null)) throw new Error("INVALID_VOICE_VERDICT");
    // Only the verdict crosses back; provider transcript remains temporary on the backend.
    await voiceEvent(session, { result: { result: result.result, destination_id: result.destination_id } });
  } catch (error) {
    if (!session.controller.signal.aborted) await voiceEvent(session, { error: error.message || "VOICE_SERVICE_UNAVAILABLE" });
  } finally { await cancelVoice(session); }
  return { ok: true };
}
chrome.tabs?.onRemoved?.addListener(tabId => { if (voiceSession?.tabId === tabId) cancelVoice(voiceSession); });
chrome.tabs?.onUpdated?.addListener((tabId, change) => { if (change.status === "loading" && voiceSession?.tabId === tabId) cancelVoice(voiceSession); });
chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area === "local" && changes.baaAssistantEnabled?.newValue === false && voiceSession) cancelVoice(voiceSession);
});

async function summarizePage(message, sender = {}) {
  if (!/^summary-[\d-]+$/.test(message.requestId || "") || !message.context?.regions?.length) throw new Error("INVALID_SUMMARY_REQUEST");
  const key = `${sender.tab?.id ?? "extension"}:${message.requestId}`;
  if (summaryRequests.has(key)) throw new Error("SUMMARY_ALREADY_RUNNING");
  const controller = new AbortController();
  summaryRequests.set(key, controller);
  const timer = setTimeout(() => controller.abort(), 160000);
  try {
    const preferences = await chrome.storage.local.get(DEFAULTS);
    if (preferences.baaAiSummaryEnabled === false) throw new Error("SUMMARY_AI_DISABLED");
    const backendUrl = String(preferences.baaBackendUrl || DEFAULTS.baaBackendUrl).replace(/\/$/, "");
    const response = await fetch(`${backendUrl}/api/v1/assist/page-summary`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify(message.context)
    });
    if (!response.ok) throw new Error("SUMMARY_SERVICE_UNAVAILABLE");
    const payload = await response.json();
    const regionIds = new Set(message.context.regions.map(region => region.id));
    const sourceIds = new Set(message.context.regions.flatMap(region => region.blocks.map(block => block.id)));
    const returnedIds = Array.isArray(payload.sections) ? payload.sections.flatMap(section => section.source_ids || []) : [];
    if (typeof payload.summary_bn !== "string" || payload.summary_bn.length > 32000 || !/[\u0980-\u09FF]/.test(payload.summary_bn) ||
        !Array.isArray(payload.sections) || !payload.sections.length || payload.sections.some(section => !regionIds.has(section.region_id) ||
          !Array.isArray(section.source_ids) || section.source_ids.some(id => !sourceIds.has(id))) ||
        new Set(returnedIds).size !== sourceIds.size || returnedIds.length !== sourceIds.size) throw new Error("INVALID_SUMMARY_RESPONSE");
    return payload;
  } finally { clearTimeout(timer); summaryRequests.delete(key); }
}

async function analyzeImage(message) {
  if (!["ocr", "describe"].includes(message.mode)) throw new Error("INVALID_IMAGE_MODE");
  const preferences = await chrome.storage.local.get(DEFAULTS);
  let imageResponse;
  try { imageResponse = await fetch(String(message.imageUrl)); }
  catch { throw new Error("IMAGE_FETCH_FAILED"); }
  if (!imageResponse.ok) throw new Error(`IMAGE_HTTP_${imageResponse.status}`);
  const blob = await prepareImageBlob(await imageResponse.blob(), message.mode);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  const imageDataUrl = `data:${blob.type};base64,${btoa(binary)}`;
  const backendUrl = String(preferences.baaBackendUrl || DEFAULTS.baaBackendUrl).replace(/\/$/, "");
  const response = await fetch(`${backendUrl}/api/v1/assist/image-analysis`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: message.mode, imageDataUrl, context: String(message.context || "").slice(0, 300) })
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    throw new Error(failure.error || `BACKEND_HTTP_${response.status}`);
  }
  const payload = await response.json();
  if (!/[\u0980-\u09FF]/u.test(payload?.text || "")) throw new Error("INVALID_BACKEND_RESPONSE");
  return payload;
}

async function prepareImageBlob(blob, mode) {
  if (!blob.size || blob.size > 32_000_000) throw new Error("IMAGE_TOO_LARGE");
  let bitmap;
  try { bitmap = await createImageBitmap(blob); }
  catch { throw new Error("IMAGE_DECODE_FAILED"); }
  try {
    const maxDimension = mode === "ocr" ? 2048 : 1600;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const supported = /^image\/(png|jpeg|webp)$/u.test(blob.type);
    if (supported && blob.size <= 4_000_000 && scale === 1) return blob;
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // PNG preserves screenshot text; JPEG bounds the size of large photos.
    if (mode === "ocr") {
      const png = await canvas.convertToBlob({ type: "image/png" });
      if (png.size <= 4_000_000) return png;
    }
    const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    if (jpeg.size > 4_000_000) throw new Error("IMAGE_TOO_LARGE");
    return jpeg;
  } finally { bitmap.close(); }
}

async function translateBatch(items, requestedVerbosity) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw new Error("INVALID_TRANSLATION_BATCH");
  const preferences = await chrome.storage.local.get(DEFAULTS);
  const verbosity = ["concise", "balanced", "detailed"].includes(requestedVerbosity) ? requestedVerbosity : preferences.baaTranslationVerbosity;
  if (!preferences.baaAiTranslationEnabled) throw new Error("AI_TRANSLATION_DISABLED");

  const translations = [];
  const missing = [];
  let providerMetadata = { provider: "cache", model: null, failedProviders: [] };
  for (const item of items) {
    const cacheKey = `${verbosity}\n${item.context}\n${item.text}`;
    const cached = translationCache.get(cacheKey);
    if (cached) translations.push({ id: item.id, translatedText: cached });
    else missing.push({ ...item, cacheKey });
  }

  while (missing.length > 0) {
    const batch = [];
    let characters = 0;
    while (missing.length > 0 && batch.length < 20) {
      if (batch.length > 0 && characters + missing[0].text.length > 1200) break;
      const item = missing.shift();
      batch.push(item);
      characters += item.text.length;
    }
    const backendUrl = String(preferences.baaBackendUrl || DEFAULTS.baaBackendUrl).replace(/\/$/, "");
    const response = await fetch(`${backendUrl}/api/v1/assist/translation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verbosity, items: batch.map(({ id, text, context }) => ({ id, text, context })) })
    });
    if (!response.ok) throw new Error(`BACKEND_HTTP_${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.translations) || payload.translations.length !== batch.length) throw new Error("INCOMPLETE_BACKEND_RESPONSE");
    const seen = new Set();
    for (const translation of payload.translations) {
      const source = batch.find((item) => item.id === translation.id);
      if (!source || seen.has(translation.id) || typeof translation.translatedText !== "string" ||
          !/[\u0980-\u09FF]/u.test(translation.translatedText)) throw new Error("INVALID_BACKEND_RESPONSE");
      seen.add(translation.id);
    }
    providerMetadata = {
      provider: String(payload.provider || "unknown"),
      model: payload.model ? String(payload.model) : null,
      failedProviders: Array.isArray(payload.failedProviders) ? payload.failedProviders.map(String) : []
    };
    for (const translation of payload.translations) {
      const source = batch.find((item) => item.id === translation.id);
      translationCache.set(source.cacheKey, translation.translatedText);
      translations.push(translation);
    }
    while (translationCache.size > 500) translationCache.delete(translationCache.keys().next().value);
  }
  return { translations, ...providerMetadata };
}
