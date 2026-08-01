const DEFAULTS = Object.freeze({
  baaAssistantEnabled: true,
  baaTranslationEnabled: false,
  baaAnnouncementDetail: "standard",
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
    translateBatch(message.items).then(sendResponse).catch((error) => sendResponse({ error: error.message || "AI_TRANSLATION_FAILED" }));
    return true;
  }
});

async function translateBatch(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw new Error("INVALID_TRANSLATION_BATCH");
  const preferences = await chrome.storage.local.get(DEFAULTS);
  if (!preferences.baaAiTranslationEnabled) throw new Error("AI_TRANSLATION_DISABLED");

  const translations = [];
  const missing = [];
  let providerMetadata = { provider: "cache", model: null, failedProviders: [] };
  for (const item of items) {
    const cacheKey = `${item.context}\n${item.text}`;
    const cached = translationCache.get(cacheKey);
    if (cached) translations.push({ id: item.id, translatedText: cached });
    else missing.push({ ...item, cacheKey });
  }

  if (missing.length > 0) {
    const backendUrl = String(preferences.baaBackendUrl || DEFAULTS.baaBackendUrl).replace(/\/$/, "");
    const response = await fetch(`${backendUrl}/api/v1/assist/translation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: missing.map(({ id, text, context }) => ({ id, text, context })) })
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
