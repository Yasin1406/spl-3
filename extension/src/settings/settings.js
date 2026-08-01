(function setupSettings() {
  const form = document.getElementById("settingsForm");
  const enabled = document.getElementById("assistantEnabled");
  const status = document.getElementById("saveStatus");
  const defaults = { baaAssistantEnabled: true, baaAnnouncementDetail: "standard" };

  chrome.storage.local.get(defaults, (values) => {
    enabled.checked = Boolean(values.baaAssistantEnabled);
    const detail = form.elements.announcementDetail;
    for (const radio of detail) radio.checked = radio.value === values.baaAnnouncementDetail;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    chrome.storage.local.set({
      baaAssistantEnabled: enabled.checked,
      baaAnnouncementDetail: form.elements.announcementDetail.value || "standard"
    }, () => {
      status.textContent = "সেটিংস সংরক্ষণ করা হয়েছে।";
    });
  });
})();
