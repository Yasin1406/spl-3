import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/content/keybindings.js", import.meta.url), "utf8");
function setup(initial = {}, delayed = false) {
  let change, initialReply;
  const context = vm.createContext({ chrome: { storage: {
    local: { get(defaults, callback) { initialReply = () => callback({ ...defaults, baaCustomKeybindings: initial }); if (!delayed) initialReply(); } },
    onChanged: { addListener(callback) { change = callback; } }
  } } });
  vm.runInContext(source, context);
  return { keys: context.BAA_KEYBINDINGS, context, initialReply: () => initialReply(), change: (custom, area = "local") => change({ baaCustomKeybindings: { newValue: custom } }, area) };
}
const event = code => ({ code, altKey: true, shiftKey: true });

test("defaults, custom priority, live updates and reset cover all six actions", () => {
  const { keys, change } = setup();
  const letters = ["Q", "W", "E", "R", "F", "G"];
  const custom = Object.fromEntries(Object.keys(keys.defaults).map((action, index) => [action, `Alt+Shift+${letters[index]}`]));
  for (const [action, binding] of Object.entries(keys.defaults)) assert.ok(keys.matches(action, event(`Key${binding.at(-1)}`)));
  change(custom);
  for (const [action, binding] of Object.entries(custom)) {
    assert.ok(keys.matches(action, event(`Key${binding.at(-1)}`)));
    assert.equal(keys.matches(action, event(`Key${keys.defaults[action].at(-1)}`)), false);
  }
  change({});
  assert.equal(keys.get("navigator"), "Alt+Shift+Z");
});

test("conflicts include defaults and normalized custom bindings; swaps are valid", () => {
  const { keys } = setup();
  assert.ok(keys.validate({ navigator: "alt + shift + a" }).error);
  assert.ok(keys.validate({ navigator: "shift+alt+q", voice: "Alt+Shift+Q" }).error);
  assert.equal(keys.validate({ navigator: "Alt+Shift+V", voice: "Alt+Shift+Z" }).error, undefined);
  assert.ok(keys.validate({ navigator: "Alt+Shift+B" }).error);
  for (const binding of ["Z", "Ctrl+W", "Alt+Shift+Escape", "Alt+Shift+Alt+Q", 1]) assert.ok(keys.validate({ navigator: binding }).error);
  assert.equal(keys.validate({ navigator: "  " }).effective.navigator, keys.defaults.navigator);
  assert.ok(keys.validate(null).error);
});

test("physical keys work on Bangla layouts and reject extra modifiers/composition", () => {
  const { keys } = setup({ navigator: "Alt+Shift+1" });
  assert.ok(keys.matches("navigator", { ...event("Digit1"), key: "১" }));
  for (const extra of [{ ctrlKey: true }, { metaKey: true }, { isComposing: true }, { shiftKey: false }]) assert.equal(keys.matches("navigator", { ...event("Digit1"), ...extra }), false);
  assert.equal(keys.matches("navigator", event("Numpad1")), false);
});

test("storage rejects invalid sets and ignores stale reads and nonlocal changes", () => {
  const { keys, change, initialReply } = setup({}, true);
  change({ navigator: "Alt+Shift+Q" }); initialReply();
  assert.equal(keys.get("navigator"), "Alt+Shift+Q");
  change({}, "sync"); assert.equal(keys.get("navigator"), "Alt+Shift+Q");
  change({ navigator: "Alt+Shift+A" }); assert.equal(keys.get("navigator"), "Alt+Shift+Z");
});

test("active shortcut hints follow saved changes and can be detached", () => {
  const { keys, change } = setup();
  const element = { tagName: "BUTTON", setAttribute(name, value) { this[name] = value; } };
  const detach = keys.bindHint(element, "navigator");
  change({ navigator: "Alt+Shift+Q" }); assert.equal(element["aria-keyshortcuts"], "Alt+Shift+Q");
  detach(); change({}); assert.equal(element["aria-keyshortcuts"], "Alt+Shift+Q");
});
