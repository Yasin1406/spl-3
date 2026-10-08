import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const files = ["content/keybindings", "background/account", "background/serviceWorker"];
const sources = await Promise.all(files.map(file => readFile(new URL(`../src/${file}.js`, import.meta.url), "utf8")));
async function worker() {
  let listener, protectedStorage = false, stored = {};
  const changes = [], broadcasts = [], network = [];
  const sandbox = vm.createContext({ AbortSignal, setTimeout, clearTimeout, Date, fetch: async url => {
    network.push(url); return { ok: true, status: 200, json: async () => ({}) };
  }, chrome: {
    runtime: { id: "test-extension", getURL: path => `chrome-extension://test-extension/${path}`,
      onInstalled: { addListener() {} }, onMessage: { addListener(callback) { listener = callback; } } },
    storage: { local: {
      async setAccessLevel({ accessLevel }) { protectedStorage = accessLevel === "TRUSTED_CONTEXTS"; },
      get(query, callback) { const values = query === null ? structuredClone(stored) : typeof query === "string" ? { [query]: structuredClone(stored[query]) } : { ...structuredClone(query), ...structuredClone(stored) }; if (callback) callback(values); return Promise.resolve(values); },
      async set(values) {
        assert.ok(protectedStorage, "Private state persisted before protecting local storage");
        const event = Object.fromEntries(Object.entries(values).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(stored[key])).map(([key, value]) => [key, { oldValue: stored[key], newValue: structuredClone(value) }]));
        stored = { ...stored, ...structuredClone(values) }; changes.forEach(callback => callback(event, "local"));
      }, async remove(key) { delete stored[key]; }
    }, onChanged: { addListener(callback) { changes.push(callback); } } },
    alarms: { create() {}, onAlarm: { addListener() {} } },
    tabs: { query: async () => [{ id: 1 }], sendMessage: async (_id, message) => { broadcasts.push(message); } }
  } });
  sandbox.importScripts = () => {
    sandbox.BAA_SUPABASE_CONFIG = { url: "https://project.supabase.co", publishableKey: "sb_publishable_test" };
    vm.runInContext(sources[0], sandbox); vm.runInContext(sources[1], sandbox);
  };
  vm.runInContext(sources[2], sandbox);
  await vm.runInContext("accountsReady", sandbox); await new Promise(resolve => setImmediate(resolve));
  const trusted = { id: "test-extension", url: "chrome-extension://test-extension/settings/settings.html" };
  const page = { id: "test-extension", url: "https://website.test", tab: { id: 1 } };
  function send(message, sender = trusted) { return new Promise(resolve => listener(message, sender, resolve)); }
  return { send, page, broadcasts, network, get stored() { return stored; } };
}

test("account actions and preference writes reject page/content and external senders", async () => {
  const f = await worker();
  for (const type of ["BAA_SIGN_IN", "BAA_SIGN_UP", "BAA_RECOVER_ACCOUNT", "BAA_RESEND_OTP", "BAA_RESET_PASSWORD", "BAA_VERIFY_OTP", "BAA_SIGN_OUT", "BAA_GET_ACCOUNT_STATUS", "BAA_SAVE_PREFERENCES", "BAA_SYNC_PREFERENCES"]) {
    assert.equal((await f.send({ type, email: "one@example.test", preferences: { baaAssistantEnabled: false } }, f.page)).error, "ACCOUNT_ACCESS_DENIED");
    assert.equal((await f.send({ type }, { id: "different-extension", url: "chrome-extension://test-extension/settings/settings.html" })).error, "ACCOUNT_ACCESS_DENIED");
  }
  assert.equal(f.network.length, 0); assert.equal(f.stored.baaAssistantEnabled, true);
});

test("trusted guest saves work and content preference reads/broadcasts exclude private account state", async () => {
  const f = await worker();
  assert.equal((await f.send({ type: "BAA_SAVE_PREFERENCES", preferences: { baaSummaryDetail: "brief" } })).saved, true);
  const preferences = await f.send({ type: "BAA_GET_PREFERENCES" }, f.page);
  assert.equal(preferences.baaSummaryDetail, "brief");
  assert.equal(preferences.baaAccountPrivate, undefined);
  await new Promise(resolve => setImmediate(resolve));
  assert.doesNotMatch(JSON.stringify(f.broadcasts), /baaAccountPrivate|baaAccountStatus|access_token|refresh_token/);
  assert.equal(f.network.length, 0);
});

test("settings opened at the popup's account fragment remains a trusted account page", async () => {
  const f = await worker();
  const response = await f.send({ type: "BAA_GET_ACCOUNT_STATUS" }, { id: "test-extension", url: "chrome-extension://test-extension/settings/settings.html#accountSection" });
  assert.equal(response.account.signedIn, false); assert.equal(response.error, undefined);
});
