import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function loadScript(relativePath, context = {}) {
  const source = await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
  const sandbox = vm.createContext({ ...context, globalThis: null });
  sandbox.globalThis = sandbox;
  vm.runInContext(source, sandbox, { filename: relativePath });
  return sandbox;
}

function fakeElement(attributes = {}) {
  const values = new Map(Object.entries(attributes));
  return {
    tagName: "INPUT",
    hasAttribute: (name) => values.has(name),
    getAttribute: (name) => values.get(name) ?? null,
    setAttribute: (name, value) => values.set(name, String(value)),
    removeAttribute: (name) => values.delete(name)
  };
}

test("reason codes are stable strings", async () => {
  const sandbox = await loadScript("src/content/reasonCodes.js");
  assert.equal(sandbox.BAA_REASON_CODES.MISSING_ACCESSIBLE_NAME, "MISSING_ACCESSIBLE_NAME");
});

test("adaptation registry applies and rolls back an attribute", async () => {
  const sandbox = await loadScript("src/content/adaptationRegistry.js");
  const registry = sandbox.BAA_ADAPTATION_REGISTRY.createRegistry();
  const element = fakeElement();
  registry.applyAttribute({ element, attribute: "aria-labelledby", value: "label-1", reasonCode: "MISSING_ACCESSIBLE_NAME" });
  assert.equal(element.getAttribute("aria-labelledby"), "label-1");
  assert.equal(registry.size, 1);
  registry.rollbackAll();
  assert.equal(element.getAttribute("aria-labelledby"), null);
  assert.equal(element.getAttribute("data-baa-adapted"), null);
  assert.equal(registry.size, 0);
});

test("adaptation registry restores a previous value", async () => {
  const sandbox = await loadScript("src/content/adaptationRegistry.js");
  const registry = sandbox.BAA_ADAPTATION_REGISTRY.createRegistry();
  const element = fakeElement({ "aria-label": "Original" });
  registry.applyAttribute({ element, attribute: "aria-label", value: "Temporary", reasonCode: "TEST" });
  registry.rollbackAll();
  assert.equal(element.getAttribute("aria-label"), "Original");
});

test("accessible-name resolver preserves aria-labelledby before aria-label", async () => {
  const label = { textContent: "Account settings" };
  const element = {
    tagName: "BUTTON",
    textContent: "Visible text",
    labels: [],
    ownerDocument: { getElementById: (id) => id === "settings-label" ? label : null },
    getAttribute: (name) => ({ "aria-labelledby": "settings-label", "aria-label": "Fallback" })[name] || null
  };
  const sandbox = await loadScript("src/content/accessibilityCore.js");
  const result = sandbox.BAA_ACCESSIBILITY_CORE.accessibleNameSource(element);
  assert.equal(result.name, "Account settings");
  assert.equal(result.source, "aria-labelledby");
});

test("accessible-name resolver uses visible text without AI", async () => {
  const element = {
    tagName: "BUTTON",
    textContent: "Submit",
    labels: [],
    ownerDocument: { getElementById: () => null },
    getAttribute: () => null
  };
  const sandbox = await loadScript("src/content/accessibilityCore.js");
  assert.deepEqual(
    { ...sandbox.BAA_ACCESSIBILITY_CORE.accessibleNameSource(element) },
    { name: "Submit", source: "visible-text" }
  );
});

test("rule translator does not produce partially translated mixed-language text", async () => {
  const dictionarySource = await readFile(new URL("../src/content/banglaDictionary.js", import.meta.url), "utf8");
  const translatorSource = await readFile(new URL("../src/content/domTranslator.js", import.meta.url), "utf8");
  const sandbox = vm.createContext({ globalThis: null, window: null });
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInContext(dictionarySource, sandbox);
  vm.runInContext(translatorSource, sandbox);
  assert.equal(sandbox.BAA_DOM_TRANSLATOR.translateText("Account registration"), "Account registration");
  assert.equal(sandbox.BAA_DOM_TRANSLATOR.translateText("Create account"), "অ্যাকাউন্ট তৈরি করুন");
});
