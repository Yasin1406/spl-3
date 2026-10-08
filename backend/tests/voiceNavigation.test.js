import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { validateVoiceRequest, validateVoiceVerdict, negativeVoiceCommand } from "../src/validators/voiceNavigation.js";
import { createProviderVoiceNavigationService, voiceProvidersFromEnvironment } from "../src/services/providerVoiceNavigation.js";

function request(silent = false) {
  const audio = Buffer.alloc(16044);
  audio.write("RIFF", 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write("WAVE", 8); audio.write("fmt ", 12);
  audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(16000, 24);
  audio.writeUInt32LE(32000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write("data", 36); audio.writeUInt32LE(audio.length - 44, 40);
  if (!silent) for (let i = 44; i < audio.length; i += 2) audio.writeInt16LE(Math.round(Math.sin(i) * 1000), i);
  return { mimeType: "audio/wav", audioBase64: audio.toString("base64"), destinations: [
    { id: "d1", number: 1, label: "হেডার" }, { id: "d2", number: 2, label: "নেভিগেশন: Personal tools" }
  ] };
}
const gemini = value => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }) });

test("voice request bounds PCM duration, detects silence and excludes page/form data", () => {
  const raw = request(); raw.html = "private"; raw.destinations[0].value = "password";
  const valid = validateVoiceRequest(raw);
  assert.equal(valid.silent, false); assert.equal(validateVoiceRequest(request(true)).silent, true);
  assert.equal(valid.destinations[0].value, undefined); assert.equal(valid.html, undefined);
  for (const mutate of [r => r.destinations.push(r.destinations[0]), r => r.destinations[0].number = 99,
    r => r.audioBase64 = "bad", r => r.mimeType = "audio/webm", r => r.destinations[0].label = "x".repeat(401)]) {
    const invalid = request(); mutate(invalid); assert.throws(() => validateVoiceRequest(invalid), /INVALID_VOICE/);
  }
});

test("verdict rejects arbitrary selectors, unknown IDs, extra actions and inconsistent no_match", () => {
  const entries = request().destinations;
  assert.deepEqual(validateVoiceVerdict({ result: "match", destination_id: "d2" }, entries), { result: "match", destination_id: "d2" });
  for (const bad of [ { result: "match", destination_id: "#submit" }, { result: "match", destination_id: "d9" },
    { result: "no_match", destination_id: "d1" }, { result: "match", destination_id: "d1", action: "click" }]) {
    assert.throws(() => validateVoiceVerdict(bad, entries), /INVALID_VOICE_VERDICT/);
  }
  for (const text of ["ফর্মে যাবেন না", "বন্ধ করুন", "do not go to form"]) assert.equal(negativeVoiceCommand(text), true);
});

test("Gemini receives imperfect transcript and exactly the numbered destinations, then selects a listed ID", async () => {
  const calls = [];
  const service = createProviderVoiceNavigationService({ environment: { GEMINI_API_KEY: "test-key" }, fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    return calls.length === 1 ? gemini({ transcript: "পার্সোনাল তুলসে যান" }) : gemini({ result: "match", destination_id: "d2" });
  } });
  const result = await service(validateVoiceRequest(request()));
  assert.equal(result.destination_id, "d2"); assert.equal(calls.length, 2);
  const supplied = JSON.parse(calls[1].contents[0].parts[0].text);
  assert.equal(supplied.transcript, "পার্সোনাল তুলসে যান"); assert.deepEqual(supplied.destinations, request().destinations);
  assert.match(calls[1].systemInstruction.parts[0].text, /phonetic similarity/);
  assert.equal(calls[1].contents[0].parts.length, 1, "Audio must not be sent to resolver");
});

test("transcription fails over Gemini -> Speechmatics -> Sarvam; resolver remains Gemini", async () => {
  const calls = [];
  const env = { GEMINI_API_KEY: "test", SPEECHMATICS_API_KEY: "test", SARVAM_API_KEY: "test" };
  assert.deepEqual(voiceProvidersFromEnvironment(env).map(p => p.name), ["gemini", "speechmatics", "sarvam"]);
  const service = createProviderVoiceNavigationService({ environment: env, fetchImpl: async (url, options) => {
    calls.push(url);
    if (calls.length <= 2) return { ok: false };
    if (url.includes("sarvam")) {
      assert.equal(options.body.get("language_code"), "bn-IN");
      return { ok: true, json: async () => ({ transcript: "হেডারে যান" }) };
    }
    return gemini({ result: "match", destination_id: "d1" });
  } });
  const result = await service(validateVoiceRequest(request()));
  assert.equal(result.sttProvider, "sarvam"); assert.equal(result.resolverProvider, "gemini");
  assert.equal(calls.length, 4); assert.match(calls[1], /speechmatics/); assert.match(calls[3], /googleapis/);
});

test("silence, empty transcription, negation and resolver no_match do not force matches or unnecessary fallback", async () => {
  for (const transcript of ["", "ফর্মে যাবেন না"]) {
    let count = 0;
    const service = createProviderVoiceNavigationService({ environment: { GEMINI_API_KEY: "test", SARVAM_API_KEY: "test" }, fetchImpl: async () => { count++; return gemini({ transcript }); } });
    const result = await service(validateVoiceRequest(request()));
    assert.equal(result.result, "no_match"); assert.equal(count, 1);
    assert.equal((await service(validateVoiceRequest(request(true)))).result, "no_match"); assert.equal(count, 1);
  }
  let count = 0;
  const service = createProviderVoiceNavigationService({ environment: { GEMINI_API_KEY: "test" }, fetchImpl: async () => ++count === 1 ? gemini({ transcript: "আজ আবহাওয়া কেমন" }) : gemini({ result: "no_match", destination_id: null }) });
  assert.equal((await service(validateVoiceRequest(request()))).result, "no_match");
});

test("Speechmatics polls and deletes the remote job after reading transcription", async () => {
  const calls = [];
  const service = createProviderVoiceNavigationService({ environment: { GEMINI_API_KEY: "test", SPEECHMATICS_API_KEY: "test", VOICE_STT_PROVIDER_ORDER: "speechmatics" }, fetchImpl: async (url, options) => {
    calls.push([url, options.method || "GET"]);
    if (options.method === "DELETE") return { ok: true };
    if (url.includes("googleapis")) return gemini({ result: "match", destination_id: "d1" });
    if (options.method === "POST") return { ok: true, json: async () => ({ id: "job-1" }) };
    if (url.includes("transcript")) return { ok: true, text: async () => "হেডারে যান" };
    return { ok: true, json: async () => ({ job: { status: "done" } }) };
  } });
  assert.equal((await service(validateVoiceRequest(request()))).destination_id, "d1");
  assert.ok(calls.some(([url, method]) => url.endsWith("job-1") && method === "DELETE"));
});

test("cancellation stops transcription fallback and invalid resolver output is rejected", async () => {
  const controller = new AbortController(); let calls = 0;
  const service = createProviderVoiceNavigationService({ environment: { GEMINI_API_KEY: "test", SARVAM_API_KEY: "test" }, fetchImpl: async () => { calls++; controller.abort(); throw new Error("cancelled"); } });
  await assert.rejects(() => service(validateVoiceRequest(request()), { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 1);
  let count = 0;
  const bad = createProviderVoiceNavigationService({ environment: { GEMINI_API_KEY: "test" }, fetchImpl: async () => ++count === 1 ? gemini({ transcript: "হেডারে যান" }) : gemini({ result: "match", destination_id: "d99" }) });
  await assert.rejects(() => bad(validateVoiceRequest(request())), /INVALID_VOICE_VERDICT/);
});

test("resolver quota exhaustion reports its stage and HTTP reason after transcription succeeds", async () => {
  let count = 0;
  const logs = [];
  const service = createProviderVoiceNavigationService({ environment: { GEMINI_API_KEY: "test" },
    logger: { info: text => logs.push(text), warn: text => logs.push(text) }, fetchImpl: async () => {
      if (++count === 1) return gemini({ transcript: "শিরোনাম এক" });
      return { ok: false, status: 429 };
    } });
  await assert.rejects(() => service(validateVoiceRequest(request())), error => error.code === "VOICE_RESOLUTION_RATE_LIMIT" && error.status === 429);
  assert.equal(count, 3, "Only one retry is allowed");
  assert.ok(logs.some(text => text.includes('[Voice transcription][gemini] "শিরোনাম এক"')));
  assert.ok(logs.some(text => text.includes("VOICE_RESOLUTION_RATE_LIMIT") && text.includes("httpStatus=429")));
  assert.doesNotMatch(logs.join("\n"), /test-key|audioBase64/);
});

test("voice endpoint validates before calling provider and bounds repeated requests", async () => {
  let calls = 0;
  const app = createApp({ translateBatch: async () => ({}), navigateVoice: async () => { calls++; return { result: "no_match", destination_id: null }; } });
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/v1/assist/voice-navigation`;
  try {
    assert.equal((await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 400);
    assert.equal(calls, 0);
    for (let index = 0; index < 20; index++) assert.equal((await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request()) })).status, 200);
    assert.equal((await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request()) })).status, 429);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
