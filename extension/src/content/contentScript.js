(function startBanglaDomTranslation() {
  const translator = window.BAA_DOM_TRANSLATOR;
  if (!translator) return;

  translator.translatePage(document.body);

  const observer = new MutationObserver((mutations) => {
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

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "title", "alt", "placeholder"]
  });
})();
