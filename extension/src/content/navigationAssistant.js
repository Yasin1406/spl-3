(function registerNavigationAssistant(globalScope) {
  const model = globalScope.BAA_NAVIGATION_MODEL;
  function createNavigationAssistant({ documentRef = document, announcer, noiseReductionEnabled = false }) {
    const host = documentRef.createElement("div");
    host.dataset.baaOwned = "true";
    host.dataset.baaNavigator = "true";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host { all:initial; font:16px/1.6 system-ui,sans-serif; color:#17212b; }
      * { box-sizing:border-box; } button,select { font:inherit; padding:8px; color:#17212b; background:#fff; border:1px solid #526174; border-radius:4px; }
      :focus { outline:3px solid #075da9; outline-offset:3px; }
      nav { position:fixed; top:8px; left:8px; z-index:2147483647; background:white; border:2px solid #526174; padding:10px; transform:translateY(-150%); }
      nav:focus-within { transform:none; } nav a,nav button { display:block; margin:4px; } a { color:#0645ad; }
      dialog { font:16px/1.6 system-ui,sans-serif; color:#17212b; background:#fff; border:2px solid #526174; border-radius:8px; padding:20px; width:min(680px,94vw); max-height:85vh; overflow:auto; }
      dialog::backdrop { background:rgba(0,0,0,.4); } h1 { font-size:1.4rem; } label { display:block; margin-top:10px; } select { width:100%; } [hidden] { display:none!important; }
    </style><nav lang="bn" aria-label="সহায়কের দ্রুত নেভিগেশন"><button id="open" type="button" aria-keyshortcuts="Alt+Shift+Z">পৃষ্ঠার অংশগুলো</button><div id="skipLinks"></div></nav>
    <dialog lang="bn" aria-labelledby="navigatorTitle" aria-describedby="help">
      <h1 id="navigatorTitle">পৃষ্ঠার অংশগুলো</h1>
      <p id="help">ধরন ও গন্তব্য বেছে ‘যান’ চাপুন। বন্ধ করতে Escape চাপুন।</p>
      <label for="category">অংশের ধরন</label><select id="category"><option value="all">সব অংশ</option><option value="landmarks">অঞ্চল</option><option value="headings">শিরোনাম</option><option value="forms">ফর্ম ও সার্চ</option><option value="errors">বর্তমান ভুল</option></select>
      <label for="destinations">গন্তব্য</label><select id="destinations" size="8"></select>
      <p id="status" role="status" aria-live="polite"></p>
      <button id="voiceStart" type="button" aria-keyshortcuts="Alt+Shift+V">কথা বলা শুরু করুন</button>
      <button id="voiceCancel" type="button" hidden>ভয়েস বাতিল করুন</button>
      <p id="voiceStatus" role="status" aria-live="polite"></p>
      <button id="go" type="button">যান</button><button id="close" type="button">বন্ধ করুন</button>
    </dialog>`;
    const dialog = shadow.querySelector("dialog"), category = shadow.getElementById("category"), list = shadow.getElementById("destinations"), status = shadow.getElementById("status");
    const focusManager = globalScope.BAA_FOCUS_MANAGER.createFocusManager({ documentRef });
    const ids = new WeakMap();
    const generatedIds = new Map();
    const reportedErrors = new Set();
    const prefix = `baa-nav-${Math.random().toString(36).slice(2)}-`;
    let sequence = 0, entries = [], previousFocus = null, lastPageFocus = null, active = false, timer = null;
    let detachShortcut = null;
    let detachHints = [];
    let refreshPending = false;
    const voice = globalScope.BAA_VOICE_NAVIGATION?.createVoiceNavigation({ dialog, shadow, list, category, announcer, documentRef,
      navigate: value => navigate(entries.find(entry => key(entry.element) === value)),
      onIdle() { if (active && refreshPending && !timer) timer = setTimeout(refresh, 150); } });
    function key(element) { if (!ids.has(element)) ids.set(element, String(++sequence)); return ids.get(element); }
    function selectedEntry() { return entries.find(entry => key(entry.element) === list.value); }
    function collectEntries() {
      const collected = model.collect(documentRef, reportedErrors);
      if (!noiseReductionEnabled || !globalScope.BAA_NOISE_CLASSIFIER) return collected;
      const focusedElement = lastPageFocus && ![documentRef.body, documentRef.documentElement].includes(lastPageFocus) ? lastPageFocus : null;
      const classified = globalScope.BAA_NOISE_CLASSIFIER.classify(collected, { focusedElement });
      // Stable partition: every destination remains available, including low-priority regions.
      return [...classified.filter(entry => !entry.lowPriority), ...classified.filter(entry => entry.lowPriority)].map(entry => ({
        ...entry, label: entry.label + (entry.lowPriority ? " — কম অগ্রাধিকার" : "")
      }));
    }
    function renderList() {
      const selected = list.value;
      const filtered = entries.filter(entry => category.value === "all" || entry.category === category.value);
      const changed = list.options.length !== filtered.length || filtered.some((entry, index) =>
        list.options[index].value !== key(entry.element) || list.options[index].dataset.voiceLabel !== entry.label);
      if (changed) list.replaceChildren(...filtered.map((entry, index) => {
          const option = documentRef.createElement("option"); option.value = key(entry.element); option.dataset.voiceLabel = entry.label;
          option.textContent = `${index + 1}. ${entry.label}`; return option;
        }));
      if (filtered.some(entry => key(entry.element) === selected)) list.value = selected;
      else if (list.options.length) list.selectedIndex = 0;
      shadow.getElementById("go").disabled = filtered.length === 0;
      const message = filtered.length ? `${filtered.length}টি গন্তব্য পাওয়া গেছে।` : "এই ধরনের কোনো গন্তব্য পাওয়া যায়নি।";
      if (status.textContent !== message) status.textContent = message;
      voice?.listChanged();
    }
    function targetId(element) {
      if (element.id && documentRef.getElementById(element.id) === element) return element.id;
      // Duplicate authored IDs cannot safely become fragment destinations.
      if (element.id) return null;
      let id;
      do { id = prefix + (++sequence); } while (documentRef.getElementById(id));
      element.id = id; generatedIds.set(element, id); return id;
    }
    function renderSkips() {
      const candidates = [
        [entries.find(entry => entry.type === "main"), "মূল কনটেন্টে যান"],
        [entries.find(entry => entry.type === "heading"), "প্রথম শিরোনামে যান"],
        [entries.find(entry => entry.type === "search"), "সার্চ ফর্মে যান"],
        [entries.find(entry => entry.type === "form"), "ফর্মে যান"],
        [entries.find(entry => entry.type === "error"), "ফর্মের ভুলগুলোতে যান"]
      ];
      shadow.getElementById("skipLinks").replaceChildren(...candidates.filter(([entry]) => entry).map(([entry, text]) => {
        const link = documentRef.createElement("a");
        const id = targetId(entry.element);
        link.href = id ? "#" + encodeURIComponent(id) : "#";
        link.textContent = text;
        link.addEventListener("click", event => { event.preventDefault(); navigate(entry); });
        return link;
      }));
    }
    function refresh() {
      timer = null;
      if (!active) return;
      if (dialog.open && voice?.busy()) { refreshPending = true; return; }
      refreshPending = false;
      for (const element of reportedErrors) if (!element.isConnected || element.validity?.valid) reportedErrors.delete(element);
      entries = collectEntries();
      // Avoid replacing a focused skip link on live updates.
      if (!shadow.querySelector("nav").contains(shadow.activeElement)) renderSkips();
      if (dialog.open) renderList();
    }
    function deepFocus() {
      let element = documentRef.activeElement;
      while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
      return element;
    }
    function onFocus(event) {
      if (model.available(event.target)) {
        lastPageFocus = deepFocus();
        if (noiseReductionEnabled && !timer) timer = setTimeout(refresh, 150);
      }
    }
    function close(restore = true) {
      voice?.cancel(true);
      voice?.setOpen(false);
      if (!dialog.open) return;
      dialog.close();
      if (restore) {
        if (previousFocus?.isConnected && coreVisible(previousFocus)) {
          if (previousFocus.getRootNode() === shadow) previousFocus.focus({ preventScroll: true });
          else focusManager.focus(previousFocus, false);
        } else focusManager.focus(entries.find(entry => entry.type === "main")?.element, false);
      }
    }
    function coreVisible(element) { return globalScope.BAA_ACCESSIBILITY_CORE.isElementVisible(element); }
    function open() {
      if (!active) return false;
      if (dialog.open) return true;
      // Respect a site's active modal rather than stealing its focus.
      const modals = [...documentRef.querySelectorAll("dialog:modal,[aria-modal='true']"), ...Array.from(documentRef.querySelectorAll("[data-baa-owned='true']")).flatMap(element => Array.from(element.shadowRoot?.querySelectorAll("dialog:modal") || []))];
      if (modals.some(coreVisible)) {
        announcer?.announce("বর্তমান ডায়ালগ বন্ধ করে পৃষ্ঠার অংশগুলো খুলুন।"); return false;
      }
      previousFocus = deepFocus();
      entries = collectEntries(); renderList();
      dialog.showModal(); voice?.setOpen(true); category.focus(); return true;
    }
    function navigate(entry) {
      // Recheck current protection before acting on a possibly stale list entry.
      if (noiseReductionEnabled) {
        const element = entry?.element;
        entries = collectEntries();
        entry = entries.find(candidate => candidate.element === element);
      }
      const target = model.destination(entry, documentRef);
      if (!target) {
        if (dialog.open) { refresh(); status.textContent = "গন্তব্যটি আর পাওয়া যাচ্ছে না। অন্য অংশ বেছে নিন।"; }
        else announcer?.announce("গন্তব্যটি আর পাওয়া যাচ্ছে না।");
        return;
      }
      const wasOpen = dialog.open;
      close(false);
      if (!focusManager.focus(target)) {
        if (wasOpen) { dialog.showModal(); voice?.setOpen(true); list.focus(); status.textContent = "এই গন্তব্যে ফোকাস দেওয়া যায়নি। অন্য অংশ বেছে নিন।"; }
        else announcer?.announce("এই গন্তব্যে ফোকাস দেওয়া যায়নি।");
      }
    }
    const observer = new MutationObserver(mutations => {
      if (!mutations.some(mutation => {
        const element = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        return element && !element.closest("[data-baa-owned='true']");
      })) return;
      if (!timer) timer = setTimeout(refresh, 150);
    });
    function onInvalid(event) {
      if (!model.available(event.target)) return;
      reportedErrors.add(event.target);
      if (!timer) timer = setTimeout(refresh, 150);
    }
    function onInput(event) {
      if ((noiseReductionEnabled || reportedErrors.has(event.target)) && !timer) timer = setTimeout(refresh, 150);
    }
    category.addEventListener("change", renderList);
    shadow.getElementById("open").addEventListener("click", open);
    shadow.getElementById("go").addEventListener("click", () => navigate(selectedEntry()));
    shadow.getElementById("close").addEventListener("click", () => close());
    list.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); navigate(selectedEntry()); } });
    dialog.addEventListener("cancel", event => { event.preventDefault(); if (voice?.busy()) voice.cancel(); else close(); });
    shadow.querySelector("nav").addEventListener("focusout", () => { if (!timer) timer = setTimeout(refresh, 150); });
    return Object.freeze({
      open,
      setNoiseReductionEnabled(enabled) {
        noiseReductionEnabled = enabled === true;
        refresh();
      },
      start() {
        if (active) return;
        active = true; documentRef.body.prepend(host); refresh();
        detachShortcut = globalScope.BAA_NAVIGATION_SHORTCUT?.attach(open) || null;
        detachHints = [globalScope.BAA_KEYBINDINGS?.bindHint(shadow.getElementById("open"), "navigator"), globalScope.BAA_KEYBINDINGS?.bindHint(shadow.getElementById("voiceStart"), "voice")];
        lastPageFocus = model.available(documentRef.activeElement) ? deepFocus() : null;
        documentRef.addEventListener("focusin", onFocus, true);
        documentRef.addEventListener("invalid", onInvalid, true);
        documentRef.addEventListener("input", onInput, true);
        documentRef.addEventListener("change", onInput, true);
        observer.observe(documentRef.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["id", "role", "aria-level", "aria-label", "aria-labelledby", "aria-invalid", "aria-describedby", "aria-errormessage", "aria-live", "aria-modal", "title", "name", "autocomplete", "type", "required", "pattern", "min", "max", "minlength", "maxlength", "href", "hidden", "inert", "aria-hidden", "style", "class", "disabled"] });
      },
      stop() {
        if (!active) return;
        active = false; observer.disconnect(); clearTimeout(timer); timer = null; close(); voice?.dispose();
        detachShortcut?.(); detachShortcut = null;
        detachHints.forEach(detach => detach?.()); detachHints = [];
        documentRef.removeEventListener("invalid", onInvalid, true);
        documentRef.removeEventListener("input", onInput, true);
        documentRef.removeEventListener("change", onInput, true);
        documentRef.removeEventListener("focusin", onFocus, true);
        if (documentRef.activeElement === host) focusManager.focus(model.available(lastPageFocus) ? lastPageFocus : entries.find(entry => entry.type === "main")?.element, false);
        focusManager.cleanup();
        for (const [element, id] of generatedIds) if (element.id === id) element.removeAttribute("id");
        generatedIds.clear(); reportedErrors.clear(); host.remove(); entries = [];
      }
    });
  }
  globalScope.BAA_NAVIGATION_ASSISTANT = Object.freeze({ createNavigationAssistant });
})(globalThis);
