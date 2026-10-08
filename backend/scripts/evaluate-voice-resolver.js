// Explicit live evaluation only; never invoked by npm test. Uses synthetic labels and transcripts.
// Run from backend: node --env-file=.env scripts/evaluate-voice-resolver.js
import { readFile } from "node:fs/promises";
import { createProviderVoiceNavigationService } from "../src/services/providerVoiceNavigation.js";
const fixture = JSON.parse(await readFile(new URL("../tests/fixtures/voiceResolverCases.json", import.meta.url), "utf8"));
let failures = 0;
for (const entry of fixture.cases) {
  let requests = 0;
  const service = createProviderVoiceNavigationService({ environment: { ...process.env, VOICE_STT_PROVIDER_ORDER: "gemini" },
    logger: {}, fetchImpl: async (...args) => {
      if (++requests === 1) return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ transcript: entry.transcript }) }] } }] }) };
      return fetch(...args);
    } });
  try {
    const result = await service({ audio: Buffer.alloc(44), mimeType: "audio/wav", silent: false, destinations: fixture.destinations });
    const passed = result.destination_id === entry.expected && result.result === (entry.expected ? "match" : "no_match");
    if (!passed) failures++;
    console.log(JSON.stringify({ test: entry.name, passed, expected: entry.expected, actual: result.destination_id, result: result.result }));
  } catch (error) { failures++; console.log(JSON.stringify({ test: entry.name, passed: false, error: error.code || error.name })); }
}
console.log(JSON.stringify({ cases: fixture.cases.length, failures }));
if (failures) process.exitCode = 1;
