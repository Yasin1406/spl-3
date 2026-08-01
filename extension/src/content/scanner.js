(function registerAccessibilityScanner(globalScope) {
  const core = globalScope.BAA_ACCESSIBILITY_CORE;
  const reasons = globalScope.BAA_REASON_CODES;
  if (!core || !reasons) return;

  function scan(root = document) {
    const issues = [];
    const inventory = {
      controls: collect(root, core.INTERACTIVE_SELECTOR),
      formControls: collect(root, "input:not([type='hidden']), select, textarea"),
      images: collect(root, "img"),
      headings: collect(root, "h1, h2, h3, h4, h5, h6, [role='heading']"),
      landmarks: collect(root, core.LANDMARK_SELECTOR),
      liveRegions: collect(root, core.LIVE_REGION_SELECTOR)
    };

    for (const element of inventory.controls) {
      const accessibleName = core.accessibleNameSource(element);
      issues.push({
        element,
        fingerprint: core.stableFingerprint(element),
        reasonCode: accessibleName.name
          ? reasons.EXISTING_ACCESSIBLE_NAME_PRESERVED
          : reasons.MISSING_ACCESSIBLE_NAME,
        severity: accessibleName.name ? "info" : "error",
        evidence: { nameSource: accessibleName.source }
      });
    }

    for (const element of collect(root, "[role='button']:not([tabindex]), img[onclick]:not([tabindex]), div[onclick]:not([tabindex]), span[onclick]:not([tabindex])")) {
      issues.push(issue(element, reasons.KEYBOARD_ACCESS_MISSING, "error"));
    }

    for (const element of inventory.formControls) {
      if (!core.accessibleNameSource(element).name) {
        issues.push(issue(element, reasons.FORM_LABEL_MISSING, "error"));
      }
    }

    for (const element of inventory.images) {
      if (!element.hasAttribute("alt")) issues.push(issue(element, reasons.IMAGE_ALT_MISSING, "warning"));
    }

    if (root === document && inventory.landmarks.filter(isMainLandmark).length === 0) {
      issues.push({ element: document.documentElement, fingerprint: "document", reasonCode: reasons.LANDMARK_MISSING, severity: "warning", evidence: { landmark: "main" } });
    }

    return { inventory, issues };
  }

  function collect(root, selector) {
    const matches = [];
    if (root?.matches?.(selector)) matches.push(root);
    for (const element of root?.querySelectorAll?.(selector) || []) matches.push(element);
    return matches.filter((element) => core.isElementVisible(element) && !core.isExtensionOwned(element));
  }

  function issue(element, reasonCode, severity) {
    return { element, fingerprint: core.stableFingerprint(element), reasonCode, severity, evidence: {} };
  }

  function isMainLandmark(element) {
    return element.tagName?.toLowerCase() === "main" || element.getAttribute?.("role") === "main";
  }

  function findReliableNearbyLabel(control) {
    if (!control || core.accessibleNameSource(control).name) return null;
    const container = control.parentElement;
    if (!container || core.isExtensionOwned(container)) return null;
    const controls = Array.from(container.querySelectorAll("input:not([type='hidden']), select, textarea"));
    if (controls.length !== 1) return null;
    const labels = Array.from(container.children).filter((child) => child.tagName === "LABEL");
    if (labels.length !== 1 || labels[0].contains(control)) return null;
    const labelText = core.normalizeText(labels[0].textContent);
    return labelText && labelText.length <= 120 ? labels[0] : null;
  }

  globalScope.BAA_ACCESSIBILITY_SCANNER = Object.freeze({ findReliableNearbyLabel, scan });
})(globalThis);
