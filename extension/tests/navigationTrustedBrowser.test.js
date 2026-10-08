import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
const chromePath = process.env.BAA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

test("trusted Chrome key events consume access keys and early site handlers without changing page", { skip: !existsSync(chromePath), timeout: 40000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "baa-navigation-trusted-"));
  let browser, socket;
  const pending = new Map();
  try {
    const shortcut = (await readFile(new URL("../src/content/keybindings.js", import.meta.url), "utf8")) + "\n" + (await readFile(new URL("../src/content/navigationShortcut.js", import.meta.url), "utf8"));
    const sources = await Promise.all(["accessibilityCore", "navigationModel", "focusManager", "voiceNavigation", "navigationAssistant"].map(name => readFile(new URL(`../src/content/${name}.js`, import.meta.url), "utf8")));
    const page = join(directory, "trusted.html");
    await writeFile(page, `<!doctype html><html><head><meta charset="utf-8"><script>${shortcut}</script><script>
      window.pageKeys=[];window.accessClicks=0;
      window.voiceRequests=[];window.chrome={runtime:{onMessage:{addListener(){},removeListener(){}},sendMessage(message,callback){voiceRequests.push(message);if(message.type==='BAA_VOICE_START')window.voiceStartReply=()=>callback({recording:true});else callback({processing:true});}}};
      for(const type of ['keydown','keypress','keyup']) window.addEventListener(type,event=>{
        if(event.code==='KeyZ'){pageKeys.push(type); if(type==='keyup')location.hash='site-navigation';}
      },true);
      </script></head><body><a id="home" accesskey="z" href="#home-navigation" onclick="accessClicks++">Home</a>
      <main><h1>Generic article</h1><p>Article content</p></main>
      ${sources.map(source => `<script>${source}</script>`).join("\n")}
      <script>window.assistant=BAA_NAVIGATION_ASSISTANT.createNavigationAssistant({documentRef:document});assistant.start();</script></body></html>`);
    const profile = join(directory, "profile");
    browser = spawn(chromePath, ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank"], { windowsHide: true, stdio: "ignore" });
    const exited = new Promise(resolve => browser.once("exit", resolve));
    let portFile;
    for (let i = 0; i < 100; i++) {
      try { portFile = await readFile(join(profile, "DevToolsActivePort"), "utf8"); break; } catch { await delay(100); }
    }
    assert.ok(portFile, "Chrome debugging endpoint did not start");
    const [port, path] = portFile.trim().split(/\r?\n/);
    socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
    let sequence = 0;
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const item = pending.get(message.id); if (!item) return;
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
    });
    function call(method, params = {}, sessionId) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout: " + method)); }, 8000);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, sessionId }));
      });
    }
    const { targetId } = await call("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
    await call("Page.enable", {}, sessionId);
    await call("Page.navigate", { url: pathToFileURL(page).href }, sessionId);
    async function evaluate(expression) {
      const result = await call("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
    }
    for (let i = 0; i < 60 && !await evaluate("Boolean(window.assistant)"); i++) await delay(50);
    assert.equal(await evaluate("Boolean(window.assistant)"), true);
    async function press() {
      await call("Input.dispatchKeyEvent", { type: "keyDown", modifiers: 9, code: "KeyZ", key: "Z", windowsVirtualKeyCode: 90, text: "Z", unmodifiedText: "z" }, sessionId);
      await call("Input.dispatchKeyEvent", { type: "keyUp", modifiers: 0, code: "KeyZ", key: "z", windowsVirtualKeyCode: 90 }, sessionId);
    }
    const original = await evaluate("location.href");
    await press();
    assert.equal(await evaluate("document.querySelector('[data-baa-navigator]').shadowRoot.querySelector('dialog').open"), true);
    assert.equal(await evaluate("location.href"), original);
    assert.deepEqual(await evaluate("pageKeys"), []);
    assert.equal(await evaluate("accessClicks"), 0);
    assert.equal(await evaluate("document.getElementById('home').hasAttribute('accesskey')"), false);
    await evaluate("window.voiceShadow=document.querySelector('[data-baa-navigator]').shadowRoot;window.voiceButton=voiceShadow.getElementById('voiceStart');window.voiceLabel=voiceButton.firstChild");
    await call("Input.dispatchKeyEvent", { type: "keyDown", modifiers: 9, code: "KeyV", key: "V", windowsVirtualKeyCode: 86 }, sessionId);
    await call("Input.dispatchKeyEvent", { type: "keyUp", modifiers: 0, code: "KeyV", key: "v", windowsVirtualKeyCode: 86 }, sessionId);
    assert.equal(await evaluate("voiceShadow.activeElement===voiceButton && voiceRequests.length===0"), true, "Alt+Shift+V should focus without starting capture");
    async function enter() {
      await call("Input.dispatchKeyEvent", { type: "keyDown", modifiers: 0, code: "Enter", key: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" }, sessionId);
      await call("Input.dispatchKeyEvent", { type: "keyUp", modifiers: 0, code: "Enter", key: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
    }
    await enter();
    assert.equal(await evaluate("voiceRequests.filter(message=>message.type==='BAA_VOICE_START').length"), 1);
    let voiceAccessibleId, voiceTextAccessibleId;
    async function assertAvailableButton(label) {
      const { nodes } = await call("Accessibility.getFullAXTree", {}, sessionId);
      const button = nodes.find(node => node.role?.value === "button" && node.name?.value === label);
      assert.ok(button, "Voice button missing from accessibility tree: " + label);
      if (voiceAccessibleId) assert.equal(button.nodeId, voiceAccessibleId, "Voice button accessibility identity changed");
      voiceAccessibleId = button.nodeId;
      const text = nodes.find(node => node.parentId === button.nodeId && node.role?.value === "StaticText");
      assert.ok(text, "Voice label missing from accessibility tree");
      if (voiceTextAccessibleId) assert.equal(text.nodeId, voiceTextAccessibleId, "Voice label accessibility identity changed");
      voiceTextAccessibleId = text.nodeId;
      assert.ok(!button.properties?.some(property => property.name === "disabled" && property.value?.value === true), "Voice button is exposed as unavailable");
      assert.equal(await evaluate("voiceShadow.activeElement===voiceButton && voiceButton.firstChild===voiceLabel && !voiceButton.disabled && !voiceButton.hasAttribute('aria-disabled')"), true);
    }
    await assertAvailableButton("মাইক্রোফোন চালু হচ্ছে…");
    await enter();
    assert.equal(await evaluate("voiceRequests.filter(message=>message.type==='BAA_VOICE_START').length"), 1, "Repeated Enter during startup started another recording");
    await evaluate("voiceStartReply()");
    assert.equal(await evaluate("voiceShadow.activeElement===voiceButton && voiceButton.textContent.includes('রেকর্ডিং শেষ করুন')"), true);
    await assertAvailableButton("রেকর্ডিং শেষ করুন");
    await enter();
    assert.equal(await evaluate("voiceRequests.filter(message=>message.type==='BAA_VOICE_STOP').length"), 1);
    await assertAvailableButton("মিল খোঁজা হচ্ছে…");
    await enter();
    assert.equal(await evaluate("voiceRequests.filter(message=>message.type==='BAA_VOICE_STOP').length"), 1, "Repeated Enter during processing sent another stop request");
    await evaluate("const dynamic=document.createElement('a'); dynamic.id='dynamic'; dynamic.setAttribute('accesskey','x Z'); dynamic.href='#dynamic'; document.body.append(dynamic)");
    await delay(50);
    assert.equal(await evaluate("document.getElementById('dynamic').getAttribute('accesskey')"), "x");
    await evaluate("document.getElementById('dynamic').setAttribute('accesskey','q z')");
    await delay(50);
    assert.equal(await evaluate("document.getElementById('dynamic').getAttribute('accesskey')"), "q");
    await evaluate("assistant.stop()");
    assert.equal(await evaluate("document.getElementById('home').getAttribute('accesskey')"), "z");
    assert.equal(await evaluate("document.getElementById('dynamic').getAttribute('accesskey')"), "q z");
    await press();
    assert.ok((await evaluate("pageKeys")).length > 0, "Page key handling was not restored after disablement");
    assert.ok(await evaluate("accessClicks > 0"), "Native access-key activation was not restored after disablement");
    // Optional downloaded layouts exercise the full extension without coupling the fix to any site.
    if (process.env.BAA_NAVIGATION_LAYOUT_FIXTURE || process.env.BAA_NAVIGATION_LAYOUT_URL) {
      const layoutUrlToLoad = process.env.BAA_NAVIGATION_LAYOUT_URL || pathToFileURL(process.env.BAA_NAVIGATION_LAYOUT_FIXTURE).href;
      const navigation = await call("Page.navigate", { url: layoutUrlToLoad }, sessionId);
      assert.equal(navigation.errorText, undefined, "Could not load requested layout: " + navigation.errorText);
      for (let i = 0; i < 100 && await evaluate("document.readyState") !== "complete"; i++) await delay(50);
      const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"));
      const extensionSources = await Promise.all(manifest.content_scripts.flatMap(entry => entry.js).map(file => readFile(new URL("../src/" + file, import.meta.url), "utf8")));
      await evaluate(`window.chrome={storage:{local:{get(defaults,callback){callback(defaults);}},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(){}},sendMessage(message,callback){callback({});}}};` + extensionSources.join("\n"));
      const layoutUrl = await evaluate("location.href");
      await press();
      assert.equal(await evaluate("document.querySelector('[data-baa-navigator]').shadowRoot.querySelector('dialog').open"), true, "Full extension did not open on downloaded layout");
      assert.equal(await evaluate("location.href"), layoutUrl, "Downloaded layout navigated on shortcut");
    }
    await call("Browser.close"); await exited;
  } finally {
    socket?.close();
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error("Browser closed")); }
    if (browser && browser.exitCode === null) { browser.kill(); await new Promise(resolve => browser.once("exit", resolve)); }
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
