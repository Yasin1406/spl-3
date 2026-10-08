(function registerImageAssistant(globalScope) {
  const INTERACTIVE_ANCESTOR = "a[href], button, [role='button'], [role='link']";

  function isMeaningfulImage(image) {
    if (!image || image.getAttribute("alt") === "" || ["none", "presentation"].includes(image.getAttribute("role"))) return false;
    return !image.hidden && image.getAttribute("aria-hidden") !== "true";
  }

  function prepareImages(images, registry, reasons) {
    let repaired = 0;
    for (const image of images || []) {
      if (!isMeaningfulImage(image) || image.closest(INTERACTIVE_ANCESTOR) || image.hasAttribute("tabindex")) continue;
      const record = registry.applyAttribute({
        element: image, attribute: "tabindex", value: "0",
        reasonCode: reasons.IMAGE_KEYBOARD_ACCESS_ADDED, ruleScore: 1
      });
      if (!record) continue;
      if (!image.hasAttribute("alt") && !image.hasAttribute("aria-label") && !image.hasAttribute("aria-labelledby")) {
        registry.applyAttribute({
          element: image, attribute: "aria-label",
          value: "ছবি",
          reasonCode: reasons.MISSING_ACCESSIBLE_NAME, ruleScore: 1
        });
      }
      repaired += 1;
    }
    return repaired;
  }

  function createImageAssistant({ documentRef = document, announcer, sendMessage, registry, reasons, guidanceEnabled = true }) {
    let hoveredImage = null;
    let shouldAnnounceGuidance = Boolean(guidanceEnabled);
    const descriptionNodes = new Set();
    let active = false, descriptionTimer = null;

    function isImageFocused(image) {
      let element = documentRef.activeElement;
      while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
      return element && element !== documentRef.body && element !== documentRef.documentElement &&
        (element === image || element.contains?.(image));
    }

    function flushDescriptions() {
      if (!active) return;
      for (const node of descriptionNodes) {
        const image = node.__baaImageElement;
        if (node.__baaPendingText === undefined || isImageFocused(image)) continue;
        node.textContent = node.__baaPendingText;
        delete node.__baaPendingText;
        if (!node.__baaAssociated) {
          const existing = image.getAttribute("aria-describedby");
          registry.applyAttribute({
            element: image, attribute: "aria-describedby",
            value: [existing, node.id].filter(Boolean).join(" "),
            reasonCode: reasons.IMAGE_DESCRIPTION_CACHED, ruleScore: 1
          });
          node.__baaAssociated = true;
        }
      }
    }

    function onFocusOut() {
      // Wait until browser focus has moved before changing the image description.
      if (descriptionTimer === null) descriptionTimer = globalScope.setTimeout(() => { descriptionTimer = null; flushDescriptions(); }, 0);
    }

    function onPointerOver(event) {
      hoveredImage = event.target?.closest?.("img") || null;
    }

    function onFocusIn(event) {
      if (!shouldAnnounceGuidance) return;
      const target = event.target;
      const image = target?.closest?.("img") || target?.querySelector?.("img");
      if (!isMeaningfulImage(image)) return;
      const keys = globalScope.BAA_KEYBINDINGS;
      announcer.announce(`ছবির বর্ণনার জন্য ${keys?.get("imageDescription") || "Alt+Shift+D"}, ছবির লেখা পড়তে ${keys?.get("imageOcr") || "Alt+Shift+O"} চাপুন।`);
    }

    async function onKeyDown(event) {
      const keys = globalScope.BAA_KEYBINDINGS;
      if (event.repeat || event.isComposing || event.ctrlKey || event.metaKey) return;
      const mode = keys ? (keys.matches("imageOcr", event) ? "ocr" : keys.matches("imageDescription", event) ? "describe" : null) : (event.altKey && event.shiftKey ? (event.code === "KeyO" ? "ocr" : event.code === "KeyD" ? "describe" : null) : null);
      if (!mode) return;
      const activeElement = documentRef.activeElement;
      const focusedImage = activeElement?.closest?.("img") ||
        (activeElement !== documentRef.body && activeElement !== documentRef.documentElement ? activeElement?.querySelector?.("img") : null);
      const image = focusedImage || hoveredImage;
      if (!image?.currentSrc && !image?.src) return announcer.announce("বর্ণনা করার জন্য আগে একটি ছবিতে ফোকাস করুন বা মাউস রাখুন।");
      event.preventDefault();
      announcer.announce(mode === "ocr" ? "ছবির লেখা পড়া হচ্ছে।" : "ছবির বর্ণনা তৈরি হচ্ছে।");
      try {
        const response = await sendMessage({
          type: "BAA_ANALYZE_IMAGE", mode, imageUrl: image.currentSrc || image.src,
          context: [image.alt, image.title, image.closest("figure")?.querySelector("figcaption")?.textContent].filter(Boolean).join(" ").slice(0, 300)
        });
        if (!active) return;
        attachPersistentResult(image, response.text);
        announcer.announce(response.text);
        globalScope.BAA_LAST_IMAGE_ANALYSIS = response;
      } catch (error) {
        if (!active) return;
        const code = error.message || "IMAGE_ANALYSIS_FAILED";
        globalScope.BAA_LAST_IMAGE_ANALYSIS = { error: code, mode };
        globalScope.console?.warn?.(`Image analysis failed: ${code}`);
        const message = {
          IMAGE_FETCH_FAILED: "ছবিটি আনা যাচ্ছে না। ছবির লিংক ও এক্সটেনশনের ফাইল অ্যাক্সেস অনুমতি পরীক্ষা করুন।",
          IMAGE_DECODE_FAILED: "ছবিটির ফরম্যাট পড়া যাচ্ছে না।",
          IMAGE_TOO_LARGE: "ছবিটির ফাইল অনেক বড়। ছোট ছবি দিয়ে আবার চেষ্টা করুন।",
          ALL_IMAGE_PROVIDERS_FAILED: "ছবি বিশ্লেষণ সেবা এখন সাড়া দিচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন।"
        }[code] || "ছবিটি এখন বিশ্লেষণ করা যাচ্ছে না।";
        announcer.announce(message);
      }
    }

    function attachPersistentResult(image, text) {
      let description = image.__baaImageDescriptionNode;
      if (!description) {
        description = documentRef.createElement("span");
        description.id = `baa-image-description-${Math.random().toString(36).slice(2, 10)}`;
        description.dataset.baaOwned = "true";
        // Hidden referenced text supplies an accessible description on revisiting
        // the image without becoming another paragraph in the browse buffer.
        description.hidden = true;
        documentRef.body.append(description);
        image.__baaImageDescriptionNode = description;
        description.__baaImageElement = image;
        descriptionNodes.add(description);
      }
      // The live region is the sole result announcement while this image has
      // focus. Updating its accessible description then can make NVDA repeat it.
      description.__baaPendingText = text;
      flushDescriptions();
    }

    return Object.freeze({
      start() {
        active = true;
        documentRef.addEventListener("pointerover", onPointerOver, true);
        documentRef.addEventListener("focusin", onFocusIn, true);
        documentRef.addEventListener("focusout", onFocusOut, true);
        documentRef.addEventListener("keydown", onKeyDown, true);
      },
      setGuidanceEnabled(enabled) { shouldAnnounceGuidance = Boolean(enabled); },
      stop() {
        active = false;
        if (descriptionTimer !== null) globalScope.clearTimeout(descriptionTimer);
        descriptionTimer = null;
        documentRef.removeEventListener("pointerover", onPointerOver, true);
        documentRef.removeEventListener("focusin", onFocusIn, true);
        documentRef.removeEventListener("focusout", onFocusOut, true);
        documentRef.removeEventListener("keydown", onKeyDown, true);
        for (const node of descriptionNodes) {
          if (node.__baaImageElement) delete node.__baaImageElement.__baaImageDescriptionNode;
          node.remove();
        }
        descriptionNodes.clear();
        hoveredImage = null;
      }
    });
  }
  globalScope.BAA_IMAGE_ASSISTANT = Object.freeze({ createImageAssistant, isMeaningfulImage, prepareImages });
})(globalThis);
