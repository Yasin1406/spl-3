(function setupSettings() {
  const form = document.getElementById("settingsForm");
  const enabled = document.getElementById("assistantEnabled");
  const status = document.getElementById("saveStatus");
  const aiEnabled = document.getElementById("aiTranslationEnabled");
  const backendUrl = document.getElementById("backendUrl");
  const defaults = { baaAssistantEnabled: true, baaAnnouncementDetail: "standard", baaAiTranslationEnabled: true, baaBackendUrl: "http://127.0.0.1:3000" };

  chrome.storage.local.get(defaults, (values) => {
    enabled.checked = Boolean(values.baaAssistantEnabled);
    aiEnabled.checked = Boolean(values.baaAiTranslationEnabled);
    backendUrl.value = values.baaBackendUrl;
    const detail = form.elements.announcementDetail;
    for (const radio of detail) radio.checked = radio.value === values.baaAnnouncementDetail;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    chrome.storage.local.set({
      baaAssistantEnabled: enabled.checked,
      baaAnnouncementDetail: form.elements.announcementDetail.value || "standard",
      baaAiTranslationEnabled: aiEnabled.checked,
      baaBackendUrl: backendUrl.value.replace(/\/$/, "") || defaults.baaBackendUrl
    }, () => {
      status.textContent = "সেটিংস সংরক্ষণ করা হয়েছে।";
    });
  });
})();
