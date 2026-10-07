(function registerAccessibilityCore(globalScope) {
  const INTERACTIVE_SELECTOR = [
    "button",
    "a[href]",
    "input:not([type='hidden'])",
    "select",
    "textarea",
    "summary",
    "[role='button']",
    "[role='link']",
    "[role='checkbox']",
    "[role='menuitem']",
    "[tabindex]"
  ].join(",");

  const LANDMARK_SELECTOR = [
    "main",
    "nav",
    "aside",
    "header",
    "footer",
    "form",
    "[role='main']",
    "[role='navigation']",
    "[role='complementary']",
    "[role='banner']",
    "[role='contentinfo']",
    "[role='search']",
    "[role='form']"
  ].join(",");

  const LIVE_REGION_SELECTOR = "[aria-live], [role='alert'], [role='status'], [role='log']";
  const READING_BLOCK_SELECTOR = "p, li, blockquote, figcaption, pre, [role='paragraph'], div";
  const READING_REGION_SELECTOR = "article, main, [role='main'], [role='article'], [itemprop='articleBody']";
  const READING_EXCLUDED_SELECTOR = "nav, [role='navigation'], form, [role='form'], [role='search'], button, a[href], input, select, textarea, summary, [role='button'], [role='link'], [role='heading'], [contenteditable]:not([contenteditable='false'])";

  function isReadingBlock(element) {
    if (!element?.closest?.(READING_REGION_SELECTOR) || element.closest(READING_EXCLUDED_SELECTOR)) return false;
    // Focus the actual reading blocks rather than containers repeating their descendants' text.
    if (element.querySelector?.(`${READING_BLOCK_SELECTOR}, h1, h2, h3, h4, h5, h6, section, article, ul, ol, table, form`)) return false;
    return Boolean(normalizeText(element.textContent));
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isExtensionOwned(element) {
    return Boolean(element?.closest?.("[data-baa-owned='true']"));
  }

  function isElementVisible(element) {
    if (!element || element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
    if (element.closest?.("[hidden], [inert], [aria-hidden='true']")) return false;
    const view = element.ownerDocument?.defaultView;
    if (!view?.getComputedStyle) return true;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = view.getComputedStyle(ancestor);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  }

  function textFromReferences(element, attributeName) {
    const documentRef = element?.ownerDocument;
    const ids = normalizeText(element?.getAttribute?.(attributeName)).split(" ").filter(Boolean);
    return normalizeText(ids.map((id) => documentRef?.getElementById(id)?.textContent).filter(Boolean).join(" "));
  }

  function associatedLabelText(element) {
    const labelsText = Array.from(element?.labels || []).map((label) => label.textContent).join(" ");
    return normalizeText(labelsText);
  }

  function accessibleNameSource(element) {
    const labelledBy = textFromReferences(element, "aria-labelledby");
    if (labelledBy) return { name: labelledBy, source: "aria-labelledby" };

    const ariaLabel = normalizeText(element?.getAttribute?.("aria-label"));
    if (ariaLabel) return { name: ariaLabel, source: "aria-label" };

    const label = associatedLabelText(element);
    if (label) return { name: label, source: "label" };

    const tagName = element?.tagName?.toLowerCase();
    const type = normalizeText(element?.getAttribute?.("type")).toLowerCase();
    if (tagName === "img") {
      const alt = normalizeText(element.getAttribute("alt"));
      if (alt) return { name: alt, source: "alt" };
    }

    if (tagName === "input" && ["button", "submit", "reset"].includes(type)) {
      const value = normalizeText(element.value || element.getAttribute("value"));
      if (value) return { name: value, source: "value" };
    }

    const visibleText = normalizeText(element?.textContent);
    if (visibleText) return { name: visibleText, source: "visible-text" };

    const title = normalizeText(element?.getAttribute?.("title"));
    if (title) return { name: title, source: "title" };

    const placeholder = normalizeText(element?.getAttribute?.("placeholder"));
    if (placeholder) return { name: placeholder, source: "placeholder" };

    return { name: "", source: "none" };
  }

  function stableFingerprint(element) {
    const parts = [
      element?.tagName?.toLowerCase() || "unknown",
      normalizeText(element?.getAttribute?.("type")).toLowerCase(),
      normalizeText(element?.getAttribute?.("role")).toLowerCase(),
      normalizeText(element?.id),
      normalizeText(element?.getAttribute?.("name"))
    ];
    return parts.join(":");
  }

  globalScope.BAA_ACCESSIBILITY_CORE = Object.freeze({
    INTERACTIVE_SELECTOR,
    LANDMARK_SELECTOR,
    LIVE_REGION_SELECTOR,
    READING_BLOCK_SELECTOR,
    accessibleNameSource,
    isElementVisible,
    isExtensionOwned,
    isReadingBlock,
    normalizeText,
    stableFingerprint
  });
})(globalThis);
