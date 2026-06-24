(function setupBanglaDomTranslation() {
  const translator = window.BAA_DOM_TRANSLATOR;
  if (!translator) return;

  const STORAGE_KEY = "baaTranslationEnabled";
  let observer = null;
  let isRunning = false;

  function start() {
    if (isRunning) return;
    isRunning = true;
    translator.translatePage(document.body);
    observer = createObserver();
  }

  function stop() {
    if (!isRunning) return;
    isRunning = false;

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    translator.restorePage(document.body);
  }

  function createObserver() {
    const pageObserver = new MutationObserver((mutations) => {
      if (!isRunning) return;

      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              translator.translatePage(node);
            }

            if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
              translator.translatePage(node.parentElement);
            }
          }
        }

        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          translator.translatePage(mutation.target);
        }
      }
    });

    pageObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "title", "alt", "placeholder"]
    });

    return pageObserver;
  }

  function applyState(enabled) {
    if (enabled) {
      start();
    } else {
      stop();
    }
  }

  chrome.storage.local.get({ [STORAGE_KEY]: false }, (result) => {
    applyState(Boolean(result[STORAGE_KEY]));
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) return;
    applyState(Boolean(changes[STORAGE_KEY].newValue));
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "BAA_SET_TRANSLATION_STATE") {
      applyState(Boolean(message.enabled));
    }
  });
})();
