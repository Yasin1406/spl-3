import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
const source = await readFile(new URL("../src/voice/offscreen.js", import.meta.url), "utf8");
function capture(getUserMedia) {
  let listener, recorder, tracksStopped = 0;
  const events = [];
  const stream = { getTracks: () => [{ stop() { tracksStopped++; } }] };
  const sandbox = vm.createContext({ Blob, Uint8Array, DataView, setTimeout, clearTimeout,
    navigator: { mediaDevices: { getUserMedia: () => getUserMedia ? getUserMedia(stream) : Promise.resolve(stream) } },
    chrome: { runtime: { id: "extension", onMessage: { addListener(value) { listener = value; } },
      async sendMessage(message) { events.push(message); return {}; } } },
    btoa: value => Buffer.from(value, "binary").toString("base64"),
    AudioContext: class { async decodeAudioData() { return { duration: 0.5 }; } async close() {} },
    OfflineAudioContext: class { constructor(_channels, length) { this.length = length; } createBufferSource() { return { connect() {}, start() {} }; } async startRendering() { return { getChannelData: () => new Float32Array(this.length).fill(0.1) }; } },
    MediaRecorder: class {
      constructor() { recorder = this; this.state = "inactive"; }
      start() { this.state = "recording"; }
      stop() { this.state = "inactive"; this.ondataavailable({ data: new Blob(["test"]) }); this.onstop(); }
    }
  });
  vm.runInContext(source, sandbox);
  const send = message => new Promise(resolve => listener({ target: "voice-offscreen", requestId: "voice-123-1", ...message }, { id: "extension" }, resolve));
  return { send, events, get recorder() { return recorder; }, get stopped() { return tracksStopped; } };
}
test("offscreen stop releases microphone and emits bounded mono 16 kHz WAV", async () => {
  const instance = capture(); assert.equal((await instance.send({ type: "BAA_CAPTURE_START" })).recording, true);
  await instance.send({ type: "BAA_CAPTURE_STOP" });
  for (let index = 0; index < 20 && instance.events.length < 2; index++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(instance.stopped > 0);
  const captured = instance.events.find(event => event.type === "BAA_VOICE_CAPTURED"); assert.ok(captured);
  const wav = Buffer.from(captured.audioBase64, "base64");
  assert.equal(wav.toString("ascii", 0, 4), "RIFF"); assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt32LE(40), 16000);
});
test("offscreen cancellation discards audio and stops every track", async () => {
  const instance = capture(); await instance.send({ type: "BAA_CAPTURE_START" }); await instance.send({ type: "BAA_CAPTURE_CANCEL" });
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(instance.stopped > 0); assert.equal(instance.events.length, 0);
});
test("cancelling pending microphone acquisition stops a late stream without starting a recorder", async () => {
  let allow;
  const instance = capture(stream => new Promise(resolve => { allow = () => resolve(stream); }));
  const pending = instance.send({ type: "BAA_CAPTURE_START" });
  await instance.send({ type: "BAA_CAPTURE_CANCEL" }); allow();
  assert.equal((await pending).error, "VOICE_CANCELLED"); assert.ok(instance.stopped > 0); assert.equal(instance.recorder, undefined);
});
