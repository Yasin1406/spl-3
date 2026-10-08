import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/background/serviceWorker.js", import.meta.url), "utf8");
function worker({ fetchImpl, captureStart = async () => ({ recording: true }) } = {}) {
  let listener;
  const controls = [], events = [], pages = [];
  const sandbox = vm.createContext({ AbortController, setTimeout, clearTimeout, fetch: fetchImpl,
    chrome: { runtime: { id: "extension", getURL: path => `chrome-extension://extension/${path}`,
      onInstalled: { addListener() {} }, onMessage: { addListener(value) { listener = value; } },
      async sendMessage(message) { controls.push(message); return message.type === "BAA_CAPTURE_START" ? captureStart() : { cancelled: true }; } },
      storage: { local: { get: async () => ({ baaAssistantEnabled: true }) } },
      offscreen: { hasDocument: async () => true },
      tabs: { async sendMessage(tabId, message, options) { events.push({ tabId, message, options }); }, async create(value) { pages.push(value); } }
    }
  });
  vm.runInContext(source, sandbox);
  return { sandbox, controls, events, pages, listener };
}
const sender = { tab: { id: 7 }, frameId: 0 };
const startMessage = () => ({ type: "BAA_VOICE_START", requestId: "voice-123-1", destinations: [{ id: "d1", number: 1, label: "হেডার" }] });

test("voice capture is exclusive, cancellation is tab-scoped and aborts its own backend request", async () => {
  let signal;
  const { sandbox, events } = worker({ fetchImpl: async (_url, options) => {
    signal = options.signal;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  } });
  assert.equal((await sandbox.handleVoiceControl(startMessage(), sender)).recording, true);
  assert.equal((await sandbox.handleVoiceControl({ ...startMessage(), requestId: "voice-124-1" }, { tab: { id: 8 }, frameId: 0 })).error, "VOICE_BUSY");
  const pending = sandbox.handleVoiceCapture({ type: "BAA_VOICE_CAPTURED", requestId: "voice-123-1", mimeType: "audio/wav", audioBase64: "audio" });
  await new Promise(resolve => setImmediate(resolve));
  await sandbox.handleVoiceControl({ type: "BAA_VOICE_CANCEL", requestId: "voice-123-1" }, { tab: { id: 8 }, frameId: 0 });
  assert.equal(signal.aborted, false);
  await sandbox.handleVoiceControl({ type: "BAA_VOICE_CANCEL", requestId: "voice-123-1" }, sender);
  await pending; assert.equal(signal.aborted, true); assert.equal(events.length, 0);
});

test("worker rejects unlisted resolver IDs and sends only valid verdicts to the original frame", async () => {
  for (const id of ["d99", "d1"]) {
    const { sandbox, events } = worker({ fetchImpl: async () => ({ ok: true, json: async () => ({ result: "match", destination_id: id, transcript: "private" }) }) });
    await sandbox.handleVoiceControl(startMessage(), sender);
    await sandbox.handleVoiceCapture({ type: "BAA_VOICE_CAPTURED", requestId: "voice-123-1", mimeType: "audio/wav", audioBase64: "audio" });
    assert.equal(events.length, 1); assert.equal(events[0].tabId, 7); assert.equal(events[0].options.frameId, 0);
    assert.equal(events[0].message.result?.destination_id, id === "d1" ? "d1" : undefined);
    assert.equal(events[0].message.error, id === "d99" ? "INVALID_VOICE_VERDICT" : undefined);
    assert.doesNotMatch(JSON.stringify(events), /private/);
  }
});

test("permission setup opens only after microphone denial; forged page capture messages are ignored", async () => {
  const { sandbox, pages, listener } = worker({ captureStart: async () => ({ error: "MIC_PERMISSION_REQUIRED" }) });
  const result = await sandbox.handleVoiceControl(startMessage(), sender);
  assert.equal(result.error, "MIC_PERMISSION_REQUIRED"); assert.equal(pages.length, 1);
  assert.match(pages[0].url, /voice\/microphone.html$/);
  assert.equal(listener({ type: "BAA_VOICE_CAPTURED" }, { ...sender, url: "https://publisher.test" }, () => { throw new Error("forged response"); }), undefined);
});

test("immediate cancellation before preference lookup finishes prevents microphone startup", async () => {
  const { sandbox, controls } = worker();
  let finishLookup;
  sandbox.chrome.storage.local.get = () => new Promise(resolve => { finishLookup = resolve; });
  const pending = sandbox.handleVoiceControl(startMessage(), sender);
  await sandbox.handleVoiceControl({ type: "BAA_VOICE_CANCEL", requestId: "voice-123-1" }, sender);
  finishLookup({ baaAssistantEnabled: true });
  assert.equal((await pending).error, "VOICE_CANCELLED");
  assert.equal(controls.some(message => message.type === "BAA_CAPTURE_START"), false);
});
