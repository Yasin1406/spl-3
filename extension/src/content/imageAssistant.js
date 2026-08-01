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

    function onPointerOver(event) {
      hoveredImage = event.target?.closest?.("img") || null;
    }

    function onFocusIn(event) {
      if (!shouldAnnounceGuidance) return;
      const target = event.target;
      const image = target?.closest?.("img") || target?.querySelector?.("img");
      if (!isMeaningfulImage(image)) return;
      announcer.announce("ছবির বর্ণনার জন্য Alt Shift D, ছবির লেখা পড়তে Alt Shift O চাপুন।");
    }

    async function onKeyDown(event) {
      if (!event.altKey || !event.shiftKey || !["KeyD", "KeyO"].includes(event.code)) return;
      const activeElement = documentRef.activeElement;
      const image = activeElement?.closest?.("img") || activeElement?.querySelector?.("img") || hoveredImage;
      if (!image?.currentSrc && !image?.src) return announcer.announce("বর্ণনা করার জন্য আগে একটি ছবিতে ফোকাস করুন বা মাউস রাখুন।");
      event.preventDefault();
      const mode = event.code === "KeyO" ? "ocr" : "describe";
      announcer.announce(mode === "ocr" ? "ছবির লেখা পড়া হচ্ছে।" : "ছবির বর্ণনা তৈরি হচ্ছে।");
      try {
        const response = await sendMessage({
          type: "BAA_ANALYZE_IMAGE", mode, imageUrl: image.currentSrc || image.src,
          context: [image.alt, image.title, image.closest("figure")?.querySelector("figcaption")?.textContent].filter(Boolean).join(" ").slice(0, 300)
        });
        attachPersistentResult(image, response.text);
        announcer.announce(response.text);
        globalScope.BAA_LAST_IMAGE_ANALYSIS = response;
      } catch {
        announcer.announce("ছবিটি এখন বিশ্লেষণ করা যাচ্ছে না।");
      }
    }

    function attachPersistentResult(image, text) {
      let description = image.__baaImageDescriptionNode;
      if (!description) {
        description = documentRef.createElement("span");
        description.id = `baa-image-description-${Math.random().toString(36).slice(2, 10)}`;
        description.dataset.baaOwned = "true";
        Object.assign(description.style, {
          position: "absolute", width: "1px", height: "1px", padding: "0", margin: "-1px",
          overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: "0"
        });
        documentRef.body.append(description);
        image.__baaImageDescriptionNode = description;
        description.__baaImageElement = image;
        descriptionNodes.add(description);
        const existing = image.getAttribute("aria-describedby");
        registry.applyAttribute({
          element: image, attribute: "aria-describedby",
          value: [existing, description.id].filter(Boolean).join(" "),
          reasonCode: reasons.IMAGE_DESCRIPTION_CACHED, ruleScore: 1
        });
      }
      description.textContent = text;
    }

    return Object.freeze({
      start() {
        documentRef.addEventListener("pointerover", onPointerOver, true);
        documentRef.addEventListener("focusin", onFocusIn, true);
        documentRef.addEventListener("keydown", onKeyDown, true);
      },
      setGuidanceEnabled(enabled) { shouldAnnounceGuidance = Boolean(enabled); },
      stop() {
        documentRef.removeEventListener("pointerover", onPointerOver, true);
        documentRef.removeEventListener("focusin", onFocusIn, true);
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
