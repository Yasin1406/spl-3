const BANGLA_PATTERN = /[\u0980-\u09FF]/u;
const PROHIBITED_PATTERN = /<\/?(?:script|style)|javascript:|```/iu;

export function validateTranslationRequest(body) {
  if (!body || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    throw requestError("INVALID_TRANSLATION_BATCH");
  }

  const ids = new Set();
  return body.items.map((item) => {
    const id = cleanString(item?.id, 80);
    const text = cleanString(item?.text, 500);
    const context = cleanString(item?.context || "page text", 160);
    if (!id || !text || ids.has(id)) throw requestError("INVALID_TRANSLATION_ITEM");
    ids.add(id);
    return { id, text, context };
  });
}

export function validateProviderTranslations(payload, sourceItems) {
  if (!payload || !Array.isArray(payload.translations)) throw serviceError("INVALID_AI_RESPONSE");
  const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
  const seen = new Set();
  const translations = payload.translations.map((item) => {
    const id = cleanString(item?.id, 80);
    const translatedText = cleanString(item?.translatedText, 1000);
    if (!sourceById.has(id) || seen.has(id) || !translatedText || !BANGLA_PATTERN.test(translatedText) || PROHIBITED_PATTERN.test(translatedText)) {
      throw serviceError("INVALID_AI_RESPONSE");
    }
    if (translatedText.length > Math.max(1000, sourceById.get(id).text.length * 5)) throw serviceError("INVALID_AI_RESPONSE");
    seen.add(id);
    return { id, translatedText };
  });
  if (seen.size !== sourceItems.length) throw serviceError("INCOMPLETE_AI_RESPONSE");
  return translations;
}

function cleanString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function requestError(code) {
  const error = new Error(code);
  error.status = 400;
  error.code = code;
  return error;
}

function serviceError(code) {
  const error = new Error(code);
  error.status = 502;
  error.code = code;
  return error;
}
