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

test("adaptation registry supports multiple attributes on one element", async () => {
  const sandbox = await loadScript("src/content/adaptationRegistry.js");
  const registry = sandbox.BAA_ADAPTATION_REGISTRY.createRegistry();
  const element = fakeElement();
  registry.applyAttribute({ element, attribute: "aria-labelledby", value: "label-1", reasonCode: "TEST" });
  registry.applyAttribute({ element, attribute: "aria-describedby", value: "help-1", reasonCode: "TEST" });
  assert.equal(registry.size, 2);
  registry.rollbackAll();
  assert.equal(element.getAttribute("aria-labelledby"), null);
  assert.equal(element.getAttribute("aria-describedby"), null);
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

async function loadFormAssistant() {
  const sandbox = vm.createContext({ globalThis: null });
  sandbox.globalThis = sandbox;
  for (const file of ["reasonCodes.js", "accessibilityCore.js", "formAssistant.js"]) {
    const source = await readFile(new URL(`../src/content/${file}`, import.meta.url), "utf8");
    vm.runInContext(source, sandbox, { filename: file });
  }
  return sandbox.BAA_FORM_ASSISTANT;
}

function fakeFormControl(attributes, overrides = {}) {
  return {
    type: attributes.type || "text",
    required: Boolean(attributes.required),
    pattern: attributes.pattern || "",
    minLength: -1,
    maxLength: -1,
    getAttribute: (name) => Object.hasOwn(attributes, name) ? String(attributes[name]) : null,
    ...overrides
  };
}

test("form guidance explains required email and length constraints in Bangla", async () => {
  const assistant = await loadFormAssistant();
  const guidance = assistant.buildBanglaGuidance(fakeFormControl({ type: "email", required: true, minlength: 8, maxlength: 40 }));
  assert.equal(guidance.coverage, 1);
  assert.equal(guidance.requiresAi, false);
  assert.match(guidance.message, /বাধ্যতামূলক/);
  assert.match(guidance.message, /ইমেইল/);
  assert.match(guidance.message, /৮টি/);
  assert.match(guidance.message, /৪০টি/);
});

test("form guidance marks an unknown pattern for AI fallback", async () => {
  const assistant = await loadFormAssistant();
  const guidance = assistant.buildBanglaGuidance(fakeFormControl({ pattern: "^[a-f]{3}$" }));
  assert.equal(guidance.coverage, 0);
  assert.equal(guidance.requiresAi, true);
});

test("form guidance preserves combined password requirements", async () => {
  const assistant = await loadFormAssistant();
  const guidance = assistant.buildBanglaGuidance(fakeFormControl({
    type: "password",
    required: true,
    minlength: 8,
    pattern: "(?=.*[A-Z])(?=.*\\d)(?=.*[!@#$]).{8,}"
  }));
  assert.equal(guidance.coverage, 1);
  assert.match(guidance.message, /৮টি/);
  assert.match(guidance.message, /বড় হাতের/);
  assert.match(guidance.message, /সংখ্যা/);
  assert.match(guidance.message, /বিশেষ চিহ্ন/);
});

test("invalid guidance reports only the active email error", async () => {
  const assistant = await loadFormAssistant();
  const control = fakeFormControl(
    { type: "email", required: true },
    { validity: { valid: false, valueMissing: false, typeMismatch: true } }
  );
  const message = assistant.buildInvalidGuidance(control);
  assert.match(message, /ইমেইল/);
  assert.doesNotMatch(message, /বাধ্যতামূলক/);
});

test("form assistant sets and clears only extension-owned native validation messages", async () => {
  const assistant = await loadFormAssistant();
  const owned = new Set();
  let message = "";
  const control = {
    validity: { customError: false },
    setCustomValidity(value) {
      message = value;
      this.validity.customError = Boolean(value);
    }
  };
  assert.equal(assistant.setBanglaCustomValidity(control, "সঠিক ইমেইল ঠিকানা লিখুন।", owned), true);
  assert.equal(message, "সঠিক ইমেইল ঠিকানা লিখুন।");
  assert.equal(assistant.clearBanglaCustomValidity(control, owned), true);
  assert.equal(message, "");

  control.setCustomValidity("Page-provided error");
  assert.equal(assistant.setBanglaCustomValidity(control, "বাংলা বার্তা", owned), false);
  assert.equal(message, "Page-provided error");
});
