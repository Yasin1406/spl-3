(function registerContentProtection(scope) {
  const core = scope.BAA_ACCESSIBILITY_CORE;
  const critical = /\b(?:security|warning|error|invalid|payment|checkout|billing|invoice|total|price|consent|privacy|legal|terms|conditions|copyright|authentication|password|login|log\s+in|sign\s+in|sign\s+out|logout|submit|continue|next|previous|back|confirm|cancel|save|delete|purchase|buy|accept|agree|reject|decline|unsubscribe)\b|[$€£৳]\s*[\d০-৯]|\b(?:USD|BDT|EUR|GBP)\b|সতর্ক|নিরাপত্তা|ভুল|ত্রুটি|পেমেন্ট|মূল্য|মোট|সম্মতি|গোপনীয়|শর্ত|আইন|লগইন|পাসওয়ার্ড|জমা|পরবর্তী|নিশ্চিত|বাতিল|টাকা|গ্রহণ|প্রত্যাখ্যান/i;
  const semantic = "main,form,nav,search,dialog,button,iframe,object,embed,canvas,[role='button'],[role='checkbox'],[role='tab'],[role='menuitem'],[role='main'],[role='form'],[role='navigation'],[role='search'],[role='dialog'],[role='alert'],[role='alertdialog'],[role='status'],[aria-live]:not([aria-live='off']),[aria-invalid]:not([aria-invalid='false']),[aria-errormessage],input,select,textarea,[contenteditable]:not([contenteditable='false']),[autocomplete^='cc-']";
  const excluded = "script,style,noscript,template,input,select,textarea,[contenteditable]:not([contenteditable='false']),[data-baa-owned='true']";
  function attribute(element, name) {
    return element.getAttribute(`data-baa-original-${name}`) ?? element.getAttribute(name) ?? "";
  }
  // Bounded local extraction. A bound hit means uncertainty, never permission to lower priority.
  function evidence(element) {
    const walker = element.ownerDocument.createTreeWalker(element, 4);
    let text = "", count = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (++count > 2000) return { text, uncertain: true };
      if (node.parentElement.closest(excluded) || !core.isElementVisible(node.parentElement)) continue;
      text += " " + (node.__baaTranslated && node.nodeValue === node.__baaAppliedText ? node.__baaOriginalText : node.nodeValue);
      if (text.length > 16000) return { text, uncertain: true };
    }
    return { text, uncertain: false };
  }
  function inspect(element, { focusedElement = null } = {}) {
    if (!element) return { protected: true, reasons: ["UNKNOWN_REGION"] };
    if (focusedElement && (element.contains(focusedElement) || focusedElement.contains?.(element))) return { protected: true, reasons: ["CURRENT_FOCUS"] };
    if (element.closest(semantic + ",[aria-modal='true']") || element.querySelector(semantic + ",[aria-modal='true']")) return { protected: true, reasons: ["CRITICAL_SEMANTICS"] };
    const nodes = [element, ...element.querySelectorAll("*")];
    if (nodes.length > 2000) return { protected: true, reasons: ["ANALYSIS_LIMIT"] };
    for (const node of nodes) {
      if (node.shadowRoot) return { protected: true, reasons: ["EMBEDDED_CONTENT"] };
      const labels = ["aria-label", "alt", "title", "id", "class", "name", "autocomplete"].map(key => attribute(node, key)).join(" ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
      if (critical.test(labels)) return { protected: true, reasons: ["CRITICAL_LABEL"] };
      // Examine only an action's path, never its query values or form input values.
      const path = attribute(node, "href").split(/[?#]/)[0].replace(/[_-]/g, " ");
      if (critical.test(path)) return { protected: true, reasons: ["CRITICAL_ACTION"] };
      for (const attr of ["aria-labelledby", "aria-describedby", "aria-errormessage"]) {
        for (const id of attribute(node, attr).split(/\s+/).filter(Boolean)) {
          const linked = element.ownerDocument.getElementById(id);
          if (!linked) return { protected: true, reasons: ["UNRESOLVED_REFERENCE"] };
          const content = evidence(linked);
          if (content.uncertain || critical.test(content.text)) return { protected: true, reasons: ["CRITICAL_REFERENCE"] };
        }
      }
    }
    const content = evidence(element);
    if (content.uncertain || critical.test(content.text)) return { protected: true, reasons: [content.uncertain ? "ANALYSIS_LIMIT" : "CRITICAL_TEXT"] };
    return { protected: false, reasons: [] };
  }
  scope.BAA_CONTENT_PROTECTION = Object.freeze({ inspect, evidence, attribute });
})(globalThis);
