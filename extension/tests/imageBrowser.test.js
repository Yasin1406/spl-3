import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
const chromePath = process.env.BAA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function browserChecks() {
  const check = (value, message) => { if (!value) throw new Error(message); };
  const wait = () => new Promise(resolve => setTimeout(resolve, 20));
  const reporter = document.getElementById("test-result");
  try {
    const image = document.getElementById("image"), other = document.getElementById("other"), announcements = [];
    const registry = BAA_ADAPTATION_REGISTRY.createRegistry();
    let count = 0, held;
    const assistant = BAA_IMAGE_ASSISTANT.createImageAssistant({ documentRef: document, registry, reasons: BAA_REASON_CODES,
      announcer: { announce(text) { announcements.push(text); } },
      sendMessage: async message => { if (held) return new Promise(resolve => { held.resolve = resolve; }); return { text: `Result ${++count} ${message.mode}` }; }
    });
    const press = code => image.dispatchEvent(new KeyboardEvent("keydown", { code, altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    assistant.start(); image.focus(); press("KeyD"); await wait();
    const node = image.__baaImageDescriptionNode;
    check(announcements.filter(text => text === "Result 1 describe").length === 1, "Description result not announced once");
    check(image.getAttribute("aria-describedby") === "authored" && !node.textContent, "Focused description changed alongside live announcement");
    check(node.hidden && getComputedStyle(node).display === "none", "Cached description exposed as separate browse text");
    other.focus(); await wait();
    check(image.getAttribute("aria-describedby") === `authored ${node.id}` && node.textContent === "Result 1 describe", "Blur did not associate cached result/preserve authored description");
    image.focus(); press("KeyO"); await wait();
    check(announcements.filter(text => text === "Result 2 ocr").length === 1, "OCR result not announced once");
    check(node.textContent === "Result 1 describe", "Focused cached description updated during OCR announcement");
    other.focus(); await wait(); check(node.textContent === "Result 2 ocr", "Repeated result not cached after blur");
    other.focus(); image.dispatchEvent(new Event("pointerover", { bubbles: true }));
    other.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", altKey: true, shiftKey: true, bubbles: true })); await wait();
    check(node.textContent === "Result 3 describe" && announcements.filter(text => text === node.textContent).length === 1, "Hovered result was lost or repeated");
    image.focus(); held = {}; press("KeyD"); await wait();
    const before = announcements.length;
    assistant.stop(); registry.rollbackAll(); held.resolve({ text: "Late result" }); await wait();
    check(announcements.length === before && !image.__baaImageDescriptionNode && !node.isConnected, "Late response announced or recreated cached description after disable");
    check(image.getAttribute("aria-describedby") === "authored", "Authored description not restored");
    reporter.textContent = btoa(JSON.stringify({ ok: true }));
  } catch (error) { reporter.textContent = btoa(JSON.stringify({ ok: false, error: error.message, stack: error.stack })); }
}

test("Chrome image results announce once and defer hidden cached descriptions until blur", { skip: !existsSync(chromePath) }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "baa-image-test-"));
  try {
    const scripts = await Promise.all(["reasonCodes", "adaptationRegistry", "imageAssistant"].map(file => readFile(new URL(`../src/content/${file}.js`, import.meta.url), "utf8")));
    const page = join(directory, "image.html");
    await writeFile(page, '<!doctype html><html><body><span id="authored" hidden>Original description</span><img id="image" alt="Image" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" tabindex="0" aria-describedby="authored"><button id="other">Other control</button><pre id="test-result"></pre>' + scripts.map(source => `<script>${source}</script>`).join("\n") + `<script>(${browserChecks.toString()})();</script></body></html>`);
    const browser = spawnSync(chromePath, ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--user-data-dir=" + join(directory, "profile"), "--virtual-time-budget=5000", "--dump-dom", pathToFileURL(page).href], { encoding: "utf8", timeout: 45000, maxBuffer: 2_000_000, windowsHide: true });
    assert.ifError(browser.error); assert.equal(browser.status, 0, browser.stderr.slice(-1200));
    const encoded = browser.stdout.match(/<pre id="test-result"[^>]*>([A-Za-z0-9+/=]+)<\/pre>/)?.[1];
    assert.ok(encoded, "Image checks did not finish");
    const report = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    assert.equal(report.ok, true, JSON.stringify(report));
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});
