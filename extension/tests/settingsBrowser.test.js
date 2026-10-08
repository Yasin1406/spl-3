import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
const chromePath = process.env.BAA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function browserChecks() {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const reporter = document.createElement("pre"); reporter.id = "test-result"; document.body.append(reporter);
  try {
    const form = document.getElementById("settingsForm"), input = document.getElementById("shortcut-navigator");
    const save = () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    check(document.querySelectorAll(".shortcut-row input").length === 6, "Missing action fields");
    check(input.value === "Alt+Shift+Q", "Stored custom binding not loaded");
    input.value = "Alt+Shift+A"; save(); check(writes.length === 0 && document.activeElement === input, "Default conflict was saved");
    input.value = "Alt+Shift+B"; save(); check(writes.length === 0, "Browser reserved shortcut was saved");
    input.value = "Ctrl+W"; save(); check(writes.length === 0, "Unsafe shortcut was saved");
    input.value = "";
    input.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE", key: "এ", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    check(input.value === "Alt+Shift+E", "Shortcut capture failed with Bangla layout");
    save(); check(writes.at(-1).baaCustomKeybindings.navigator === "Alt+Shift+E", "Custom binding not persisted");
    check(document.querySelector('[data-shortcut="navigator"]').textContent === "Alt+Shift+E", "Saved hint is stale");
    document.getElementById("shortcut-voice").value = "Alt+Shift+E"; save(); check(writes.length === 1, "Custom/custom conflict saved");
    document.getElementById("resetKeybindings").click();
    check(Object.keys(stored.baaCustomKeybindings).length === 1, "Reset saved prematurely");
    save(); check(Object.keys(stored.baaCustomKeybindings).length === 0, "Defaults not restored");
    check(document.querySelector('[data-shortcut="navigator"]').textContent === "Alt+Shift+Z", "Reset hint is stale");
    reporter.textContent = btoa(JSON.stringify({ ok: true }));
  } catch (error) { reporter.textContent = btoa(JSON.stringify({ ok: false, error: error.message, stack: error.stack })); }
}

test("Chrome settings capture, persistence, conflict rejection, hints and default reset", { skip: !existsSync(chromePath) }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "baa-settings-test-"));
  try {
    const [html, keys, settings] = await Promise.all(["src/settings/settings.html", "src/content/keybindings.js", "src/settings/settings.js"].map(file => readFile(new URL("../" + file, import.meta.url), "utf8")));
    const setup = `const writes=[],changed=[];let stored={baaCustomKeybindings:{navigator:'Alt+Shift+Q'}};
      window.chrome={runtime:{sendMessage(message,callback){if(message.type==='BAA_GET_PREFERENCES')callback(stored);else if(message.type==='BAA_SAVE_PREFERENCES'){chrome.storage.local.set(message.preferences,()=>callback({saved:true,account:{signedIn:false}}));}}},storage:{local:{get(defaults,callback){callback({...defaults,...stored});},set(values,callback){writes.push(values);stored={...stored,...values};changed.forEach(listener=>listener({baaCustomKeybindings:{newValue:values.baaCustomKeybindings}},'local'));callback();}},onChanged:{addListener(callback){changed.push(callback);}}}};`;
    const page = join(directory, "settings.html");
    await writeFile(page, html.replace('<script src="../content/keybindings.js"></script>', `<script>${setup}</script><script>${keys}</script>`).replace('<script src="settings.js"></script>', `<script>${settings}</script><script>(${browserChecks.toString()})();</script>`).replace('<script src="account.js"></script>', ''));
    const browser = spawnSync(chromePath, ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--user-data-dir=" + join(directory, "profile"), "--virtual-time-budget=5000", "--dump-dom", pathToFileURL(page).href], { encoding: "utf8", timeout: 45000, maxBuffer: 2_000_000, windowsHide: true });
    assert.ifError(browser.error); assert.equal(browser.status, 0, browser.stderr.slice(-1200));
    const encoded = browser.stdout.match(/<pre id="test-result"[^>]*>([A-Za-z0-9+/=]+)<\/pre>/)?.[1];
    assert.ok(encoded, "Settings checks did not finish");
    const report = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    assert.equal(report.ok, true, JSON.stringify(report));
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});
