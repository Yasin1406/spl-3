import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
const source = await readFile(new URL("../src/background/serviceWorker.js", import.meta.url), "utf8");
function worker(fetchImpl) {
  let onMessage;
  const sandbox = vm.createContext({ AbortController, setTimeout, clearTimeout,
    chrome: { runtime: { onInstalled: { addListener() {} }, onMessage: { addListener(listener) { onMessage = listener; } } }, storage: { local: { get: async () => ({}) } } }, fetch: fetchImpl });
  vm.runInContext(source, sandbox);
  return { sandbox, onMessage };
}
const message = () => ({ type: "BAA_SUMMARIZE_PAGE", requestId: "summary-123-1", context: {
  regions: [{ id: "region-1", blocks: [{ id: "source-1", text: "Report" }] }]
} });

test("summary worker sends only the supplied context and rejects missing source coverage", async () => {
  let received;
  const { sandbox } = worker(async (_url, options) => {
    received = JSON.parse(options.body);
    return { ok: true, json: async () => ({ summary_bn: "সারাংশ।", sections: [{ region_id: "region-1", source_ids: [] }] }) };
  });
  await assert.rejects(() => sandbox.summarizePage(message(), { tab: { id: 7 } }), /INVALID_SUMMARY_RESPONSE/);
  assert.equal(received.regions[0].blocks[0].text, "Report");
});

test("summary cancellation is scoped to the requesting tab and aborts its fetch", async () => {
  let signal;
  const { sandbox, onMessage } = worker(async (_url, options) => {
    signal = options.signal;
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("Cancelled")), { once: true }));
  });
  const pending = sandbox.summarizePage(message(), { tab: { id: 7 } });
  await new Promise(resolve => setImmediate(resolve));
  onMessage({ type: "BAA_CANCEL_SUMMARY", requestId: message().requestId }, { tab: { id: 8 } }, () => {});
  assert.equal(signal.aborted, false);
  onMessage({ type: "BAA_CANCEL_SUMMARY", requestId: message().requestId }, { tab: { id: 7 } }, () => {});
  await assert.rejects(() => pending, /Cancelled/);
  assert.equal(signal.aborted, true);
});
