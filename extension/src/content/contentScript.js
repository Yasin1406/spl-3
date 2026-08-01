(function setupBanglaAccessibilityAssistant() {
  const translator = globalThis.BAA_DOM_TRANSLATOR;
  const scanner = globalThis.BAA_ACCESSIBILITY_SCANNER;
  const registryFactory = globalThis.BAA_ADAPTATION_REGISTRY;
  const liveRegionFactory = globalThis.BAA_LIVE_REGION;
  const formAssistantFactory = globalThis.BAA_FORM_ASSISTANT;
  const reasons = globalThis.BAA_REASON_CODES;
  if (!translator || !scanner || !registryFactory || !liveRegionFactory || !formAssistantFactory || !reasons) return;

  const TRANSLATION_KEY = "baaTranslationEnabled";
  const ASSISTANT_KEY = "baaAssistantEnabled";
  const FORM_GUIDANCE_KEY = "baaFormGuidanceEnabled";
  const registry = registryFactory.createRegistry();
  let translationObserver = null;
  let accessibilityObserver = null;
  let liveRegion = null;
  let formAssistant = null;
  let pendingRoots = new Set();
  let scanTimer = null;
  let aiTranslationQueue = [];
  let aiTranslationTimer = null;
  let translationGeneration = 0;

  function startTranslation() {
    if (translationObserver) return;
    translationGeneration += 1;
    queueAiTranslations(translator.translatePage(document.body));
    translationObserver = createTranslationObserver();
  }

  function stopTranslation() {
    translationGeneration += 1;
    translationObserver?.disconnect();
    translationObserver = null;
    if (aiTranslationTimer) clearTimeout(aiTranslationTimer);
    aiTranslationTimer = null;
    translator.discardAiCandidates(aiTranslationQueue.map((item) => item.id));
    aiTranslationQueue = [];
    translator.restorePage(document.body);
  }

  function startAssistant(formGuidanceEnabled = true) {
    if (typeof formGuidanceEnabled !== "boolean") {
      chrome.storage.local.get({ [FORM_GUIDANCE_KEY]: true }, (state) => startAssistant(Boolean(state[FORM_GUIDANCE_KEY])));
      return;
    }
    if (accessibilityObserver) return;
    liveRegion = liveRegionFactory.createLiveRegion(document);
    if (formGuidanceEnabled) startFormGuidance();
    analyze(document);
    accessibilityObserver = createAccessibilityObserver();
  }

  function stopAssistant() {
    accessibilityObserver?.disconnect();
    accessibilityObserver = null;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = null;
    pendingRoots.clear();
    stopFormGuidance();
    registry.rollbackAll();
    liveRegion?.remove();
    liveRegion = null;
  }

  function startFormGuidance() {
    if (formAssistant || !liveRegion) return;
    formAssistant = formAssistantFactory.createFormAssistant({ documentRef: document, registry, announcer: liveRegion });
    formAssistant.start();
  }

  function stopFormGuidance() {
    formAssistant?.stop();
    formAssistant = null;
  }

  function analyze(root) {
    const result = scanner.scan(root);
    let repairs = 0;
    const unlabeledControls = result.issues.filter((entry) => entry.reasonCode === reasons.FORM_LABEL_MISSING);
    for (const entry of unlabeledControls) {
      const label = scanner.findReliableNearbyLabel(entry.element);
      if (!label) continue;
      const generatedId = !label.id;
      let labelRecord = null;
      if (generatedId) {
        labelRecord = registry.applyAttribute({
          element: label,
          attribute: "id",
          value: `baa-label-${Math.random().toString(36).slice(2, 10)}`,
          reasonCode: reasons.MISSING_ACCESSIBLE_NAME,
          ruleScore: 1
        });
      }
      const record = registry.applyAttribute({
        element: entry.element,
        attribute: "aria-labelledby",
        value: label.id,
        reasonCode: reasons.MISSING_ACCESSIBLE_NAME,
        ruleScore: 1
      });
      if (record) repairs += 1;
      else labelRecord?.rollback();
    }

    if (repairs > 0) liveRegion?.announce(`${repairs}টি ফর্ম কন্ট্রোলের লেবেল সংযুক্ত করা হয়েছে।`);
    globalThis.BAA_LAST_SCAN = {
      issueCounts: countReasons(result.issues),
      inventoryCounts: Object.fromEntries(Object.entries(result.inventory).map(([key, values]) => [key, values.length])),
      repairCount: repairs
    };
  }

  function createAccessibilityObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        if (!target || target.closest("[data-baa-owned='true']") || target.hasAttribute("data-baa-adapted")) continue;
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && !node.closest?.("[data-baa-owned='true']")) pendingRoots.add(node);
          }
        } else {
          pendingRoots.add(target);
        }
      }
      scheduleAffectedScan();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "aria-labelledby", "alt", "hidden", "role", "tabindex"] });
    return observer;
  }

  function scheduleAffectedScan() {
    if (scanTimer || pendingRoots.size === 0) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      const roots = collapseNestedRoots([...pendingRoots]);
      pendingRoots.clear();
      for (const root of roots) analyze(root);
    }, 150);
  }

  function collapseNestedRoots(roots) {
    return roots.filter((root, index) => !roots.some((candidate, candidateIndex) => candidateIndex !== index && candidate.contains?.(root)));
  }

  function createTranslationObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) queueAiTranslations(translator.translatePage(node));
            if (node.nodeType === Node.TEXT_NODE && node.parentElement) queueAiTranslations(translator.translatePage(node.parentElement));
          }
        }
        if (mutation.type === "attributes" && mutation.target instanceof Element) queueAiTranslations(translator.translatePage(mutation.target));
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "title", "alt", "placeholder"] });
    return observer;
  }

  function queueAiTranslations(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0 || !translationObserver && aiTranslationQueue.length > 0) return;
    aiTranslationQueue.push(...candidates);
    if (aiTranslationTimer) return;
    aiTranslationTimer = setTimeout(flushAiTranslations, 120);
  }

  async function flushAiTranslations() {
    aiTranslationTimer = null;
    if (aiTranslationQueue.length === 0) return;
    const batch = aiTranslationQueue.splice(0, 20);
    const generation = translationGeneration;
    try {
      const response = await sendRuntimeMessage({ type: "BAA_TRANSLATE_BATCH", items: batch });
      if (generation === translationGeneration && translationObserver && Array.isArray(response?.translations)) {
        translator.applyAiTranslations(response.translations);
        globalThis.BAA_LAST_TRANSLATION_PROVIDER = {
          provider: response.provider || "unknown",
          model: response.model || null,
          failedProviders: response.failedProviders || []
        };
      } else {
        translator.discardAiCandidates(batch.map((item) => item.id));
      }
    } catch {
      translator.discardAiCandidates(batch.map((item) => item.id));
      liveRegion?.announce("AI অনুবাদ সেবা এখন পাওয়া যাচ্ছে না। নিয়মভিত্তিক অনুবাদ রাখা হয়েছে।");
    }
    if (aiTranslationQueue.length > 0) aiTranslationTimer = setTimeout(flushAiTranslations, 120);
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError || response?.error) reject(new Error(response?.error || chrome.runtime.lastError?.message));
        else resolve(response);
      });
    });
  }

  function countReasons(issues) {
    return issues.reduce((counts, entry) => ({ ...counts, [entry.reasonCode]: (counts[entry.reasonCode] || 0) + 1 }), {});
  }

  chrome.storage.local.get({ [TRANSLATION_KEY]: false, [ASSISTANT_KEY]: true, [FORM_GUIDANCE_KEY]: true }, (state) => {
    if (state[TRANSLATION_KEY]) startTranslation();
    if (state[ASSISTANT_KEY]) startAssistant(Boolean(state[FORM_GUIDANCE_KEY]));
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes[TRANSLATION_KEY]) changes[TRANSLATION_KEY].newValue ? startTranslation() : stopTranslation();
    if (changes[ASSISTANT_KEY]) changes[ASSISTANT_KEY].newValue ? startAssistant(undefined) : stopAssistant();
    if (changes[FORM_GUIDANCE_KEY] && accessibilityObserver) changes[FORM_GUIDANCE_KEY].newValue ? startFormGuidance() : stopFormGuidance();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "BAA_SET_TRANSLATION_STATE") message.enabled ? startTranslation() : stopTranslation();
    if (message?.type === "BAA_GET_SCAN_SUMMARY") sendResponse(globalThis.BAA_LAST_SCAN || null);
  });
})();
