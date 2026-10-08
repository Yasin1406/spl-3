(function registerKeybindings(globalScope) {
  const storageKey = "baaCustomKeybindings";
  const defaults = Object.freeze({ navigator: "Alt+Shift+Z", voice: "Alt+Shift+V", pageSummary: "Alt+Shift+A", regionSummary: "Alt+Shift+S", imageOcr: "Alt+Shift+O", imageDescription: "Alt+Shift+D" });
  const labels = Object.freeze({ navigator: "পৃষ্ঠায় নেভিগেশন", voice: "ভয়েস বোতামে ফোকাস", pageSummary: "পৃষ্ঠার সারাংশ", regionSummary: "ফোকাসের অংশের সারাংশ", imageOcr: "ছবির লেখা (OCR)", imageDescription: "ছবির বর্ণনা" });
  // Restrict shortcuts to deliberate modified gestures; ordinary typing and
  // native Enter/Space/Escape/Tab controls remain available.
  const reserved = new Set(["Alt+Shift+B", "Alt+Shift+T", "Alt+Shift+I"]);
  function normalize(value) {
    if (typeof value !== "string") return null;
    const parts = value.trim().split("+").map(part => part.trim().toUpperCase());
    if (parts.length !== 3 || new Set(parts.slice(0, 2)).size !== 2 || !parts.slice(0, 2).includes("ALT") || !parts.slice(0, 2).includes("SHIFT") || !/^[A-Z0-9]$/.test(parts[2])) return null;
    return `Alt+Shift+${parts[2]}`;
  }
  function validate(custom = {}) {
    if (!custom || typeof custom !== "object" || Array.isArray(custom)) return { error: "শর্টকাটের সেটিংস সঠিক নয়।" };
    const cleaned = {}, effective = { ...defaults }, owners = new Map();
    for (const action of Object.keys(defaults)) {
      const raw = custom[action];
      if (raw === undefined || raw === "" || typeof raw === "string" && !raw.trim()) continue;
      const binding = normalize(raw);
      if (!binding) return { action, error: `${labels[action]}: Alt+Shift এবং একটি ইংরেজি অক্ষর বা সংখ্যা ব্যবহার করুন।` };
      if (reserved.has(binding)) return { action, error: `${binding} Chrome-এর জন্য সংরক্ষিত। অন্য শর্টকাট বেছে নিন।` };
      cleaned[action] = binding; effective[action] = binding;
    }
    for (const [action, binding] of Object.entries(effective)) {
      if (owners.has(binding)) return { action: cleaned[action] ? action : owners.get(binding), error: `${binding}: ${labels[owners.get(binding)]} ও ${labels[action]} একই শর্টকাট ব্যবহার করতে পারে না।` };
      owners.set(binding, action);
    }
    return { custom: cleaned, effective };
  }
  let bindings = { ...defaults };
  const listeners = new Set();
  function update(custom) {
    const result = validate(custom);
    // Reject the whole invalid configuration rather than activating ambiguous keys.
    bindings = result.error ? { ...defaults } : result.effective;
    for (const callback of listeners) callback();
  }
  function key(event) {
    if (/^Key[A-Z]$/.test(event.code || "")) return event.code.slice(3);
    if (/^Digit[0-9]$/.test(event.code || "")) return event.code.slice(5);
    return !event.code && /^[a-z0-9]$/i.test(event.key || "") ? event.key.toUpperCase() : null;
  }
  function matches(action, event) {
    return !event.isComposing && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && bindings[action] === `Alt+Shift+${key(event)}`;
  }
  function subscribe(callback) { listeners.add(callback); callback(); return () => listeners.delete(callback); }
  function bindHint(element, action) {
    if (!element) return () => {};
    return subscribe(() => {
      const binding = bindings[action];
      if (element.tagName === "KBD") element.textContent = binding;
      else element.setAttribute("aria-keyshortcuts", binding);
    });
  }
  globalScope.BAA_KEYBINDINGS = Object.freeze({ storageKey, defaults, labels, normalize, validate, key, matches, subscribe, bindHint, get: action => bindings[action] });
  if (globalScope.chrome?.storage?.local) {
    // Register first so a delayed initial read cannot overwrite a newer change.
    let revision = 0;
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area === "local" && changes[storageKey]) { revision++; update(changes[storageKey].newValue || {}); }
    });
    chrome.storage.local.get({ [storageKey]: {} }, values => { if (!revision) update(values[storageKey]); });
  }
})(globalThis);
