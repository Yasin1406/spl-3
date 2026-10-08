(function registerPreferences(globalScope) {
  const listeners = new Set();
  const initialDefaults = { baaAssistantEnabled: true, baaFormGuidanceEnabled: true, baaTranslationEnabled: false, baaImageShortcutGuidanceEnabled: true, baaSummaryDetail: "standard", baaNoiseReductionEnabled: false, baaCustomKeybindings: {} };
  function get(defaults, callback) {
    chrome.runtime.sendMessage({ type: "BAA_GET_PREFERENCES" }, response => {
      if (chrome.runtime.lastError || response?.error) callback({ ...initialDefaults, ...defaults });
      else callback({ ...initialDefaults, ...defaults, ...response });
    });
  }
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "BAA_PREFERENCES_CHANGED") for (const listener of listeners) listener(message.changes, "local");
  });
  globalScope.BAA_PREFERENCES = Object.freeze({ get, subscribe(callback) { listeners.add(callback); return () => listeners.delete(callback); } });
})(globalThis);
