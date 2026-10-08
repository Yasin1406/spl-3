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
  const defaults = { baaAssistantEnabled: true, baaFormGuidanceEnabled: true, baaTranslationVerbosity: "balanced", baaAiTranslationEnabled: true, baaImageShortcutGuidanceEnabled: true, baaAiSummaryEnabled: true, baaSummaryDetail: "standard" };

  chrome.storage.local.get(defaults, (values) => {
    enabled.checked = Boolean(values.baaAssistantEnabled);
    formGuidanceEnabled.checked = Boolean(values.baaFormGuidanceEnabled);
    aiEnabled.checked = Boolean(values.baaAiTranslationEnabled);
    translationVerbosity.value = values.baaTranslationVerbosity;
    imageShortcutGuidanceEnabled.checked = Boolean(values.baaImageShortcutGuidanceEnabled);
    aiSummaryEnabled.checked = Boolean(values.baaAiSummaryEnabled);
    summaryDetail.value = values.baaSummaryDetail;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    chrome.storage.local.set({
      baaAssistantEnabled: enabled.checked,
      baaFormGuidanceEnabled: formGuidanceEnabled.checked,
      baaAiTranslationEnabled: aiEnabled.checked,
      baaTranslationVerbosity: translationVerbosity.value || "balanced",
      baaImageShortcutGuidanceEnabled: imageShortcutGuidanceEnabled.checked,
      baaAiSummaryEnabled: aiSummaryEnabled.checked,
      baaSummaryDetail: summaryDetail.value || "standard"
    }, () => {
      status.textContent = "সেটিংস সংরক্ষণ করা হয়েছে।";
    });
  });
})();
