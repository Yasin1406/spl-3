(function registerKeyboardRepair(globalScope) {
  const reasons = globalScope.BAA_REASON_CODES;

  function isNativeInteractive(element) {
    return element.matches?.("a[href], button, input:not([type='hidden']), select, textarea, details, summary, [contenteditable='true']");
  }

  function isHighConfidenceClickable(element) {
    if (!element || isNativeInteractive(element) || element.hasAttribute("disabled")) return false;
    const role = element.getAttribute("role");
    return role === "button" || ((element.tagName === "IMG" || element.tagName === "DIV" || element.tagName === "SPAN") && element.hasAttribute("onclick"));
  }

  function repair(root, registry) {
    const elements = [];
    if (root?.matches?.("[role='button'], img[onclick], div[onclick], span[onclick]")) elements.push(root);
    elements.push(...(root?.querySelectorAll?.("[role='button'], img[onclick], div[onclick], span[onclick]") || []));
    let repaired = 0;
    for (const element of elements) {
      if (!isHighConfidenceClickable(element) || element.hasAttribute("tabindex")) continue;
      const tabRecord = registry.applyAttribute({ element, attribute: "tabindex", value: "0", reasonCode: reasons.KEYBOARD_ACCESS_MISSING, ruleScore: 1 });
      if (!tabRecord) continue;
      const keyHandler = (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        element.click();
      };
      registry.applyEventListener({ element, event: "keydown", listener: keyHandler, reasonCode: reasons.KEYBOARD_ACCESS_MISSING, ruleScore: 1 });
      repaired += 1;
    }
    return repaired;
  }

  globalScope.BAA_KEYBOARD_REPAIR = Object.freeze({ isHighConfidenceClickable, repair });
})(globalThis);
