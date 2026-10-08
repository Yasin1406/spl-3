import { validateImageAnalysisResult } from "../validators/imageAnalysis.js";
import { providerRequestOptions } from "./providerPolicy.js";

const OCR_DETAIL = Object.freeze({
  brief: { instruction: "Return a brief summary of the readable text in 1-3 sentences, covering only the main message and essential names, numbers, dates, or actions.", maxTokens: 800 },
  standard: { instruction: "Return a balanced summary of the readable text in 4-6 sentences when enough text is present. Include the main message and supporting facts, names, numbers, dates, URLs, and required actions.", maxTokens: 1600 },
  detailed: { instruction: "Return a detailed rendering of all readable text in reading order. Preserve every meaningful fact, name, number, date, URL, and instruction; do not condense it into a short summary.", maxTokens: 3200 }
});

export function visionProvidersFromEnvironment(environment, translationProviders) {
  return translationProviders.flatMap((provider) => {
    const model = String(environment[`${provider.name.toUpperCase()}_VISION_MODEL`] || "").trim();
    return model ? [{ ...provider, model }] : [];
  });
}

export function createProviderImageAnalysisService({ providers, fetchImpl = fetch, timeoutMs = 30000, logger = console }) {
  return async function analyzeImage(input) {
    if (!providers.length) { const error = new Error("NO_VISION_PROVIDER_CONFIGURED"); error.status = 503; error.code = error.message; throw error; }
    const attempts = [];
    for (const provider of providers) {
      const startedAt = Date.now();
      try {
        const text = await requestProvider(provider, input, fetchImpl, timeoutMs);
        logger.info?.(`Image provider ${provider.name} succeeded: model=${provider.model} mode=${input.mode} durationMs=${Date.now() - startedAt}`);
        return { text, mode: input.mode, provider: provider.name, model: provider.model, failedProviders: attempts };
      } catch (error) {
        attempts.push(provider.name);
        logger.warn?.(`Image provider ${provider.name} failed: ${String(error.code || error.message).replace(/[^A-Z0-9_-]/gi, "_").slice(0, 80)}`);
      }
    }
    const error = new Error("ALL_IMAGE_PROVIDERS_FAILED"); error.status = 503; error.code = error.message; error.attempts = attempts.map((provider) => ({ provider })); throw error;
  };
}

async function requestProvider(provider, input, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const detail = OCR_DETAIL[input.detail] || OCR_DETAIL.standard;
  const instruction = input.mode === "ocr"
    ? `Read the image text and return it in natural Bangla. ${detail.instruction} Use fewer sentences if the source is short; never invent details or repeat text to meet a length target. If no text is readable, say so briefly in Bangla.`
    : "Describe the image concisely in Bangla for a blind web user. State meaningful content, action, direction, and visible text; do not speculate.";
  try {
    const response = await fetchImpl(provider.endpoint, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({ model: provider.model, messages: [{ role: "user", content: [
        { type: "text", text: `${instruction}\nNearby context: ${input.context || "none"}\nReturn JSON only: {\"text\":\"Bangla result\"}` },
        { type: "image_url", image_url: { url: input.imageDataUrl } }
      ] }], response_format: { type: "json_object" }, temperature: 0.1, max_tokens: input.mode === "ocr" ? detail.maxTokens : 800,
        ...providerRequestOptions(provider) })
    });
    if (!response.ok) { const error = new Error(`HTTP_${response.status}`); error.code = error.message; throw error; }
    const result = await response.json();
    let payload;
    try { payload = JSON.parse(String(result?.choices?.[0]?.message?.content).trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "")); }
    catch { const error = new Error("INVALID_IMAGE_ANALYSIS_RESPONSE"); error.code = error.message; throw error; }
    return validateImageAnalysisResult(payload);
  } finally { clearTimeout(timeout); }
}
