(function registerNoiseClassifier(scope) {
  const protection = scope.BAA_CONTENT_PROTECTION;
  const threshold = 0.8;
  const promotional = /\b(?:ad|ads|advertisement|advertising|sponsored|promo|promotion|promotional|recommended|recommendations)\b|বিজ্ঞাপন|স্পনসর|অফার|প্রচার/i;
  function signature(element) {
    return element.localName + ":" + [...element.children].map(child => child.localName + ":" + [...child.children].map(node => node.localName).join(",")).join("|");
  }
  function linkSignature(element) {
    return [...element.querySelectorAll("a[href]")].map(link => link.getAttribute("href")).sort().join("|");
  }
  function classify(entries, { focusedElement = null } = {}) {
    const results = new Map(), structures = new Map(), links = new Map();
    // Count distinct regions, not headings nested inside the same block.
    const regions = entries.filter(entry => !["heading", "error"].includes(entry.type));
    for (const { element } of regions) {
      const structure = signature(element), group = linkSignature(element);
      structures.set(structure, (structures.get(structure) || 0) + 1);
      if (group && element.querySelectorAll("a[href]").length >= 2) links.set(group, (links.get(group) || 0) + 1);
    }
    for (const entry of regions) {
      const element = entry.element, guard = protection.inspect(element, { focusedElement });
      let score = 0; const reasons = [];
      const labels = ["id", "class", "aria-label", "title"].map(key => protection.attribute(element, key)).join(" ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
      const explicit = promotional.test(labels);
      const vocabulary = promotional.test(protection.evidence(element).text);
      if (explicit) { score += 0.65; reasons.push("PROMOTIONAL_LABEL"); }
      if (vocabulary) { score += 0.25; reasons.push("PROMOTIONAL_TEXT"); }
      if (!element.closest("main,[role='main']")) { score += 0.15; reasons.push("OUTSIDE_MAIN"); }
      if (element.matches("aside,footer,[role='complementary'],[role='contentinfo']")) { score += 0.15; reasons.push("SECONDARY_PLACEMENT"); }
      if (element.children.length && structures.get(signature(element)) >= 3) { score += 0.2; reasons.push("REPEATED_STRUCTURE"); }
      if (links.get(linkSignature(element)) >= 2) { score += 0.2; reasons.push("REPEATED_LINK_GROUP"); }
      score = Math.min(1, Math.round(score * 100) / 100);
      results.set(element, { noiseScore: score, noiseReasons: reasons, protected: guard.protected, protectionReasons: guard.reasons, lowPriority: !guard.protected && (explicit || vocabulary) && score >= threshold });
    }
    return entries.map(entry => {
      const own = results.get(entry.element) || { noiseScore: 0, noiseReasons: [], protected: entry.type === "error", protectionReasons: [], lowPriority: false };
      const ancestors = regions.filter(region => region.element !== entry.element && region.element.contains(entry.element));
      // A protected containing region wins over all promotional evidence.
      const guarded = own.protected || ancestors.some(region => results.get(region.element).protected);
      const lowPriority = !guarded && (own.lowPriority || ancestors.some(region => results.get(region.element).lowPriority));
      return { ...entry, ...own, protected: guarded, lowPriority };
    });
  }
  scope.BAA_NOISE_CLASSIFIER = Object.freeze({ classify, threshold });
})(globalThis);
