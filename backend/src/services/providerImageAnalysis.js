import { validateImageAnalysisResult } from "../validators/imageAnalysis.js";

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
  const instruction = input.mode === "ocr"
    ? "Extract all readable text and return it in natural Bangla. Preserve names, numbers, dates, URLs, and reading order. If no text is readable, say so briefly in Bangla."
    : "Describe the image concisely in Bangla for a blind web user. State meaningful content, action, direction, and visible text; do not speculate.";
  try {
    const response = await fetchImpl(provider.endpoint, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({ model: provider.model, messages: [{ role: "user", content: [
        { type: "text", text: `${instruction}\nNearby context: ${input.context || "none"}\nReturn JSON only: {\"text\":\"Bangla result\"}` },
        { type: "image_url", image_url: { url: input.imageDataUrl } }
      ] }], response_format: { type: "json_object" }, temperature: 0.1, max_tokens: 800 })
    });
    if (!response.ok) { const error = new Error(`HTTP_${response.status}`); error.code = error.message; throw error; }
    const result = await response.json();
    let payload;
    try { payload = JSON.parse(String(result?.choices?.[0]?.message?.content).trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "")); }
    catch { const error = new Error("INVALID_IMAGE_ANALYSIS_RESPONSE"); error.code = error.message; throw error; }
    return validateImageAnalysisResult(payload);
  } finally { clearTimeout(timeout); }
}
