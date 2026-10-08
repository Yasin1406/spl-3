(function setupBanglaAccessibilityAssistant() {
  const translator = globalThis.BAA_DOM_TRANSLATOR;
  const scanner = globalThis.BAA_ACCESSIBILITY_SCANNER;
  const registryFactory = globalThis.BAA_ADAPTATION_REGISTRY;
  const liveRegionFactory = globalThis.BAA_LIVE_REGION;
  const formAssistantFactory = globalThis.BAA_FORM_ASSISTANT;
  const reasons = globalThis.BAA_REASON_CODES;
  const keyboardRepair = globalThis.BAA_KEYBOARD_REPAIR;
  const imageAssistantFactory = globalThis.BAA_IMAGE_ASSISTANT;
  const summaryAssistantFactory = globalThis.BAA_SUMMARY_ASSISTANT;
  const navigationAssistantFactory = globalThis.BAA_NAVIGATION_ASSISTANT;
  if (!translator || !scanner || !registryFactory || !liveRegionFactory || !formAssistantFactory || !keyboardRepair || !imageAssistantFactory || !summaryAssistantFactory || !navigationAssistantFactory || !reasons) return;

  const TRANSLATION_KEY = "baaTranslationEnabled";
  const ASSISTANT_KEY = "baaAssistantEnabled";
  const FORM_GUIDANCE_KEY = "baaFormGuidanceEnabled";
  const IMAGE_GUIDANCE_KEY = "baaImageShortcutGuidanceEnabled";
  const registry = registryFactory.createRegistry();
  let translationObserver = null;
  let accessibilityObserver = null;
  let liveRegion = null;
  let formAssistant = null;
  let imageAssistant = null;
  let summaryAssistant = null;
  let navigationAssistant = null;
  let pendingRoots = new Set();
  let scanTimer = null;
  let aiTranslationQueue = [];
  let aiTranslationTimer = null;
  let aiTranslationInFlight = false;
  let translationGeneration = 0;
  let imageShortcutGuidanceEnabled = true;
  let summaryDetail = "standard";

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
      chrome.storage.local.get({ [FORM_GUIDANCE_KEY]: true, [IMAGE_GUIDANCE_KEY]: true, baaSummaryDetail: "standard" }, (state) => {
        imageShortcutGuidanceEnabled = Boolean(state[IMAGE_GUIDANCE_KEY]);
        summaryDetail = state.baaSummaryDetail;
        startAssistant(Boolean(state[FORM_GUIDANCE_KEY]));
      });
      return;
    }
    if (accessibilityObserver) return;
    liveRegion = liveRegionFactory.createLiveRegion(document);
    imageAssistant = imageAssistantFactory.createImageAssistant({
      documentRef: document, announcer: liveRegion, sendMessage: sendRuntimeMessage,
      registry, reasons, guidanceEnabled: imageShortcutGuidanceEnabled
    });
    imageAssistant.start();
    summaryAssistant = summaryAssistantFactory.createSummaryAssistant({ documentRef: document, announcer: liveRegion, sendMessage: sendRuntimeMessage, detail: summaryDetail });
    summaryAssistant.start();
    if (formGuidanceEnabled) startFormGuidance();
    analyze(document);
    navigationAssistant = navigationAssistantFactory.createNavigationAssistant({ documentRef: document, announcer: liveRegion });
    navigationAssistant.start();
    accessibilityObserver = createAccessibilityObserver();
  }

  function stopAssistant() {
    accessibilityObserver?.disconnect();
    accessibilityObserver = null;
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = null;
    pendingRoots.clear();
    stopFormGuidance();
    imageAssistant?.stop();
    imageAssistant = null;
    summaryAssistant?.stop();
    summaryAssistant = null;
    navigationAssistant?.stop();
    navigationAssistant = null;
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
    const keyboardRepairs = keyboardRepair.repair(root, registry);
    repairs += keyboardRepairs;
    const headingFocusRepairs = keyboardRepair.prepareHeadings(result.inventory.headings, registry);
    repairs += headingFocusRepairs;
    const contentFocusRepairs = keyboardRepair.prepareReadingBlocks(result.inventory.readingBlocks, registry);
    repairs += contentFocusRepairs;
    const imageFocusRepairs = imageAssistantFactory.prepareImages(result.inventory.images, registry, reasons);
    repairs += imageFocusRepairs;
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

    if (repairs > 0) liveRegion?.announce(`${repairs}টি উপাদানের কীবোর্ড অ্যাক্সেস বা লেবেল উন্নত করা হয়েছে।`);
    globalThis.BAA_LAST_SCAN = {
      issueCounts: countReasons(result.issues),
      inventoryCounts: Object.fromEntries(Object.entries(result.inventory).map(([key, values]) => [key, values.length])),
      repairCount: repairs,
      keyboardRepairCount: keyboardRepairs,
      headingFocusRepairCount: headingFocusRepairs,
      contentFocusRepairCount: contentFocusRepairs,
      imageFocusRepairCount: imageFocusRepairs
    };
  }

  function createAccessibilityObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        if (!target || target.closest("[data-baa-owned='true']")) continue;
        // Ignore our attribute repairs, but still scan children inserted into repaired headings/controls.
        if (mutation.type === "attributes" && target.hasAttribute("data-baa-adapted")) continue;
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && !node.closest?.("[data-baa-owned='true']")) pendingRoots.add(node);
            if (node.nodeType === Node.TEXT_NODE) pendingRoots.add(target);
          }
        } else {
          pendingRoots.add(target);
        }
      }
      scheduleAffectedScan();
    });
    observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "aria-labelledby", "alt", "hidden", "role", "tabindex"] });
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
        if (mutation.target.parentElement?.closest("[data-baa-owned='true']") || mutation.target.closest?.("[data-baa-owned='true']")) continue;
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) queueAiTranslations(translator.translatePage(node));
            if (node.nodeType === Node.TEXT_NODE && node.parentElement) queueAiTranslations(translator.translatePage(node.parentElement));
          }
        }
        if (mutation.type === "attributes" && mutation.target instanceof Element) queueAiTranslations(translator.translatePage(mutation.target));
        if (mutation.type === "characterData" && mutation.target.parentElement) queueAiTranslations(translator.translatePage(mutation.target.parentElement));
      }
    });
    observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "title", "alt", "placeholder"] });
    return observer;
  }

  function queueAiTranslations(candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0 || !translationObserver && aiTranslationQueue.length > 0) return;
    aiTranslationQueue.push(...candidates);
    if (aiTranslationTimer || aiTranslationInFlight) return;
    aiTranslationTimer = setTimeout(flushAiTranslations, 120);
  }

  async function flushAiTranslations() {
    aiTranslationTimer = null;
    if (aiTranslationQueue.length === 0 || aiTranslationInFlight) return;
    // Bound total source text, not just item count, to keep long articles within provider output limits.
    const batch = [];
    let characters = 0;
    while (aiTranslationQueue.length > 0 && batch.length < 20) {
      const next = aiTranslationQueue[0];
      if (batch.length > 0 && characters + next.text.length > 1200) break;
      batch.push(aiTranslationQueue.shift());
      characters += next.text.length;
    }
    aiTranslationInFlight = true;
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
      if (generation === translationGeneration && translationObserver) {
        liveRegion?.announce("কিছু লেখা অনুবাদ করা যায়নি। মূল লেখা রাখা হয়েছে। আবার চেষ্টা করতে অনুবাদ বন্ধ করে চালু করুন।");
      }
    } finally {
      aiTranslationInFlight = false;
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

  chrome.storage.local.get({ [TRANSLATION_KEY]: false, [ASSISTANT_KEY]: true, [FORM_GUIDANCE_KEY]: true, [IMAGE_GUIDANCE_KEY]: true, baaSummaryDetail: "standard" }, (state) => {
    imageShortcutGuidanceEnabled = Boolean(state[IMAGE_GUIDANCE_KEY]);
    summaryDetail = state.baaSummaryDetail;
    if (state[TRANSLATION_KEY]) startTranslation();
    if (state[ASSISTANT_KEY]) startAssistant(Boolean(state[FORM_GUIDANCE_KEY]));
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.baaSummaryDetail) { summaryDetail = changes.baaSummaryDetail.newValue; summaryAssistant?.setDetail(summaryDetail); }
    if (changes[TRANSLATION_KEY]) changes[TRANSLATION_KEY].newValue ? startTranslation() : stopTranslation();
    if (changes[ASSISTANT_KEY]) changes[ASSISTANT_KEY].newValue ? startAssistant(undefined) : stopAssistant();
    if (changes[FORM_GUIDANCE_KEY] && accessibilityObserver) changes[FORM_GUIDANCE_KEY].newValue ? startFormGuidance() : stopFormGuidance();
    if (changes[IMAGE_GUIDANCE_KEY]) {
      imageShortcutGuidanceEnabled = Boolean(changes[IMAGE_GUIDANCE_KEY].newValue);
      imageAssistant?.setGuidanceEnabled(imageShortcutGuidanceEnabled);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "BAA_OPEN_NAVIGATOR") {
      if (!navigationAssistant) sendResponse({ error: "ASSISTANT_DISABLED" });
      else sendResponse(navigationAssistant.open() ? { opened: true } : { error: "PAGE_MODAL_ACTIVE" });
    }
    if (message?.type === "BAA_INVOKE_SUMMARY") {
      if (!summaryAssistant) sendResponse({ error: "ASSISTANT_DISABLED" });
      else { summaryAssistant.invoke(message.scope === "region" ? "region" : "page"); sendResponse({ started: true }); }
    }
    if (message?.type === "BAA_SET_TRANSLATION_STATE") message.enabled ? startTranslation() : stopTranslation();
    if (message?.type === "BAA_GET_SCAN_SUMMARY") sendResponse(globalThis.BAA_LAST_SCAN || null);
  });
})();
