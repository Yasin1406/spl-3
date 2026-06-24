(function setupPopupControls() {
  const STORAGE_KEY = "baaTranslationEnabled";
  const toggleButton = document.getElementById("toggleButton");
  const statusText = document.getElementById("statusText");

  function render(enabled) {
    toggleButton.textContent = enabled ? "Stop" : "Start";
    toggleButton.dataset.enabled = String(enabled);
    toggleButton.setAttribute(
      "aria-pressed",
      String(enabled)
    );
    statusText.textContent = enabled
      ? "Bangla DOM translation is running."
      : "Bangla DOM translation is stopped.";
  }

  function setEnabled(enabled) {
    chrome.storage.local.set({ [STORAGE_KEY]: enabled }, () => {
      render(enabled);
      notifyActiveTab(enabled);
    });
  }

  function notifyActiveTab(enabled) {
    chrome.tabs?.query?.({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs?.[0]?.id;
      if (!tabId) return;

      chrome.tabs.sendMessage(
        tabId,
        {
          type: "BAA_SET_TRANSLATION_STATE",
          enabled
        },
        () => {
          chrome.runtime.lastError;
        }
      );
    });
  }

  chrome.storage.local.get({ [STORAGE_KEY]: false }, (result) => {
    render(Boolean(result[STORAGE_KEY]));
  });

  toggleButton.addEventListener("click", () => {
    chrome.storage.local.get({ [STORAGE_KEY]: false }, (result) => {
      setEnabled(!Boolean(result[STORAGE_KEY]));
    });
  });
})();
