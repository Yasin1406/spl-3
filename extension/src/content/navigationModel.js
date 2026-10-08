(function registerNavigationModel(globalScope) {
  const core = globalScope.BAA_ACCESSIBILITY_CORE;
  const types = Object.freeze({ main: "মূল কনটেন্ট", navigation: "নেভিগেশন", search: "সার্চ", complementary: "পার্শ্ব অংশ", banner: "হেডার", contentinfo: "ফুটার", region: "অঞ্চল", form: "ফর্ম", heading: "শিরোনাম", error: "ভুল" });
  const selector = "main,nav,aside,header,footer,search,section[aria-label],section[aria-labelledby],form,[role='main'],[role='navigation'],[role='search'],[role='complementary'],[role='banner'],[role='contentinfo'],[role='region'],[role='form'],h1,h2,h3,h4,h5,h6,[role='heading'],[aria-invalid],[role='alert']";
  const controls = "input:not([type='hidden']),select,textarea,[contenteditable='true'],[role='textbox'],[role='combobox'],[role='checkbox']";

  function available(element) {
    return Boolean(element?.isConnected && core.isElementVisible(element) && !core.isExtensionOwned(element) && !element.closest("dialog:not([open])"));
  }
  function explicitName(element) {
    return core.textFromReferences(element, "aria-labelledby") || core.normalizeText(element.getAttribute("aria-label"));
  }
  function collect(documentRef = document, reportedErrors = new Set()) {
    const entries = [];
    const candidates = new Set([...documentRef.querySelectorAll(selector), ...reportedErrors]);
    const ordered = [...candidates].sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & 2 ? 1 : -1);
    for (const element of ordered) {
      if (!available(element)) continue;
      const tag = element.localName;
      const role = core.normalizeText(element.getAttribute("role")).split(" ")[0];
      if (["none", "presentation"].includes(role)) continue;
      let type = null;
      if ((reportedErrors.has(element) && element.validity && !element.validity.valid) || (element.getAttribute("aria-invalid") && element.getAttribute("aria-invalid") !== "false")) type = "error";
      else if (role === "alert") {
        // Alerts also contain success/security notices. Only identify linked validation messages as errors.
        const linked = Array.from(documentRef.querySelectorAll("[aria-invalid]:not([aria-invalid='false'])")).some(field =>
          ["aria-describedby", "aria-errormessage"].some(attr => element.id && (field.getAttribute(attr) || "").split(/\s+/).includes(element.id)));
        if (!linked) continue;
        type = "error";
      } else if (role === "heading" || /^h[1-6]$/.test(tag) && !role) type = "heading";
      else if (["main", "navigation", "search", "complementary", "banner", "contentinfo", "region", "form"].includes(role)) type = role;
      else if (!role) {
        type = { main: "main", nav: "navigation", aside: "complementary", search: "search", form: "form", section: "region" }[tag];
        // Nested headers/footers are not page-level landmarks.
        if (["header", "footer"].includes(tag) && !element.parentElement.closest("article,aside,main,nav,section,[role='article'],[role='region'],[role='main'],[role='navigation'],[role='complementary']")) type = tag === "header" ? "banner" : "contentinfo";
      }
      if (!type) continue;
      let name = explicitName(element);
      if (type === "heading") name ||= core.normalizeText(element.textContent);
      if (type === "error") name ||= element.matches(controls) ? core.associatedLabelText(element) || core.normalizeText(element.getAttribute("title") || element.getAttribute("placeholder")) : core.normalizeText(element.textContent);
      if (!["heading", "error"].includes(type)) name ||= core.normalizeText(Array.from(element.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading'],legend")).find(available)?.textContent);
      if ((type === "region" && !explicitName(element)) || (type === "heading" && !name)) continue;
      const level = type === "heading" ? Number(element.getAttribute("aria-level") || tag.slice(1)) || null : null;
      const category = type === "heading" ? "headings" : type === "error" ? "errors" : ["form", "search"].includes(type) ? "forms" : "landmarks";
      entries.push({ element, type, category, level, name: name.slice(0, 180), label: `${types[type]}${level ? " " + level : ""}${name ? ": " + name.slice(0, 180) : ""}` });
    }
    // Duplicate unnamed or identically named regions remain individually reachable.
    const totals = new Map();
    for (const entry of entries) totals.set(entry.label, (totals.get(entry.label) || 0) + 1);
    const counts = new Map();
    for (const entry of entries) {
      const label = entry.label;
      counts.set(label, (counts.get(label) || 0) + 1);
      if (totals.get(label) > 1) entry.label += ` (${counts.get(label)}/${totals.get(label)})`;
    }
    return entries;
  }
  function destination(entry, documentRef = document) {
    if (!available(entry?.element)) return null;
    const element = entry.element;
    if (entry.type === "error" && element.matches(controls) && element.validity?.valid && (!element.getAttribute("aria-invalid") || element.getAttribute("aria-invalid") === "false")) return null;
    if (["form", "search"].includes(entry.type)) return Array.from(element.querySelectorAll(controls)).find(field => available(field) && !field.matches(":disabled")) || element;
    if (entry.type === "error" && !element.matches(controls) && element.id) {
      const field = Array.from(documentRef.querySelectorAll("[aria-invalid]:not([aria-invalid='false'])")).find(field => available(field) && !field.matches(":disabled") &&
        ["aria-describedby", "aria-errormessage"].some(attr => (field.getAttribute(attr) || "").split(/\s+/).includes(element.id)));
      return field || null;
    }
    return element.matches(":disabled") ? null : element;
  }
  globalScope.BAA_NAVIGATION_MODEL = Object.freeze({ collect, available, destination });
})(globalThis);
