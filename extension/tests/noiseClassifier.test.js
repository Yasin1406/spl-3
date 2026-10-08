import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

async function classifier() {
  const sandbox = vm.createContext({ BAA_CONTENT_PROTECTION: {
    inspect: element => ({ protected: Boolean(element.guard), reasons: element.guard ? ["CRITICAL_TEXT"] : [] }),
    attribute: (element, name) => element.attributes[name] || "",
    evidence: element => ({ text: element.text })
  } });
  vm.runInContext(await readFile(new URL("../src/content/noiseClassifier.js", import.meta.url), "utf8"), sandbox);
  return sandbox.BAA_NOISE_CLASSIFIER;
}
function region(attributes = {}, options = {}) {
  const element = {
    localName: "aside", attributes, text: options.text || "", guard: options.guard,
    children: [{ localName: "p", children: [] }],
    closest: () => null, matches: () => true, contains: candidate => candidate === options.child,
    querySelectorAll: () => (options.links || []).map(href => ({ getAttribute: () => href }))
  };
  return { element, type: "complementary", label: "Region" };
}

test("noise scoring requires promotional evidence and the documented threshold", async () => {
  const model = await classifier();
  const ordinary = region({ id: "address-directory" });
  const explicit = region({ class: "sponsored" });
  const result = model.classify([ordinary, explicit]);
  assert.equal(model.threshold, 0.8);
  assert.equal(result[0].lowPriority, false);
  assert.equal(result[1].lowPriority, true);
  assert.equal(result[1].noiseScore, 0.95);
  assert.equal(ordinary.lowPriority, undefined, "Classification mutated the inventory");
});

test("repeated structures alone never qualify but repeated promotional link groups can", async () => {
  const model = await classifier();
  const plain = [region(), region(), region()];
  assert.ok(model.classify(plain).every(entry => !entry.lowPriority));
  const promotional = [region({}, { text: "Sponsored", links: ["/one", "/two"] }), region({}, { text: "Sponsored", links: ["/one", "/two"] }), region({}, { text: "Sponsored", links: ["/one", "/two"] })];
  assert.ok(model.classify(promotional).every(entry => entry.lowPriority));
});

test("protected parents override high scores in both child regions and headings", async () => {
  const model = await classifier();
  const child = region({ class: "sponsored" });
  const parent = region({ class: "sponsored" }, { guard: true, child: child.element });
  const heading = { element: {}, type: "heading" };
  const guardedHeadingParent = region({ class: "sponsored" }, { guard: true, child: heading.element });
  const results = model.classify([parent, child, guardedHeadingParent, heading]);
  assert.ok(results.every(entry => entry.protected && !entry.lowPriority));
});
