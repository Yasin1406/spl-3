(function setupSettings() {
  const form = document.getElementById("settingsForm");
  const enabled = document.getElementById("assistantEnabled");
  const formGuidanceEnabled = document.getElementById("formGuidanceEnabled");
  const status = document.getElementById("saveStatus");
  const aiEnabled = document.getElementById("aiTranslationEnabled");
  const translationVerbosity = document.getElementById("translationVerbosity");
  const imageShortcutGuidanceEnabled = document.getElementById("imageShortcutGuidanceEnabled");
  const aiSummaryEnabled = document.getElementById("aiSummaryEnabled");
  const summaryDetail = document.getElementById("summaryDetail");
  const noiseReductionEnabled = document.getElementById("noiseReductionEnabled");
  const keys = globalThis.BAA_KEYBINDINGS;
  const inputs = {};
  const shortcutError = document.getElementById("keybindingError");
  let loaded = false;
  function customBindings() { return Object.fromEntries(Object.entries(inputs).map(([action, input]) => [action, input.value])); }
  function validateBindings() {
    const result = keys.validate(customBindings());
    shortcutError.textContent = result.error || "";
    for (const [action, input] of Object.entries(inputs)) input.setAttribute("aria-invalid", String(result.action === action));
    return result;
  }
  for (const [action, binding] of Object.entries(keys.defaults)) {
    const row = document.createElement("div"); row.className = "shortcut-row";
    const label = document.createElement("label"); label.htmlFor = `shortcut-${action}`; label.textContent = `${keys.labels[action]} — ডিফল্ট: ${binding}`;
    const input = document.createElement("input"); input.type = "text"; input.id = label.htmlFor; input.placeholder = binding;
    input.autocomplete = "off"; input.spellcheck = false; input.setAttribute("aria-describedby", "shortcutHelp keybindingError");
    inputs[action] = input;
    input.addEventListener("input", validateBindings);
    input.addEventListener("keydown", event => {
      if (event.isComposing || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || !keys.key(event)) return;
      event.preventDefault(); input.value = `Alt+Shift+${keys.key(event)}`; validateBindings();
    });
    const reset = document.createElement("button"); reset.type = "button"; reset.textContent = "ডিফল্ট";
    reset.setAttribute("aria-label", `${keys.labels[action]}: ডিফল্ট ফিরিয়ে আনুন`);
    reset.addEventListener("click", () => { input.value = ""; validateBindings(); input.focus(); });
    row.append(label, input, reset); document.getElementById("keybindingFields").append(row);
  }
  document.getElementById("resetKeybindings").addEventListener("click", () => {
    Object.values(inputs).forEach(input => { input.value = ""; }); validateBindings();
  });
  for (const hint of document.querySelectorAll("[data-shortcut]")) keys.bindHint(hint, hint.dataset.shortcut);
  const defaults = { baaAssistantEnabled: true, baaFormGuidanceEnabled: true, baaTranslationVerbosity: "balanced", baaAiTranslationEnabled: true, baaImageShortcutGuidanceEnabled: true, baaAiSummaryEnabled: true, baaSummaryDetail: "standard" };

  function renderPreferences(values) {
    const stored = keys.validate(values[keys.storageKey]);
    for (const [action, input] of Object.entries(inputs)) input.value = stored.custom?.[action] || "";
    loaded = true;
    noiseReductionEnabled.checked = values.baaNoiseReductionEnabled === true;
    enabled.checked = Boolean(values.baaAssistantEnabled);
    formGuidanceEnabled.checked = Boolean(values.baaFormGuidanceEnabled);
    aiEnabled.checked = Boolean(values.baaAiTranslationEnabled);
    translationVerbosity.value = values.baaTranslationVerbosity;
    imageShortcutGuidanceEnabled.checked = Boolean(values.baaImageShortcutGuidanceEnabled);
    aiSummaryEnabled.checked = Boolean(values.baaAiSummaryEnabled);
    summaryDetail.value = values.baaSummaryDetail;
  }
  chrome.runtime.sendMessage({ type: "BAA_GET_PREFERENCES" }, values => {
    if (chrome.runtime.lastError || values?.error || !values) { status.textContent = "সেটিংস লোড করা যায়নি। পৃষ্ঠাটি আবার খুলুন।"; return; }
    renderPreferences({ ...defaults, baaNoiseReductionEnabled: false, [keys.storageKey]: {}, ...values });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !Object.keys(changes).some(key => key in defaults || key === keys.storageKey || key === "baaNoiseReductionEnabled")) return;
    chrome.storage.local.get({ ...defaults, baaNoiseReductionEnabled: false, [keys.storageKey]: {} }, renderPreferences);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!loaded) return;
    const bindings = validateBindings();
    if (bindings.error) { inputs[bindings.action]?.focus(); return; }
    chrome.runtime.sendMessage({ type: "BAA_SAVE_PREFERENCES", preferences: {
      [keys.storageKey]: bindings.custom,
      baaAssistantEnabled: enabled.checked,
      baaNoiseReductionEnabled: noiseReductionEnabled.checked,
      baaFormGuidanceEnabled: formGuidanceEnabled.checked,
      baaAiTranslationEnabled: aiEnabled.checked,
      baaTranslationVerbosity: translationVerbosity.value || "balanced",
      baaImageShortcutGuidanceEnabled: imageShortcutGuidanceEnabled.checked,
      baaAiSummaryEnabled: aiSummaryEnabled.checked,
      baaSummaryDetail: summaryDetail.value || "standard"
    } }, response => {
      if (chrome.runtime.lastError || response?.error || !response?.saved) { status.textContent = "সেটিংস সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"; return; }
      status.textContent = response.account?.signedIn ? (response.account.sync === "synced" ? "সেটিংস অ্যাকাউন্টে সংরক্ষণ করা হয়েছে।" : "সেটিংস এই ব্রাউজারে সংরক্ষিত। অ্যাকাউন্টে সিঙ্ক বাকি আছে।") : "অতিথির সেটিংস এই ব্রাউজারে সংরক্ষণ করা হয়েছে।";
    });
  });
})();
