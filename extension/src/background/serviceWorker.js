const DEFAULTS = Object.freeze({
  baaAssistantEnabled: true,
  baaTranslationEnabled: false,
  baaAnnouncementDetail: "standard"
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(null, (current) => {
    const missing = Object.fromEntries(Object.entries(DEFAULTS).filter(([key]) => current[key] === undefined));
    if (Object.keys(missing).length > 0) chrome.storage.local.set(missing);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "BAA_GET_PREFERENCES") return;
  chrome.storage.local.get(DEFAULTS, sendResponse);
  return true;
});
