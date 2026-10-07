import { validateProviderTranslations } from "../validators/translation.js";
import { providerRequestOptions } from "./providerPolicy.js";

const PROVIDER_DEFINITIONS = Object.freeze({
  groq: Object.freeze({ endpoint: "https://api.groq.com/openai/v1/chat/completions", keyVariable: "GROQ_API_KEY", modelVariable: "GROQ_MODEL", defaultModel: "qwen/qwen3.8-27b" }),
  mistral: Object.freeze({ endpoint: "https://api.mistral.ai/v1/chat/completions", keyVariable: "MISTRAL_API_KEY", modelVariable: "MISTRAL_MODEL", defaultModel: "mistral-small-2603" }),
  cerebras: Object.freeze({ endpoint: "https://api.cerebras.ai/v1/chat/completions", keyVariable: "CEREBRAS_API_KEY", modelVariable: "CEREBRAS_MODEL", defaultModel: "gpt-oss-120b" })
});

const SYSTEM_PROMPT = "You are a Bangla web accessibility translation module. Translate only the supplied text into natural, understandable Bangla. Preserve product names, names, numbers, dates, requirements, warnings, links, and functional meaning. Never invent or remove facts, actions, or instructions. Return JSON only with this exact shape: {\"translations\":[{\"id\":\"the supplied id\",\"translatedText\":\"Bangla translation\"}]}. Return exactly one translation for every supplied id, preserve each id exactly, and do not use Markdown fences.";
const VERBOSITY_INSTRUCTIONS = Object.freeze({
  concise: "Use concise, task-oriented Bangla. Remove redundancy but preserve every essential fact and constraint.",
  balanced: "Use natural Bangla with approximately the same level of detail as the source.",
  detailed: "Use clear Bangla and add only short clarifying wording when it improves accessibility; do not add new facts."
});

export function providersFromEnvironment(environment) {
  const requestedOrder = String(environment.AI_PROVIDER_ORDER || "groq,mistral,cerebras")
    .split(",").map((name) => name.trim().toLowerCase()).filter(Boolean);
  const seen = new Set();
  const providers = [];
  for (const name of requestedOrder) {
    const definition = PROVIDER_DEFINITIONS[name];
    if (!definition || seen.has(name)) continue;
    seen.add(name);
    const apiKey = String(environment[definition.keyVariable] || "").trim();
    if (!apiKey) continue;
    providers.push({ name, apiKey, endpoint: definition.endpoint, model: String(environment[definition.modelVariable] || "").trim() || definition.defaultModel });
  }
  return providers;
}

export function createProviderTranslationService({ providers, fetchImpl = fetch, timeoutMs = 15000, logger = console }) {
  if (!Array.isArray(providers) || providers.length === 0) throw new Error("At least one AI provider is required");

  return async function translateBatch(items, options = {}) {
    const verbosity = VERBOSITY_INSTRUCTIONS[options.verbosity] ? options.verbosity : "balanced";
    const attempts = [];
    for (const provider of providers) {
      const startedAt = Date.now();
      try {
        const translations = await requestProvider({ provider, items, verbosity, fetchImpl, timeoutMs });
        const failedBefore = attempts.length > 0 ? attempts.map((attempt) => attempt.provider).join(",") : "none";
        logger.info?.(`Translation provider ${provider.name} succeeded: model=${provider.model} items=${items.length} durationMs=${Date.now() - startedAt} failedBefore=${failedBefore}`);
        return { translations, provider: provider.name, model: provider.model, failedProviders: attempts.map((attempt) => attempt.provider) };
      } catch (error) {
        attempts.push({ provider: provider.name, reason: safeReason(error) });
        logger.warn?.(`Translation provider ${provider.name} failed: ${safeReason(error)} model=${provider.model}`);
      }
    }
    const error = new Error("ALL_TRANSLATION_PROVIDERS_FAILED");
    error.status = 503;
    error.code = "ALL_TRANSLATION_PROVIDERS_FAILED";
    error.attempts = attempts;
    throw error;
  };
}

async function requestProvider({ provider, items, verbosity, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(provider.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${provider.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT} ${VERBOSITY_INSTRUCTIONS[verbosity]}` },
          { role: "user", content: JSON.stringify({ task: "translate_to_bangla", items }) }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        // Bangla needs more output tokens than similarly sized English text; include JSON overhead.
        max_tokens: Math.min(8192, Math.max(1200, items.reduce((total, item) => total + item.text.length * 3 + 80, 0))),
        stream: false,
        ...providerRequestOptions(provider)
      })
    });
    if (!response.ok) throw providerError(response.status);
    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    return validateProviderTranslations(parseJson(content), items);
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(text) {
  if (typeof text !== "string" || !text.trim()) throw invalidResponse();
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(normalized); }
  catch { throw invalidResponse(); }
}

function safeReason(error) {
  if (error?.name === "AbortError") return "TIMEOUT";
  return String(error?.code || error?.message || "PROVIDER_ERROR").replace(/[^A-Z0-9_-]/gi, "_").slice(0, 80);
}

function invalidResponse() {
  const error = new Error("INVALID_AI_RESPONSE");
  error.code = "INVALID_AI_RESPONSE";
  return error;
}

function providerError(status) {
  const error = new Error(`HTTP_${status}`);
  error.code = `HTTP_${status}`;
  return error;
}
