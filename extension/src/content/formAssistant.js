(function registerFormAssistant(globalScope) {
  const core = globalScope.BAA_ACCESSIBILITY_CORE;
  const reasons = globalScope.BAA_REASON_CODES;
  if (!core || !reasons) return;

  const CONTROL_SELECTOR = "input:not([type='hidden']):not([type='button']):not([type='submit']):not([type='reset']), select, textarea";

  function extractConstraints(control) {
    const constraints = [];
    if (control.required || control.getAttribute?.("aria-required") === "true") constraints.push({ type: "required" });
    addNumberConstraint(constraints, control, "minLength", "minlength");
    addNumberConstraint(constraints, control, "maxLength", "maxlength");
    addStringConstraint(constraints, control, "min");
    addStringConstraint(constraints, control, "max");

    const type = String(control.type || control.getAttribute?.("type") || "").toLowerCase();
    if (type === "email") constraints.push({ type: "email" });

    const pattern = String(control.pattern || control.getAttribute?.("pattern") || "").trim();
    if (pattern) constraints.push({ type: "pattern", value: pattern, recognized: recognizePattern(pattern) });
    return constraints;
  }

  function buildBanglaGuidance(control) {
    const constraints = extractConstraints(control);
    const messages = [];
    let recognized = 0;
    for (const constraint of constraints) {
      const message = constraintMessage(constraint);
      if (message) {
        messages.push(message);
        recognized += 1;
      }
    }
    const total = constraints.length;
    return {
      message: messages.join(" "),
      constraints,
      coverage: total === 0 ? 1 : recognized / total,
      reasonCode: reasons.FORM_CONSTRAINT_EXPLANATION,
      requiresAi: total > 0 && recognized / total < 0.9
    };
  }

  function createFormAssistant({ documentRef = document, registry, announcer }) {
    const descriptions = new Map();
    const announcedMessages = new WeakMap();
    const customValidityControls = new Set();

    function start() {
      documentRef.addEventListener("invalid", handleInvalid, true);
      documentRef.addEventListener("blur", handleBlur, true);
      documentRef.addEventListener("input", handleInput, true);
    }

    function stop() {
      documentRef.removeEventListener("invalid", handleInvalid, true);
      documentRef.removeEventListener("blur", handleBlur, true);
      documentRef.removeEventListener("input", handleInput, true);
      for (const control of customValidityControls) clearBanglaCustomValidity(control, customValidityControls);
      for (const description of descriptions.values()) description.remove();
      descriptions.clear();
    }

    function handleInvalid(event) {
      if (isSupportedControl(event.target)) explainInvalidControl(event.target, true);
    }

    function handleBlur(event) {
      if (isSupportedControl(event.target) && event.target.validity && !event.target.validity.valid) {
        explainInvalidControl(event.target, false);
      }
    }

    function handleInput(event) {
      const control = event.target;
      if (!isSupportedControl(control)) return;
      clearBanglaCustomValidity(control, customValidityControls);
      if (!control.validity?.valid) return;
      const description = descriptions.get(control);
      if (description) description.textContent = "";
      announcedMessages.delete(control);
    }

    function explainInvalidControl(control, assertive) {
      const guidance = buildInvalidGuidance(control);
      if (!guidance) return;
      setBanglaCustomValidity(control, guidance, customValidityControls);
      const description = ensureDescription(control);
      description.textContent = guidance;
      if (announcedMessages.get(control) !== guidance) {
        announcer?.announce(guidance, assertive ? "assertive" : "polite");
        announcedMessages.set(control, guidance);
      }
    }

    function ensureDescription(control) {
      if (descriptions.has(control)) return descriptions.get(control);
      const description = documentRef.createElement("span");
      description.id = `baa-form-guidance-${Math.random().toString(36).slice(2, 10)}`;
      description.dataset.baaOwned = "true";
      description.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;";
      control.insertAdjacentElement("afterend", description);
      const existingIds = core.normalizeText(control.getAttribute("aria-describedby")).split(" ").filter(Boolean);
      registry.applyAttribute({
        element: control,
        attribute: "aria-describedby",
        value: [...new Set([...existingIds, description.id])].join(" "),
        reasonCode: reasons.FORM_CONSTRAINT_EXPLANATION,
        ruleScore: 1
      });
      descriptions.set(control, description);
      return description;
    }

    return Object.freeze({ start, stop });
  }

  function buildInvalidGuidance(control) {
    const validity = control.validity || {};
    const constraints = extractConstraints(control);
    const relevant = [];
    if (validity.valueMissing) relevant.push(...constraints.filter((item) => item.type === "required"));
    if (validity.typeMismatch) relevant.push(...constraints.filter((item) => item.type === "email"));
    if (validity.tooShort) relevant.push(...constraints.filter((item) => item.type === "minlength"));
    if (validity.tooLong) relevant.push(...constraints.filter((item) => item.type === "maxlength"));
    if (validity.rangeUnderflow) relevant.push(...constraints.filter((item) => item.type === "min"));
    if (validity.rangeOverflow) relevant.push(...constraints.filter((item) => item.type === "max"));
    if (validity.patternMismatch) relevant.push(...constraints.filter((item) => item.type === "pattern"));
    const selected = relevant.length > 0 ? relevant : constraints;
    const messages = selected.map(constraintMessage).filter(Boolean);
    if (messages.length === 0) return "এই ঘরের তথ্যটি সঠিক নয়। অনুগ্রহ করে আবার পরীক্ষা করুন।";
    return [...new Set(messages)].join(" ");
  }

  function constraintMessage(constraint) {
    if (constraint.type === "required") return "এই ঘরটি পূরণ করা বাধ্যতামূলক।";
    if (constraint.type === "email") return "সঠিক ইমেইল ঠিকানা লিখুন, যেমন name@example.com।";
    if (constraint.type === "minlength") return `অন্তত ${toBanglaNumber(constraint.value)}টি অক্ষর লিখুন।`;
    if (constraint.type === "maxlength") return `সর্বোচ্চ ${toBanglaNumber(constraint.value)}টি অক্ষর লিখুন।`;
    if (constraint.type === "min") return `মানটি কমপক্ষে ${toBanglaNumber(constraint.value)} হতে হবে।`;
    if (constraint.type === "max") return `মানটি সর্বোচ্চ ${toBanglaNumber(constraint.value)} হতে হবে।`;
    if (constraint.type === "pattern" && constraint.recognized.length > 0) return `${constraint.recognized.join(" ")} শর্তগুলো অনুসরণ করুন।`;
    return "";
  }

  function recognizePattern(pattern) {
    const messages = [];
    if (/\[A-Z\]|\\p\{Lu\}/.test(pattern)) messages.push("অন্তত একটি ইংরেজি বড় হাতের অক্ষর দিন।");
    if (/\\d|\[0-9\]/.test(pattern)) messages.push("অন্তত একটি সংখ্যা দিন।");
    if (/\[[^\]]*[!@#$%^&][^\]]*\]/.test(pattern) || /\\[!*]/.test(pattern)) messages.push("অন্তত একটি বিশেষ চিহ্ন দিন।");
    return messages;
  }

  function addNumberConstraint(output, control, property, attribute) {
    const raw = control.getAttribute?.(attribute);
    const value = raw !== null && raw !== undefined && raw !== "" ? Number(raw) : Number(control[property]);
    if (Number.isFinite(value) && value >= 0) output.push({ type: attribute, value });
  }

  function addStringConstraint(output, control, attribute) {
    const value = String(control.getAttribute?.(attribute) || "").trim();
    if (value) output.push({ type: attribute, value });
  }

  function toBanglaNumber(value) {
    return String(value).replace(/\d/g, (digit) => "০১২৩৪৫৬৭৮৯"[Number(digit)]);
  }

  function isSupportedControl(target) {
    return Boolean(target?.matches?.(CONTROL_SELECTOR) && !core.isExtensionOwned(target));
  }

  function setBanglaCustomValidity(control, message, ownedControls) {
    if (typeof control?.setCustomValidity !== "function" || !message) return false;
    if (control.validity?.customError && !ownedControls.has(control)) return false;
    control.setCustomValidity(message);
    ownedControls.add(control);
    return true;
  }

  function clearBanglaCustomValidity(control, ownedControls) {
    if (!ownedControls.has(control) || typeof control?.setCustomValidity !== "function") return false;
    control.setCustomValidity("");
    ownedControls.delete(control);
    return true;
  }

  globalScope.BAA_FORM_ASSISTANT = Object.freeze({
    buildBanglaGuidance,
    buildInvalidGuidance,
    createFormAssistant,
    clearBanglaCustomValidity,
    extractConstraints,
    setBanglaCustomValidity,
    toBanglaNumber
  });
})(globalThis);
