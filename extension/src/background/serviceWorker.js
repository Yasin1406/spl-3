const DEFAULTS = Object.freeze({
  baaAssistantEnabled: true,
  baaFormGuidanceEnabled: true,
  baaTranslationEnabled: false,
  baaTranslationVerbosity: "balanced",
  baaImageShortcutGuidanceEnabled: true,
  baaAiTranslationEnabled: true,
  baaBackendUrl: "http://127.0.0.1:3000"
});
const translationCache = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (current) => {
    const missing = Object.fromEntries(Object.entries(DEFAULTS).filter(([key]) => current[key] === undefined));
    if (Object.keys(missing).length > 0) chrome.storage.local.set(missing);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "BAA_GET_PREFERENCES") {
    chrome.storage.local.get(DEFAULTS, sendResponse);
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

  if (missing.length > 0) {
    const backendUrl = String(preferences.baaBackendUrl || DEFAULTS.baaBackendUrl).replace(/\/$/, "");
    const response = await fetch(`${backendUrl}/api/v1/assist/translation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verbosity, items: missing.map(({ id, text, context }) => ({ id, text, context })) })
    });
    if (!response.ok) throw new Error(`BACKEND_HTTP_${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.translations)) throw new Error("INVALID_BACKEND_RESPONSE");
    providerMetadata = {
      provider: String(payload.provider || "unknown"),
      model: payload.model ? String(payload.model) : null,
      failedProviders: Array.isArray(payload.failedProviders) ? payload.failedProviders.map(String) : []
    };
    for (const translation of payload.translations) {
      const source = missing.find((item) => item.id === translation.id);
      if (!source || !/[\u0980-\u09FF]/u.test(translation.translatedText || "")) throw new Error("INVALID_BACKEND_RESPONSE");
      translationCache.set(source.cacheKey, translation.translatedText);
      translations.push(translation);
    }
    if (translationCache.size > 500) translationCache.delete(translationCache.keys().next().value);
  }
  return { translations, ...providerMetadata };
}
