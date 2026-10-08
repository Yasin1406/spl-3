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
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function until(condition) { for (let i = 0; i < 70; i++) { if (condition()) return; await sleep(30); } throw new Error("Timed out"); }
  const result = document.createElement("pre"); result.id = "test-result"; result.dataset.baaOwned = "true"; document.body.append(result);
  try {
    const host = document.querySelector("[data-baa-navigator]"), shadow = host.shadowRoot;
    const dialog = shadow.querySelector("dialog"), category = shadow.getElementById("category"), list = shadow.getElementById("destinations");
    const main = document.querySelector("main"), start = document.getElementById("start"), email = document.getElementById("email");
    const preparedHeadingTabindex = document.getElementById("negative").getAttribute("tabindex");
    // Sensitive field values must never be read by collection or navigation.
    for (const field of [email, document.getElementById("password")]) Object.defineProperty(field, "value", { get() { throw new Error("Field value read"); }, configurable: true });
    const open = () => {
      let response;
      messageListeners.forEach(listener => listener({ type: "BAA_OPEN_NAVIGATOR" }, {}, value => { response = value; }));
      return response;
    };
    const selectCategory = value => { category.value = value; category.dispatchEvent(new Event("change")); };
    const choose = label => {
      const option = [...list.options].find(option => option.textContent.includes(label));
      check(option, "Missing destination " + label); list.value = option.value;
      shadow.getElementById("go").click();
    };
    await sleep(30);
    start.focus();
    const press = (code, key, options = {}) => {
      const event = new KeyboardEvent("keydown", { code, key, altKey: true, shiftKey: true, bubbles: true, cancelable: true, ...options });
      document.dispatchEvent(event); return event;
    };
    check(press("KeyZ", "য").defaultPrevented && dialog.open, "Fixed shortcut did not open synchronously with Bangla input");
    shadow.getElementById("close").click();
    check(!press("KeyX", "X").defaultPrevented && !dialog.open, "Other modified letter was intercepted");
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: false }, { isComposing: true }]) {
      check(!press("KeyZ", "Z", options).defaultPrevented && !dialog.open, "Incorrect modifier/repeat/composition opened navigator");
    }
    const pageEvents = [];
    const pageHandler = event => { if (event.code === "KeyZ") { pageEvents.push(event.type); location.hash = "unexpected-navigation"; } };
    for (const type of ["keydown", "keypress", "keyup"]) window.addEventListener(type, pageHandler, true);
    const beforeGesture = location.href;
    check(press("KeyZ", "Z").defaultPrevented && dialog.open, "Fixed English-layout shortcut failed");
    check(press("KeyZ", "Z", { repeat: true }).defaultPrevented, "Repeated shortcut leaked to page");
    for (const type of ["keypress", "keyup"]) {
      const event = new KeyboardEvent(type, { code: "KeyZ", key: "Z", altKey: type !== "keyup", shiftKey: type !== "keyup", bubbles: true, cancelable: true });
      document.dispatchEvent(event); check(event.defaultPrevented, "Shortcut phase leaked: " + type);
    }
    check(pageEvents.length === 0 && location.href === beforeGesture, "Site handler also acted on shortcut");
    for (const type of ["keydown", "keypress", "keyup"]) window.removeEventListener(type, pageHandler, true);
    shadow.getElementById("close").click();
    check(document.body.firstElementChild === host, "Skip navigation is not at page start");
    check(shadow.getElementById("skipLinks").querySelectorAll("a").length === 5, "Important skip links absent");
    start.focus(); check(open()?.opened, "Runtime command did not open navigator");
    check(dialog.open && shadow.activeElement === category, "Navigator first control was not focused");
    const labels = [...list.options].map(option => option.textContent).join("|");
    // Voice uses only the displayed destinations and the validated resolver's opaque ID.
    const runtimeSend = chrome.runtime.sendMessage;
    const voiceRequests = [];
    chrome.runtime.sendMessage = (message, callback) => {
      voiceRequests.push(message); callback(message.type === "BAA_VOICE_START" ? { recording: true } : { cancelled: true });
    };
    const voiceButton = shadow.getElementById("voiceStart");
    check(!shadow.getElementById("voiceHelp") && !voiceButton.hasAttribute("aria-describedby"), "Removed voice paragraph or stale description reference remains");
    const voiceEvent = (requestId, result) => messageListeners.forEach(listener => listener({ type: "BAA_VOICE_EVENT", requestId, result }, {}, () => {}));
    const voiceAccess = document.createElement("a"); voiceAccess.setAttribute("accesskey", "v"); voiceAccess.href = "#unexpected-voice-access"; document.body.append(voiceAccess);
    await sleep(10);
    check(!voiceAccess.hasAttribute("accesskey"), "Voice access key was not reserved inside navigator");
    check(press("KeyV", "ভ").defaultPrevented, "Voice shortcut did not support physical Bangla keyboard key");
    await sleep(10);
    for (const type of ["keypress", "keyup"]) {
      const event = new KeyboardEvent(type, { code: "KeyV", key: "v", altKey: type !== "keyup", shiftKey: type !== "keyup", bubbles: true, cancelable: true });
      document.dispatchEvent(event); check(event.defaultPrevented, "Voice shortcut leaked a keyboard phase");
    }
    check(shadow.activeElement === voiceButton && !voiceRequests.some(message => message.type === "BAA_VOICE_START"), "Voice shortcut should focus the button without recording");
    voiceButton.click(); await sleep(10);
    check(shadow.activeElement === voiceButton && voiceButton.textContent.includes("রেকর্ডিং শেষ করুন"), "Recording stop button lost focus");
    let voiceRequest = voiceRequests.findLast(message => message.type === "BAA_VOICE_START");
    check(voiceRequest.destinations.length === list.options.length && voiceRequest.destinations[0].number === 1, "Voice list does not match display");
    check(Object.keys(voiceRequest.destinations[0]).sort().join(",") === "id,label,number", "Voice leaked DOM or field values");
    const pendingHeading = document.createElement("h2"); pendingHeading.textContent = "Voice pending heading"; main.append(pendingHeading);
    await sleep(250);
    check(![...list.options].some(option => option.textContent.includes("Voice pending heading")), "Active voice list updated before resolution");
    voiceEvent(voiceRequest.requestId, { result: "no_match", destination_id: null });
    check(dialog.open && shadow.getElementById("voiceStatus").textContent.includes("মিল পাওয়া যায়নি"), "No-match moved focus or closed navigator");
    await until(() => [...list.options].some(option => option.textContent.includes("Voice pending heading")));
    const retainedOption = list.options[0];
    const unrelated = document.createElement("p"); unrelated.textContent = "Unrelated update"; main.append(unrelated);
    await sleep(250);
    check(list.options[0] === retainedOption, "Unchanged idle list unnecessarily replaced options");
    unrelated.remove();
    voiceButton.click(); await sleep(10);
    voiceRequest = voiceRequests.findLast(message => message.type === "BAA_VOICE_START");
    const removedDestination = voiceRequest.destinations.find(entry => entry.label.includes("Voice pending heading"));
    pendingHeading.remove(); await sleep(250);
    voiceEvent(voiceRequest.requestId, { result: "match", destination_id: removedDestination.id });
    check(dialog.open && ![...list.options].some(option => option.textContent.includes("Voice pending heading")), "Removed target was focused or pending updates did not resume");
    voiceButton.click(); await sleep(10);
    voiceRequest = voiceRequests.findLast(message => message.type === "BAA_VOICE_START");
    messageListeners.forEach(listener => listener({ type: "BAA_VOICE_EVENT", requestId: voiceRequest.requestId, error: "VOICE_RESOLUTION_RATE_LIMIT" }, {}, () => {}));
    check(dialog.open && shadow.getElementById("voiceStatus").textContent.includes("অনুরোধসীমা"), "Resolver quota failure was hidden behind a generic error");
    voiceButton.click(); await sleep(10);
    voiceRequest = voiceRequests.findLast(message => message.type === "BAA_VOICE_START");
    voiceEvent(voiceRequest.requestId, { result: "match", destination_id: "d999" });
    check(dialog.open, "Unknown voice destination navigated");
    voiceButton.click(); await sleep(10);
    voiceRequest = voiceRequests.findLast(message => message.type === "BAA_VOICE_START");
    const voiceMain = voiceRequest.destinations.find(entry => entry.label.includes("মূল কনটেন্ট"));
    const frozenOptions = [...list.options];
    const backgroundHeading = document.createElement("h2"); backgroundHeading.textContent = "Voice background heading"; main.append(backgroundHeading);
    await sleep(250);
    check(frozenOptions.length === list.options.length && frozenOptions.every((option, index) => option === list.options[index]), "Background mutation rebuilt the active voice destination list");
    check(!voiceRequests.some(message => message.type === "BAA_VOICE_CANCEL" && message.requestId === voiceRequest.requestId), "Background mutation cancelled voice");
    voiceEvent(voiceRequest.requestId, { result: "match", destination_id: voiceMain.id });
    check(!dialog.open && document.activeElement === main, "Resolver match did not directly focus listed main destination");
    check(getComputedStyle(main).outlineWidth === "3px" && main.style.getPropertyPriority("outline") === "important", "Focused destination has no visible outline");
    backgroundHeading.remove();
    check(voiceAccess.getAttribute("accesskey") === "v", "Voice access key was not restored after navigator closed");
    start.focus(); check(!main.style.outline && !main.style.outlineOffset, "Focus highlight survived blur"); open();
    voiceButton.click(); await sleep(10);
    voiceRequest = voiceRequests.findLast(message => message.type === "BAA_VOICE_START");
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.dispatchEvent(escape);
    check(escape.defaultPrevented && dialog.open, "Escape did not cancel voice before closing navigator");
    voiceEvent(voiceRequest.requestId, { result: "match", destination_id: voiceMain.id });
    check(dialog.open, "Cancelled voice result navigated");
    voiceButton.click(); await sleep(10);
    voiceRequest = voiceRequests.findLast(message => message.type === "BAA_VOICE_START");
    selectCategory("headings");
    voiceEvent(voiceRequest.requestId, { result: "match", destination_id: voiceMain.id });
    check(dialog.open, "Changed category accepted old voice result");
    selectCategory("all");
    voiceAccess.remove();
    chrome.runtime.sendMessage = runtimeSend;
    check(labels.includes("Site navigation (1/2)") && labels.includes("Site navigation (2/2)"), "Duplicate regions indistinguishable");
    check(!labels.includes("HiddenHeading") && !labels.includes("Nested header") && !labels.includes("InertHeading"), "Hidden content or nested header listed");
    check(labels.includes("শিরোনাম 3: ARIA heading"), "ARIA heading level lost");
    choose("মূল কনটেন্ট");
    check(!dialog.open && document.activeElement === main && main.getAttribute("tabindex") === "-1", "Main destination did not receive focus");
    start.focus(); check(!main.hasAttribute("tabindex"), "Temporary main tabindex survived blur");
    open(); selectCategory("forms"); choose("Search site");
    check(document.activeElement === document.getElementById("query"), "Search did not focus first usable field");
    open(); choose("Account details"); check(document.activeElement === email, "Form did not focus first usable field");
    open(); selectCategory("errors"); choose("Email"); check(document.activeElement === email, "Error did not focus invalid field");
    start.focus(); open(); selectCategory("headings"); choose("Negative heading");
    check(document.activeElement.id === "negative" && document.activeElement.getAttribute("tabindex") === preparedHeadingTabindex, "Navigator changed prepared heading tabindex");
    start.focus(); open();
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    check(!dialog.open && document.activeElement === start, "Escape did not restore page focus");
    const native = document.getElementById("native");
    open(); selectCategory("errors"); check(![...list.options].some(option => option.textContent.includes("Native required")), "Untouched required field listed as current error");
    native.checkValidity();
    await until(() => [...list.options].some(option => option.textContent.includes("Native required")));
    choose("Native required"); check(document.activeElement === native, "Native validation error was not reachable");
    native.value = "Resolved"; native.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(250); open(); selectCategory("errors");
    check(![...list.options].some(option => option.textContent.includes("Native required")), "Resolved native error remained");
    // FR-15/16: exercise actual DOM classifiers and the settings/list lifecycle.
    selectCategory("all");
    const noiseFixture = document.createElement("div");
    noiseFixture.innerHTML = `<aside class="sponsored" aria-label="Promo first"><h2>Offers</h2><a href="#one">One</a><a href="#two">Two</a></aside>
      <aside class="sponsored" aria-label="Promo second"><h2>Offers</h2><a href="#one">One</a><a href="#two">Two</a></aside>
      <aside aria-label="Ordinary sidebar">Useful reading</aside>
      <aside id="address-book" aria-label="Address directory">Directory</aside>
      <footer aria-label="Plain footer">About us</footer>
      <aside class="sponsored" aria-label="Critical security"><p>Security warning</p></aside>
      <aside class="sponsored" aria-label="Critical error"><div role="alert">Unable to proceed</div></aside>
      <aside class="sponsored" aria-label="Critical payment"><p>Payment total: 500</p></aside>
      <aside class="sponsored" aria-label="Critical consent"><p>Consent to data collection</p></aside>
      <aside class="sponsored" aria-label="Critical legal"><p>Terms and conditions</p></aside>
      <aside class="sponsored" aria-label="Critical authentication"><input type="password"></aside>
      <aside class="sponsored" aria-label="Critical task"><button>Continue</button></aside>
      <aside class="sponsored" aria-label="Critical Bangla"><p>নিরাপত্তা সতর্কতা। পেমেন্ট ও সম্মতি।</p></aside>
      <aside class="sponsored" aria-label="Referenced block" aria-describedby="outside-notice">Offers</aside>
      <p id="outside-notice">Legal instructions</p>`;
    document.body.append(noiseFixture);
    for (const field of noiseFixture.querySelectorAll("input")) Object.defineProperty(field, "value", { get() { throw new Error("Noise classification read a value"); } });
    await until(() => [...list.options].some(option => option.textContent.includes("Promo first")));
    const originalOrder = [...list.options].map(option => option.value);
    const selectedNoise = [...list.options].find(option => option.textContent.includes("Promo first"));
    const authoredMarkup = noiseFixture.innerHTML;
    list.value = selectedNoise.value;
    const setNoise = enabled => changedListeners.forEach(listener => listener({ baaNoiseReductionEnabled: { newValue: enabled } }, "local"));
    setNoise(true);
    check(list.value === selectedNoise.value, "Enabling noise reduction lost selection");
    check(list.options.length === originalOrder.length, "Noise reduction removed destinations");
    check(noiseFixture.innerHTML === authoredMarkup, "Noise reduction altered publisher content or attributes");
    const lowLabel = "কম অগ্রাধিকার";
    const promoOption = [...list.options].find(option => option.textContent.includes("Promo first"));
    check(promoOption.textContent.includes(lowLabel), "Sponsored sidebar did not receive low priority");
    const labelsWithNoise = [...list.options].map(option => option.textContent);
    for (const label of ["Critical security", "Critical error", "Critical payment", "Critical consent", "Critical legal", "Critical authentication", "Critical task", "Critical Bangla", "Referenced block", "Ordinary sidebar", "Address directory", "Plain footer"]) {
      check(!labelsWithNoise.find(text => text.includes(label)).includes(lowLabel), "Protected/ordinary region was deprioritized: " + label);
    }
    check(labelsWithNoise.findIndex(text => text.includes("Ordinary sidebar")) < labelsWithNoise.findIndex(text => text.includes("Promo first")), "Low priority regions were not ordered later");
    const promo = noiseFixture.querySelector("aside");
    const warning = document.createElement("p"); warning.textContent = "Security warning"; promo.append(warning);
    await until(() => ![...list.options].find(option => option.textContent.includes("Promo first")).textContent.includes(lowLabel));
    check(list.value === selectedNoise.value, "Live protection update lost selection");
    warning.remove();
    await until(() => [...list.options].find(option => option.textContent.includes("Promo first")).textContent.includes(lowLabel));
    // Authored text survives translation: neither English nor translated warnings may be missed.
    const translatedWarning = document.createElement("p"); translatedWarning.textContent = "Translated notice";
    translatedWarning.firstChild.__baaTranslated = true;
    translatedWarning.firstChild.__baaAppliedText = "Translated notice";
    translatedWarning.firstChild.__baaOriginalText = "Security warning";
    promo.append(translatedWarning);
    check(BAA_CONTENT_PROTECTION.inspect(promo).protected, "Original translated warning was missed");
    translatedWarning.remove();
    const ambiguous = document.createElement("p"); ambiguous.textContent = "x".repeat(16001); promo.append(ambiguous);
    check(BAA_CONTENT_PROTECTION.inspect(promo).protected, "Analysis limit allowed deprioritization"); ambiguous.remove();
    promo.setAttribute("aria-describedby", "missing-critical-reference");
    check(BAA_CONTENT_PROTECTION.inspect(promo).protected, "Unresolved references allowed deprioritization"); promo.removeAttribute("aria-describedby");
    const action = document.createElement("a"); action.href = "/checkout"; action.textContent = "Go"; promo.append(action);
    check(BAA_CONTENT_PROTECTION.inspect(promo).protected, "Task-critical link path was missed"); action.remove();
    const noticeImage = document.createElement("img"); noticeImage.alt = "Security warning"; promo.append(noticeImage);
    check(BAA_CONTENT_PROTECTION.inspect(promo).protected, "Critical image alternative text was missed"); noticeImage.remove();
    setNoise(false);
    check([...list.options].map(option => option.value).join() === originalOrder.join(), "Disabling noise reduction did not restore document order");
    setNoise(true);
    choose("Promo first"); check(document.activeElement === promo, "Low-priority region was not reachable");
    open();
    check(![...list.options].find(option => option.textContent.includes("Promo first")).textContent.includes(lowLabel), "Focused region was deprioritized");
    shadow.getElementById("close").click(); start.focus(); open();
    setNoise(false); noiseFixture.remove();
    const late = document.createElement("h2"); late.textContent = "Live heading"; main.append(late);
    selectCategory("headings");
    await until(() => [...list.options].some(option => option.textContent.includes("Live heading")));
    const lateOption = [...list.options].find(option => option.textContent.includes("Live heading"));
    list.value = lateOption.value; const selected = list.value;
    late.textContent = "Renamed live heading";
    await until(() => [...list.options].some(option => option.textContent.includes("Renamed live heading")));
    check(list.value === selected && shadow.activeElement === category, "Live update changed selected destination or focus");
    late.remove(); shadow.getElementById("go").click();
    check(dialog.open && shadow.getElementById("status").textContent.includes("আর পাওয়া"), "Removed destination closed dialog or stole focus");
    shadow.getElementById("close").click();
    const siteDialog = document.getElementById("siteDialog"); siteDialog.showModal();
    check(open()?.error === "PAGE_MODAL_ACTIVE" && !dialog.open, "Page modal focus was stolen"); siteDialog.close();
    const event = new KeyboardEvent("keydown", { key: "h", code: "KeyH", bubbles: true, cancelable: true }); document.dispatchEvent(event);
    check(!event.defaultPrevented, "Native NVDA navigation key was intercepted");
    const mainLink = [...shadow.getElementById("skipLinks").querySelectorAll("a")].find(link => link.textContent.includes("মূল"));
    const hash = location.hash; mainLink.click();
    check(document.activeElement === main && location.hash === hash, "Skip link did not focus main safely");
    start.focus(); open();
    main.id = "publisher-main";
    changedListeners.forEach(listener => listener({ baaAssistantEnabled: { newValue: false } }, "local"));
    check(!host.isConnected && document.activeElement === start, "Disable did not remove navigator and restore focus");
    check(main.id === "publisher-main" && !main.hasAttribute("tabindex"), "Cleanup overwrote publisher update or retained tabindex");
    check(!document.querySelector('[id^="baa-nav-"]'), "Generated IDs survived cleanup");
    check(open()?.error === "ASSISTANT_DISABLED", "Disabled navigator still handles commands");
    check(!press("KeyZ", "Z").defaultPrevented, "Disabled navigator retained fixed shortcut handler");
    check(document.getElementById("negative").getAttribute("tabindex") === "-3", "Original heading focus not restored");
    changedListeners.forEach(listener => listener({ baaAssistantEnabled: { newValue: true } }, "local"));
    const restartedHost = document.querySelector("[data-baa-navigator]");
    check(restartedHost && restartedHost !== host, "Re-enable did not create a fresh navigator");
    start.focus(); restartedHost.shadowRoot.querySelector("nav a").focus();
    changedListeners.forEach(listener => listener({ baaAssistantEnabled: { newValue: false } }, "local"));
    check(!restartedHost.isConnected && document.activeElement === start, "Disable while a skip link has focus lost page focus");
    document.body.replaceChildren(result);
    const emptyAssistant = BAA_NAVIGATION_ASSISTANT.createNavigationAssistant({ documentRef: document });
    emptyAssistant.start(); check(emptyAssistant.open(), "Empty page navigator could not open");
    const emptyShadow = document.querySelector("[data-baa-navigator]").shadowRoot;
    check(emptyShadow.getElementById("destinations").options.length === 0 && emptyShadow.getElementById("go").disabled, "Empty page offered a nonexistent destination");
    emptyAssistant.stop(); check(!document.body.hasAttribute("tabindex"), "Empty-page focus fallback was not cleaned up");
    check(errors.length === 0, errors.join("; "));
    result.textContent = btoa(JSON.stringify({ ok: true }));
  } catch (error) { result.textContent = btoa(JSON.stringify({ ok: false, error: error.message, stack: error.stack, errors })); }
}

test("Chrome navigator integration: regions, skip links, focus, errors, dynamic updates and rollback", { skip: !existsSync(chromePath) }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "baa-navigation-test-"));
  try {
    const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"));
    assert.equal(manifest.commands, undefined, "Custom Chrome command registration still exists");
    const scripts = await Promise.all(manifest.content_scripts.flatMap(entry => entry.js).map(file => readFile(new URL("../src/" + file, import.meta.url), "utf8")));
    const fixture = '<header><nav aria-label="Site navigation"><a id="start" href="#">Home</a></nav></header><nav aria-label="Site navigation"></nav><main><h1>Registration</h1><h2 id="negative" tabindex="-3">Negative heading</h2><div role="heading" aria-level="3">ARIA heading</div><section><header aria-label="Nested header">Article header</header></section><h2 hidden>HiddenHeading</h2><div inert><h2>InertHeading</h2></div><form role="search" aria-label="Search site"><input disabled><label for="query">Search</label><input id="query"></form><form aria-label="Account details"><label for="email">Email</label><input id="email" aria-invalid="true" aria-errormessage="emailError"><div role="alert" id="emailError">Email format is invalid</div><label for="password">Password</label><input type="password" id="password"><label for="native">Native required</label><input id="native" required></form><div role="alert">Successful update</div></main><footer>Copyright</footer><dialog id="siteDialog"><button>Page modal</button></dialog>';
    const setup = `const changedListeners=[],messageListeners=[],errors=[];
      window.addEventListener('error', event=>errors.push(event.message));
      window.chrome={storage:{local:{get(defaults,callback){callback({...defaults,baaFormGuidanceEnabled:false});}},onChanged:{addListener(listener){changedListeners.push(listener);}}},runtime:{onMessage:{addListener(listener){messageListeners.push(listener);}},sendMessage(message,callback){callback({});}}};`;
    const page = join(directory, "navigation.html");
    await writeFile(page, '<!doctype html><html><meta charset="utf-8"><body>' + fixture + '<script>' + setup + '</script>' + scripts.map(source => '<script>' + source + '</script>').join('\n') + '<script>(' + browserChecks.toString() + ')();</script></body></html>');
    const browser = spawnSync(chromePath, ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--user-data-dir=" + join(directory, "profile"), "--virtual-time-budget=15000", "--dump-dom", pathToFileURL(page).href], { encoding: "utf8", timeout: 45000, maxBuffer: 2_000_000, windowsHide: true });
    assert.ifError(browser.error); assert.equal(browser.status, 0, browser.stderr.slice(-1200));
    const encoded = browser.stdout.match(/<pre id="test-result"[^>]*>([A-Za-z0-9+/=]+)<\/pre>/)?.[1];
    assert.ok(encoded, "Chrome did not finish checks: " + browser.stderr.slice(-1200));
    const report = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    assert.equal(report.ok, true, JSON.stringify(report));
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});
