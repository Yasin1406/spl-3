(function setupPopupControls() {
  for (const hint of document.querySelectorAll("[data-shortcut]")) globalThis.BAA_KEYBINDINGS?.bindHint(hint, hint.dataset.shortcut);
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
    chrome.runtime.sendMessage({ type: "BAA_SAVE_PREFERENCES", preferences: { [STORAGE_KEY]: enabled } }, response => {
      if (chrome.runtime.lastError || response?.error || !response?.saved) { statusText.textContent = "সেটিংস সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।"; return; }
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

  chrome.runtime.sendMessage({ type: "BAA_GET_PREFERENCES" }, (result) => {
    if (chrome.runtime.lastError || !result) return;
    render(Boolean(result[STORAGE_KEY]));
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) render(Boolean(changes[STORAGE_KEY].newValue));
    if (area === "local" && changes.baaAccountStatus) renderAccount(changes.baaAccountStatus.newValue);
  });
  function renderAccount(account) {
    document.getElementById("accountStatus").textContent = account?.signedIn ? `${account.email} — ${account.sync === "synced" ? "পছন্দগুলো সিঙ্ক হয়েছে।" : "সিঙ্ক বাকি আছে।"}` : "অতিথি — পছন্দগুলো শুধু এই ব্রাউজারে থাকবে।";
  }
  chrome.runtime.sendMessage({ type: "BAA_GET_ACCOUNT_STATUS" }, response => { if (!chrome.runtime.lastError) renderAccount(response?.account); });

  toggleButton.addEventListener("click", () => {
    chrome.storage.local.get({ [STORAGE_KEY]: false }, (result) => {
      setEnabled(!Boolean(result[STORAGE_KEY]));
    });
  });
  document.getElementById("pageNavigator").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id == null) return;
      chrome.tabs.sendMessage(tabs[0].id, { type: "BAA_OPEN_NAVIGATOR" }, { frameId: 0 }, response => {
        const message = document.getElementById("navigationStatus");
        if (chrome.runtime.lastError) message.textContent = "এই পৃষ্ঠায় নেভিগেটর খোলা যায়নি। সাধারণ ওয়েবপৃষ্ঠায় চেষ্টা করুন বা পৃষ্ঠাটি রিফ্রেশ করুন।";
        else if (response?.error === "PAGE_MODAL_ACTIVE") message.textContent = "পৃষ্ঠার বর্তমান ডায়ালগ বন্ধ করে আবার চেষ্টা করুন।";
        else if (response?.error || !response?.opened) message.textContent = "সেটিংস থেকে সহায়ক চালু করে আবার চেষ্টা করুন।";
        else window.close();
      });
    });
  });
  for (const [id, scope] of [["pageSummary", "page"], ["regionSummary", "region"]]) {
    document.getElementById(id).addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        const tabId = tabs?.[0]?.id;
        if (!tabId) return;
        chrome.tabs.sendMessage(tabId, { type: "BAA_INVOKE_SUMMARY", scope }, response => {
          if (chrome.runtime.lastError || response?.error) {
            document.getElementById("summaryStatus").textContent = "সহায়ক চালু করুন এবং পৃষ্ঠাটি রিফ্রেশ করে আবার চেষ্টা করুন।";
          } else window.close();
        });
      });
    });
  }
})();
