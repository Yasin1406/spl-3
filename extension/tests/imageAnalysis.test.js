import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(new URL("../src/background/serviceWorker.js", import.meta.url), "utf8");
const assistantSource = await readFile(new URL("../src/content/imageAssistant.js", import.meta.url), "utf8");

function worker(overrides = {}) {
  const sandbox = vm.createContext({
    chrome: { runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} } } },
    ...overrides
  });
  vm.runInContext(workerSource, sandbox);
  return sandbox;
}

test("a large local photo is resized and converted before upload", async () => {
  let closed = false;
  const calls = [];
  const output = { size: 250_000, type: "image/jpeg" };
  const sandbox = worker({
    createImageBitmap: async () => ({ width: 4000, height: 3000, close() { closed = true; } }),
    OffscreenCanvas: class {
      constructor(width, height) { calls.push([width, height]); this.width = width; this.height = height; }
      getContext() { return { fillRect() {}, drawImage() {} }; }
      async convertToBlob(options) { calls.push(options); return output; }
    }
  });
  const result = await sandbox.prepareImageBlob({ size: 8_000_000, type: "image/jpeg" }, "describe");
  assert.equal(result, output);
  assert.deepEqual(calls[0], [1600, 1200]);
  assert.equal(calls[1].type, "image/jpeg");
  assert.equal(closed, true);
});

test("small supported images retain their original bytes", async () => {
  let closed = false;
  const sandbox = worker({ createImageBitmap: async () => ({ width: 625, height: 425, close() { closed = true; } }) });
  const blob = { size: 200_000, type: "image/png" };
  assert.equal(await sandbox.prepareImageBlob(blob, "ocr"), blob);
  assert.equal(closed, true);
});

test("decodable images with an unknown MIME type are normalized and OCR preserves PNG", async () => {
  const calls = [];
  const sandbox = worker({
    createImageBitmap: async () => ({ width: 3000, height: 1500, close() {} }),
    OffscreenCanvas: class {
      constructor(width, height) { calls.push([width, height]); this.width = width; this.height = height; }
      getContext() { return { fillRect() {}, drawImage() {} }; }
      async convertToBlob(options) { calls.push(options.type); return { size: 100_000, type: options.type }; }
    }
  });
  const result = await sandbox.prepareImageBlob({ size: 100_000, type: "application/octet-stream" }, "ocr");
  assert.equal(result.type, "image/png");
  assert.deepEqual(calls[0], [2048, 1024]);
});

test("file fetch failures and unreadable image bytes have distinct errors", async () => {
  const sandbox = worker({
    chrome: {
      runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} } },
      storage: { local: { get: async () => ({}) } }
    },
    fetch: async () => { throw new Error("Failed to fetch"); },
    createImageBitmap: async () => { throw new Error("Cannot decode"); }
  });
  await assert.rejects(sandbox.analyzeImage({ mode: "describe", imageUrl: "file:///football.jpg" }), /IMAGE_FETCH_FAILED/);
  await assert.rejects(sandbox.prepareImageBlob({ size: 100 }, "describe"), /IMAGE_DECODE_FAILED/);
});

test("body focus uses the hovered image, while an explicitly focused image takes priority", async () => {
  const listeners = new Map();
  const first = { src: "file:///football.jpg", closest: (selector) => selector === "img" ? first : null };
  const second = { src: "file:///text.png", closest: (selector) => selector === "img" ? second : null };
  const body = { querySelector: () => first };
  const documentRef = {
    body, activeElement: body,
    addEventListener: (name, listener) => listeners.set(name, listener)
  };
  const requests = [];
  const announcements = [];
  const sandbox = vm.createContext({});
  vm.runInContext(assistantSource, sandbox);
  const assistant = sandbox.BAA_IMAGE_ASSISTANT.createImageAssistant({
    documentRef, announcer: { announce: (text) => announcements.push(text) },
    sendMessage: async (message) => { requests.push(message); throw new Error("IMAGE_FETCH_FAILED"); }
  });
  assistant.start();
  listeners.get("pointerover")({ target: second });
  const event = { altKey: true, shiftKey: true, code: "KeyD", preventDefault() {} };
  await listeners.get("keydown")(event);
  assert.equal(requests[0].imageUrl, second.src);
  assert.match(announcements.at(-1), /ফাইল অ্যাক্সেস/);
  assert.equal(sandbox.BAA_LAST_IMAGE_ANALYSIS.error, "IMAGE_FETCH_FAILED");
  documentRef.activeElement = first;
  await listeners.get("keydown")(event);
  assert.equal(requests[1].imageUrl, first.src);
});
