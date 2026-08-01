(function setupSettings() {
  const form = document.getElementById("settingsForm");
  const enabled = document.getElementById("assistantEnabled");
  const formGuidanceEnabled = document.getElementById("formGuidanceEnabled");
  const status = document.getElementById("saveStatus");
  const aiEnabled = document.getElementById("aiTranslationEnabled");
  const translationVerbosity = document.getElementById("translationVerbosity");
  const imageShortcutGuidanceEnabled = document.getElementById("imageShortcutGuidanceEnabled");
  const defaults = { baaAssistantEnabled: true, baaFormGuidanceEnabled: true, baaTranslationVerbosity: "balanced", baaAiTranslationEnabled: true, baaImageShortcutGuidanceEnabled: true };

  chrome.storage.local.get(defaults, (values) => {
    enabled.checked = Boolean(values.baaAssistantEnabled);
    formGuidanceEnabled.checked = Boolean(values.baaFormGuidanceEnabled);
    aiEnabled.checked = Boolean(values.baaAiTranslationEnabled);
    translationVerbosity.value = values.baaTranslationVerbosity;
    imageShortcutGuidanceEnabled.checked = Boolean(values.baaImageShortcutGuidanceEnabled);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    chrome.storage.local.set({
      baaAssistantEnabled: enabled.checked,
      baaFormGuidanceEnabled: formGuidanceEnabled.checked,
      baaAiTranslationEnabled: aiEnabled.checked,
      baaTranslationVerbosity: translationVerbosity.value || "balanced",
      baaImageShortcutGuidanceEnabled: imageShortcutGuidanceEnabled.checked
    }, () => {
      status.textContent = "সেটিংস সংরক্ষণ করা হয়েছে।";
    });
  });
})();
