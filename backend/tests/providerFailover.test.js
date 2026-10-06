import assert from "node:assert/strict";
import test from "node:test";
import { createProviderTranslationService, providersFromEnvironment } from "../src/services/providerTranslation.js";
import { createProviderImageAnalysisService, visionProvidersFromEnvironment } from "../src/services/providerImageAnalysis.js";

const providers = providersFromEnvironment({ GROQ_API_KEY: "test-groq", MISTRAL_API_KEY: "test-mistral", CEREBRAS_API_KEY: "test-cerebras" });
const logger = { info() {}, warn() {} };
const items = [{ id: "a", text: "Open settings", context: "button" }];
const translationResponse = () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ translations: [{ id: "a", translatedText: "সেটিংস খুলুন" }] }) } }] }) });
const imageResponse = () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ text: "ছবিতে একটি মানচিত্র আছে।" }) } }] }) });
const providerName = (url) => providers.find((provider) => provider.endpoint === url).name;

test("every successful batch starts at Groq and never calls later providers", async () => {
  const calls = [];
  const translate = createProviderTranslationService({ providers, logger, fetchImpl: async (url, options) => {
    calls.push({ name: providerName(url), body: JSON.parse(options.body) });
    return translationResponse();
  } });
  const results = [];
  for (let index = 0; index < 6; index += 1) results.push((await translate(items)).provider);
  assert.deepEqual(results, Array(6).fill("groq"));
  assert.equal(calls.length, 6);
  assert.equal(calls[0].body.model, "qwen/qwen3.8-27b");
  assert.equal(calls[0].body.reasoning_effort, "none");
});

test("concurrent batches independently start at Groq", async () => {
  const pending = [];
  const translate = createProviderTranslationService({ providers, logger, fetchImpl: (url) => new Promise((resolve) => {
    pending.push({ name: providerName(url), resolve });
  }) });
  const requests = Array.from({ length: 6 }, () => translate(items));
  assert.deepEqual(pending.map(({ name }) => name), Array(6).fill("groq"));
  for (const request of [...pending].reverse()) request.resolve(translationResponse());
  assert.deepEqual((await Promise.all(requests)).map(({ provider }) => provider), pending.map(({ name }) => name));
});

test("Cerebras is called only after Groq and Mistral fail, and the next batch starts at Groq again", async () => {
  const calls = [];
  let failing = false;
  const translate = createProviderTranslationService({ providers, logger, fetchImpl: async (url) => {
    const name = providerName(url);
    calls.push(name);
    return failing && name !== "cerebras" ? { ok: false, status: 503 } : translationResponse();
  } });
  await translate(items);
  failing = true;
  const result = await translate(items);
  assert.equal(result.provider, "cerebras");
  assert.deepEqual(result.failedProviders, ["groq", "mistral"]);
  assert.deepEqual(calls, ["groq", "groq", "mistral", "cerebras"]);
  failing = false;
  assert.equal((await translate(items)).provider, "groq");
});

test("a complete failure attempts each eligible provider once in configured order", async () => {
  let failing = false;
  const calls = [];
  const translate = createProviderTranslationService({ providers, logger, fetchImpl: async (url) => {
    calls.push(providerName(url));
    return failing ? { ok: false, status: 404 } : translationResponse();
  } });
  await translate(items);
  failing = true;
  await assert.rejects(() => translate(items), (error) => {
    assert.equal(error.code, "ALL_TRANSLATION_PROVIDERS_FAILED");
    assert.deepEqual(error.attempts.map(({ provider }) => provider), ["groq", "mistral", "cerebras"]);
    return true;
  });
  assert.deepEqual(calls, ["groq", "groq", "mistral", "cerebras"]);
});

test("ordered failover skips missing keys and deduplicates providers", async () => {
  const configured = providersFromEnvironment({ GROQ_API_KEY: "key", GROQ_MODEL: "   ", AI_PROVIDER_ORDER: "groq,mistral,cerebras,groq" });
  assert.equal(configured.length, 1);
  assert.equal(configured[0].model, "qwen/qwen3.8-27b");
  const translate = createProviderTranslationService({ providers: configured, logger, fetchImpl: async () => translationResponse() });
  assert.deepEqual((await Promise.all([translate(items), translate(items)])).map(({ provider }) => provider), ["groq", "groq"]);
});

test("image requests start at Groq and fall back only after invalid output", async () => {
  const vision = visionProvidersFromEnvironment({ GROQ_VISION_MODEL: "qwen/qwen3.8-27b", MISTRAL_VISION_MODEL: "mistral-small-2603" }, providers);
  const calls = [];
  let invalidGroq = false;
  const analyze = createProviderImageAnalysisService({ providers: vision, logger, fetchImpl: async (url, options) => {
    const name = providerName(url);
    const body = JSON.parse(options.body);
    calls.push(name);
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.messages[0].content[1].image_url.url, "data:image/png;base64,AAAA");
    return invalidGroq && name === "groq" ? { ok: true, json: async () => ({ choices: [{ message: { content: '{"text":"English only"}' } }] }) } : imageResponse();
  } });
  const input = { mode: "describe", imageDataUrl: "data:image/png;base64,AAAA", context: "map" };
  assert.equal((await analyze(input)).provider, "groq");
  assert.equal((await analyze(input)).provider, "groq");
  invalidGroq = true;
  const result = await analyze(input);
  assert.equal(result.provider, "mistral");
  assert.deepEqual(result.failedProviders, ["groq"]);
  assert.deepEqual(calls, ["groq", "groq", "groq", "mistral"]);
});

test("ordered fallback retains economical model-specific reasoning parameters", async () => {
  const bodies = [];
  const translate = createProviderTranslationService({ providers, logger, fetchImpl: async (url, options) => {
    bodies.push(JSON.parse(options.body));
    return providerName(url) === "cerebras" ? translationResponse() : { ok: false, status: 429 };
  } });
  assert.equal((await translate(items)).provider, "cerebras");
  assert.deepEqual(bodies.map(({ model, reasoning_effort }) => ({ model, reasoning_effort })), [
    { model: "qwen/qwen3.8-27b", reasoning_effort: "none" },
    { model: "mistral-small-2603", reasoning_effort: "none" },
    { model: "gpt-oss-120b", reasoning_effort: "low" }
  ]);
});

test("image requests fail safely when no vision provider is configured", async () => {
  const analyze = createProviderImageAnalysisService({ providers: [], logger, fetchImpl: async () => assert.fail("must not call a provider") });
  await assert.rejects(() => analyze({}), (error) => error.code === "NO_VISION_PROVIDER_CONFIGURED");
});
