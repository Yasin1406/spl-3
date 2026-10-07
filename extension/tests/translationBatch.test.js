import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/background/serviceWorker.js", import.meta.url), "utf8");
function worker(fetchImpl) {
  const sandbox = vm.createContext({
    chrome: {
      runtime: { onInstalled: { addListener() {} }, onMessage: { addListener() {} } },
      storage: { local: { get: async () => ({ baaAiTranslationEnabled: true, baaTranslationVerbosity: "balanced" }) } }
    }, fetch: fetchImpl
  });
  vm.runInContext(source, sandbox);
  return sandbox;
}

test("article-sized worker requests stay bounded and return every item, including cache hits", async () => {
  const requests = [];
  const sandbox = worker(async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    return { ok: true, json: async () => ({
      translations: body.items.map(({ id }) => ({ id, translatedText: "বাংলা অনুবাদ" })), provider: "groq"
    }) };
  });
  const items = Array.from({ length: 20 }, (_, index) => ({ id: `part-${index}`, text: `${index} ${"article text ".repeat(40)}`, context: "p" }));
  const result = await sandbox.translateBatch(items);
  assert.equal(result.translations.length, 20);
  assert.ok(requests.length > 1);
  for (const request of requests) assert.ok(request.items.reduce((total, item) => total + item.text.length, 0) <= 1200);
  const calls = requests.length;
  const cached = await sandbox.translateBatch(items.map((item) => ({ ...item, id: `new-${item.id}` })));
  assert.equal(cached.translations.length, 20);
  assert.equal(requests.length, calls);
  assert.ok(cached.translations.every(({ id }) => id.startsWith("new-")));
});

test("incomplete or duplicate responses fail without caching a partially translated batch", async () => {
  for (const incomplete of [true, false]) {
    let broken = true;
    let calls = 0;
    const sandbox = worker(async () => {
      calls += 1;
      return { ok: true, json: async () => ({ translations: broken ?
        (incomplete ? [{ id: "a", translatedText: "বাংলা" }] : [{ id: "a", translatedText: "বাংলা" }, { id: "a", translatedText: "বাংলা" }]) :
        [{ id: "a", translatedText: "বাংলা" }, { id: "b", translatedText: "বাংলা" }] }) };
    });
    const items = [{ id: "a", text: "First paragraph", context: "p" }, { id: "b", text: "Second paragraph", context: "p" }];
    await assert.rejects(() => sandbox.translateBatch(items), /BACKEND_RESPONSE/);
    broken = false;
    assert.equal((await sandbox.translateBatch(items)).translations.length, 2);
    assert.equal(calls, 2);
  }
});
