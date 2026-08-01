import assert from "node:assert/strict";
import test from "node:test";
import { validateProviderTranslations, validateTranslationRequest } from "../src/validators/translation.js";
import { createProviderTranslationService, providersFromEnvironment } from "../src/services/providerTranslation.js";
import { createApp } from "../src/app.js";

const items = [{ id: "a", text: "Account registration", context: "heading" }];

test("request validator accepts a sanitized bounded batch", () => {
  assert.deepEqual(validateTranslationRequest({ items }), items);
});

test("request validator rejects duplicate ids", () => {
  assert.throws(() => validateTranslationRequest({ items: [{ id: "a", text: "One" }, { id: "a", text: "Two" }] }), /INVALID_TRANSLATION_ITEM/);
});

test("provider output validator rejects output without Bangla script", () => {
  assert.throws(() => validateProviderTranslations({ translations: [{ id: "a", translatedText: "Account" }] }, items), /INVALID_AI_RESPONSE/);
});

test("provider configuration follows order and skips missing keys", () => {
  assert.deepEqual(providersFromEnvironment({
    AI_PROVIDER_ORDER: "cerebras,groq,mistral",
    CEREBRAS_API_KEY: "c-key",
    GROQ_API_KEY: "g-key"
  }).map(({ name, model }) => ({ name, model })), [
    { name: "cerebras", model: "llama3.1-8b" },
    { name: "groq", model: "llama-3.1-8b-instant" }
  ]);
});

test("provider chain falls back after an HTTP failure", async () => {
  const calls = [];
  const logs = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes("groq")) return { ok: false, status: 429 };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"translations":[{"id":"a","translatedText":"অ্যাকাউন্ট নিবন্ধন"}]}' } }] })
    };
  };
  const translate = createProviderTranslationService({
    providers: [
      { name: "groq", apiKey: "groq-secret", endpoint: "https://api.groq.test/chat", model: "groq-model" },
      { name: "mistral", apiKey: "mistral-secret", endpoint: "https://api.mistral.test/chat", model: "mistral-model" }
    ],
    fetchImpl,
    logger: { warn(message) { logs.push(message); }, info(message) { logs.push(message); } }
  });
  const result = await translate(items);
  assert.equal(result.provider, "mistral");
  assert.deepEqual(result.failedProviders, ["groq"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.Authorization, "Bearer groq-secret");
  assert.doesNotMatch(calls[0].options.body, /groq-secret/);
  assert.match(logs[0], /groq failed: HTTP_429/);
  assert.match(logs[1], /mistral succeeded: model=mistral-model items=1/);
  assert.match(logs[1], /failedBefore=groq/);
  assert.doesNotMatch(logs.join(" "), /groq-secret|mistral-secret|Account registration|অ্যাকাউন্ট/);
});

test("provider chain fails safely after every provider fails", async () => {
  const translate = createProviderTranslationService({
    providers: [{ name: "cerebras", apiKey: "key", endpoint: "https://example.test", model: "model" }],
    fetchImpl: async () => ({ ok: false, status: 401 }),
    logger: { warn() {} }
  });
  await assert.rejects(() => translate(items), (error) => error.code === "ALL_TRANSLATION_PROVIDERS_FAILED" && error.attempts[0].provider === "cerebras");
});

test("translation endpoint returns provider metadata", async (context) => {
  const app = createApp({
    translateBatch: async (input) => ({ translations: input.map((item) => ({ id: item.id, translatedText: "বাংলা অনুবাদ" })), provider: "groq", model: "test" })
  });
  const server = app.listen(0, "127.0.0.1");
  context.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/assist/translation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ id: "heading-1", text: "Account registration", context: "heading" }] })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.provider, "groq");
  assert.equal(body.translations[0].translatedText, "বাংলা অনুবাদ");
});
