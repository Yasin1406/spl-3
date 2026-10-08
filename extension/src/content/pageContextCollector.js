(function registerPageContextCollector(scope) {
  const core = scope.BAA_ACCESSIBILITY_CORE;
  const AUXILIARY = "[role='doc-bibliography'], [role='doc-endnotes'], [role='doc-toc']";
  const REGION = "main, article, section, form, nav, aside, header, footer, table, [role='main'], [role='article'], [role='region'], [role='form'], [role='search'], [role='navigation'], [role='complementary'], [role='grid'], [role='table'], [role='feed'], [role='log'], [role='dialog'], [itemprop='articleBody'], " + AUXILIARY;
  const SIDE_CONTENT = "nav,aside,header,footer,[role='navigation'],[role='complementary']," + AUXILIARY;
  const BLOCK = "p, li, blockquote, figcaption, pre, h1, h2, h3, h4, h5, h6, [role='heading'], [role='paragraph'], [role='alert'], [role='status'], [aria-live], output, div, span";
  const BOUNDARY = "p, li, blockquote, figcaption, pre, h1, h2, h3, h4, h5, h6, [role='heading'], [role='paragraph'], [role='alert'], [role='status'], [aria-live], output, div";
  const CONTROL = "button, a[href], input, select, textarea, [role='button'], [role='link'], [role='checkbox'], [role='tab'], [role='menuitem']";
  const EXCLUDE = "script, style, noscript, template, input, select, textarea, [contenteditable]:not([contenteditable='false']), [data-baa-owned='true']";
  const SECONDARY = /related (?:articles|stories|news)|you may also|recommended|advertisement|sponsored|সম্পর্কিত|আরও খবর|বিজ্ঞাপন/i;
  const PRIVATE = /inbox|mailbox|messages|conversation|banking|account|profile|checkout|receipt|appointment|medical record|patient portal|ইনবক্স|ব্যাংক|রোগীর|চেকআউট/i;

  function sanitize(value) {
    return core.normalizeText(value).replace(/<[^>]*>/g, " ")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[ব্যক্তিগত তথ্য]")
      .replace(/\b(?:\d[ -]?){13,19}\b/g, "[ব্যক্তিগত তথ্য]")
      .replace(/\b(?:bearer\s+\S+|(?:password|token|secret|api[_ -]?key)\s*[:=]\s*\S+)/gi, "[ব্যক্তিগত তথ্য]");
  }

  function visible(element) {
    return Boolean(element && !element.closest(EXCLUDE) && core.isElementVisible(element));
  }

  function citationLink(element) {
    const link = element.closest("a[href],[role='doc-noteref']");
    return Boolean(element.closest("[role='doc-noteref']") || link && link.closest("sup") &&
      /^#/.test(link.getAttribute("href") || "") && /^\[?\s*[\d০-৯]+(?:\s*[,–-]\s*[\d০-৯]+)*\s*\]?$/.test(core.normalizeText(link.textContent)));
  }

  function inlineUtility(element) {
    for (let parent = element; parent; parent = parent.parentElement) {
      if (parent.tagName === "SPAN" && parent.querySelector("a[href]") && /^\[?\s*(?:edit|edit section|সম্পাদনা)\s*\]?$/i.test(core.normalizeText(parent.textContent))) return true;
      if (parent.matches("p,li,div,h1,h2,h3,h4,h5,h6")) break;
    }
    return false;
  }

  function text(element) {
    if (!visible(element)) return "";
    const doc = element.ownerDocument;
    const walker = doc.createTreeWalker(element, 4, { acceptNode(node) {
      return visible(node.parentElement) && !citationLink(node.parentElement) && !inlineUtility(node.parentElement) ? 1 : 2;
    } });
    const parts = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      // Summaries use authored text, even while the extension translates the page.
      parts.push(node.__baaTranslated && node.nodeValue === node.__baaAppliedText ? node.__baaOriginalText : node.nodeValue);
    }
    return sanitize(parts.join(" "));
  }

  function name(element) {
    const references = (element.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
    const referenced = references.map(id => text(element.ownerDocument.getElementById(id))).filter(Boolean).join(" ");
    return sanitize(referenced || attribute(element, "aria-label") ||
      Array.from(element.labels || []).map(label => text(label)).join(" ") ||
      (!element.matches("input,select,textarea") ? text(element) : "") || attribute(element, "title") || "").slice(0, 240);
  }

  function attribute(element, key) {
    return element.getAttribute(`data-baa-original-${key}`) ?? element.getAttribute(key);
  }

  function inferArticles(documentRef) {
    const inferred = new Set();
    const mains = Array.from(documentRef.querySelectorAll("main,[role='main']")).filter(visible);
    for (const root of mains.length ? mains : [documentRef.body].filter(Boolean)) {
      if (Array.from(root.querySelectorAll("article,[role='article'],[itemprop='articleBody']")).some(article => visible(article) && !article.closest(SIDE_CONTENT))) continue;
      const heading = text(root.querySelector("h1,[role='heading'][aria-level='1']"));
      if (/\b(?:search|results|directory|dashboard|product|checkout|cart|application|form)\b|ফলাফল|ড্যাশবোর্ড|পণ্য|চেকআউট|ফর্ম/i.test(heading)) continue;
      const evidence = new Map();
      for (const paragraph of root.querySelectorAll("p,[role='paragraph']")) {
        if (!visible(paragraph) || paragraph.closest(`${SIDE_CONTENT},form,table,[role='form'],[role='search'],[role='table'],[role='grid'],li,[role='alert'],[role='status']`)) continue;
        const length = text(paragraph).length;
        if (length < 40) continue;
        for (let parent = paragraph.parentElement; parent && root.contains(parent); parent = parent.parentElement) {
          if (parent === root || parent.tagName === "DIV") {
            const stats = evidence.get(parent) || { count: 0, characters: 0 };
            stats.count++; stats.characters += length; evidence.set(parent, stats);
          }
        }
      }
      const total = evidence.get(root)?.characters || 0;
      // Prefer the narrowest container holding most of the prose, so unrelated
      // search/appearance tools do not compete with an unmarked article body.
      const possible = [...evidence].filter(([element, stats]) => stats.count >= 2 && stats.characters >= 160 && stats.characters >= total * 0.8 &&
        !Array.from(element.querySelectorAll("input,select,textarea")).some(field => core.isElementVisible(field) && !field.closest(SIDE_CONTENT) && !["search", "hidden", "submit", "button", "reset"].includes(field.getAttribute("type"))));
      const depth = element => { let count = 0; for (let node = element; node; node = node.parentElement) count++; return count; };
      possible.sort((a, b) => depth(b[0]) - depth(a[0]));
      if (possible.length) inferred.add(possible[0][0]);
    }
    return inferred;
  }

  function linkCollection(element) {
    if (!element.matches("table,[role='table'],[role='grid']")) return false;
    const links = Array.from(element.querySelectorAll("a[href]")).filter(visible);
    if (links.length < 3) return false;
    // Declared data headers and numeric values are stronger evidence of data
    // than link density. Presentation tables have no such semantic claim.
    if (!element.matches("[role='presentation'],[role='none']") && element.querySelector("caption,thead th,[role='columnheader']")) return false;
    const cells = Array.from(element.querySelectorAll("td,[role='cell'],[role='gridcell']"));
    if (cells.some(cell => !cell.querySelector("a[href]") && /\d|[০-৯]/.test(text(cell)))) return false;
    const content = text(element);
    return content.length > 0 && links.reduce((sum, link) => sum + text(link).length, 0) / content.length >= 0.6;
  }

  function kind(element, inferred = new Set()) {
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute("role");
    if (element.matches(AUXILIARY)) return "supporting";
    if (inferred.has(element)) return "article";
    if (tag === "form" || ["form", "search"].includes(role)) return "form";
    if (tag === "table" || ["table", "grid"].includes(role)) return "table";
    if (tag === "nav" || role === "navigation") return "navigation";
    if (["header", "footer", "aside"].includes(tag) || role === "complementary") return "supporting";
    if (tag === "article" || role === "article" || element.getAttribute("itemprop") === "articleBody") return "article";
    if (["feed", "log"].includes(role)) return "collection";
    return "section";
  }

  function collect(documentRef, { scope: requestScope = "page", focusedElement = documentRef.activeElement, allowPrivateContent = false } = {}) {
    const inferred = inferArticles(documentRef);
    const candidates = [...new Set([...documentRef.querySelectorAll(REGION), ...inferred])].filter(element => visible(element) &&
      (element.tagName !== "SECTION" || element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby") || element.querySelector("h1,h2,h3,h4,h5,h6,[role='heading']")));
    candidates.sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & 4 ? -1 : 1);
    const roots = [...new Set([documentRef.body, ...candidates].filter(Boolean))];
    const byElement = new Map();
    const targets = new Map();
    const regions = roots.map((element, index) => {
      const id = `region-${index + 1}`;
      byElement.set(element, id);
      targets.set(id, element);
      const heading = inferred.has(element) ? (element.closest("main,[role='main']") || documentRef.body).querySelector("h1,[role='heading'][aria-level='1']") : Array.from(element.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading'],caption,legend")).find(visible);
      const referenced = (element.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean).map(id => text(documentRef.getElementById(id))).join(" ");
      const title = sanitize(attribute(element, "aria-label") || referenced || text(heading)).slice(0, 240);
      return { id, type: kind(element, inferred), landmark: element.matches("main,[role='main']") ? "main" : "", name: title || "", blocks: [], controls: [], notices: [], secondary: false };
    });
    const byId = new Map(regions.map(region => [region.id, region]));
    for (const region of regions) {
      region.parentId = null;
      for (let parent = targets.get(region.id).parentElement; parent; parent = parent.parentElement) {
        if (byElement.has(parent)) { region.parentId = byElement.get(parent); break; }
      }
      const element = targets.get(region.id);
      const proseParent = inferred.has(element) || [...inferred].some(root => root.contains(element)) || Boolean(element.closest("article,[role='article'],[itemprop='articleBody']"));
      region.secondary = region.type === "supporting" || region.type === "navigation" ||
        (SECONDARY.test(region.name) && element.querySelectorAll("a[href],[role='link']").length >= 2) ||
        (/^(?:references|bibliography|see also|external links|further reading|editing tools|editorial notes|content maintenance|তথ্যসূত্র|আরও দেখুন)$/i.test(region.name) && proseParent) || linkCollection(element) ||
        Boolean(region.parentId && byId.get(region.parentId).secondary);
    }
    const owner = element => {
      for (let parent = element; parent; parent = parent.parentElement) if (byElement.has(parent)) return byId.get(byElement.get(parent));
      return byId.get(byElement.get(documentRef.body));
    };
    const validFocus = focusedElement?.isConnected && focusedElement.ownerDocument === documentRef && focusedElement !== documentRef.body && focusedElement !== documentRef.documentElement &&
      core.isElementVisible(focusedElement) && !core.isExtensionOwned(focusedElement);
    const focusedRoot = requestScope === "region" && validFocus ? targets.get(owner(focusedElement)?.id) : null;
    const limitations = new Set();
    const privateContext = Boolean(documentRef.querySelector("input[type='password'],[autocomplete^='cc-']")) ||
      PRIVATE.test([documentRef.title, ...regions.map(region => region.name)].join(" ")) ||
      Boolean(documentRef.querySelector("[role='log']"));
    let totalCharacters = 0;
    let sequence = 0;
    let omittedBlocks = 0;
    const sourceElements = new WeakMap();
    function addBlock(region, value, blockType = "text", notice = false, sourceElement = targets.get(region?.id)) {
      if (!value || !region) return;
      if (requestScope === "page" && region.secondary) return;
      if (focusedRoot && !focusedRoot.contains(sourceElement)) return;
      const pieces = [];
      let remaining = value;
      while (remaining.length > 1200) {
        const window = remaining.slice(0, 1200);
        const end = Math.max(window.lastIndexOf(" "), 600);
        pieces.push(remaining.slice(0, end)); remaining = remaining.slice(end);
      }
      if (remaining) pieces.push(remaining);
      for (const piece of pieces) {
        if (totalCharacters + piece.length > 120000 || sequence >= 400) { omittedBlocks += 1; continue; }
        const block = { id: `source-${++sequence}`, type: blockType, text: piece.trim() };
        if (!block.text) continue;
        region.blocks.push(block);
        targets.set(block.id, sourceElement);
        sourceElements.set(block, sourceElement);
        totalCharacters += piece.length;
        if (notice) region.notices.push(block.id);
      }
    }
    for (const element of documentRef.querySelectorAll(BLOCK)) {
      if (!visible(element) || element.closest("table,[role='table'],[role='grid']")) continue;
      if (element.querySelector(`${BOUNDARY}, table, form, nav, section, article, ul, ol`)) continue;
      const parentBlock = element.parentElement?.closest(BOUNDARY);
      if (element.tagName === "SPAN" && parentBlock && !parentBlock.querySelector(`${BOUNDARY}, table, form, nav, section, article, ul, ol`)) continue;
      if (element.closest("button,a[href],label")) continue;
      const region = owner(element);
      const notice = element.matches("[role='alert'],[role='status'],[aria-live],output") || /warning|security|deadline|error|invalid|সতর্ক|নিরাপত্তা|সময়সীমা|ভুল/i.test(text(element));
      addBlock(region, text(element), element.matches("h1,h2,h3,h4,h5,h6,[role='heading']") ? "heading" : "text", notice, element);
    }
    // Tables retain header/value relationships instead of becoming an unordered string of cells.
    for (const table of candidates.filter(element => kind(element, inferred) === "table")) {
      const region = byId.get(byElement.get(table));
      const headers = Array.from(table.querySelectorAll("thead th,[role='columnheader']")).filter(visible).map(text);
      const rows = Array.from(table.querySelectorAll("tr,[role='row']")).filter(visible);
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("th,td,[role='cell'],[role='gridcell'],[role='columnheader']")).filter(visible);
        if (!cells.length) continue;
        addBlock(region, cells.map((cell, index) => `${headers[index] || index + 1}: ${text(cell)}`).join("; "), "row", false, row);
      }
    }
    for (const image of documentRef.querySelectorAll("img[alt]")) {
      if (visible(image)) addBlock(owner(image), sanitize(attribute(image, "alt")), "text", false, image);
    }
    for (const region of regions) {
      const element = targets.get(region.id);
      for (const child of element.childNodes) {
        if (child.nodeType === 3 && visible(element)) addBlock(region, sanitize(child.nodeValue), "text", false, child);
      }
      region.blocks.sort((left, right) => {
        const a = sourceElements.get(left), b = sourceElements.get(right);
        if (a === b) return 0;
        return a.compareDocumentPosition(b) & 4 ? -1 : 1;
      });
    }
    for (const element of documentRef.querySelectorAll(CONTROL)) {
      if (core.isExtensionOwned(element) || !core.isElementVisible(element) || element.closest("[contenteditable]:not([contenteditable='false'])")) continue;
      const region = owner(element);
      if (!region) continue;
      const label = name(element);
      const type = element.matches("input,select,textarea") ? "field" : element.matches("a[href],[role='link']") ? "link" : "action";
      const constraints = Object.fromEntries(["type", "minlength", "maxlength", "min", "max", "pattern"].map(attribute => [attribute, sanitize(element.getAttribute(attribute) || "").slice(0, 160)]).filter(([, value]) => value));
      const taskLink = /\b(?:apply|download|buy|book|register|submit|start|track|renew|continue)\b|আবেদন|ডাউনলোড|কিনুন|বুক করুন|নিবন্ধন|জমা দিন/i.test(label);
      const relatedRegion = /see also|external links|further reading|আরও দেখুন/i.test(region.name);
      const articleList = element.closest("li") && (element.closest("article,[role='article'],[itemprop='articleBody']") || [...inferred].some(root => root.contains(element))) && !relatedRegion;
      const contextual = type === "link" && Boolean(citationLink(element) || inlineUtility(element) || element.closest("[role='doc-bibliography'],[role='doc-endnotes']") ||
        !taskLink && (element.closest("p,blockquote,figcaption") || articleList));
      if (contextual) continue;
      if (region.controls.length >= 80) { limitations.add("controls_limited"); continue; }
      const control = { id: `control-${++sequence}`, type, name: label, contextual, constraints, required: element.required === true || element.getAttribute("aria-required") === "true", invalid: element.getAttribute("aria-invalid") === "true", disabled: element.disabled === true || element.getAttribute("aria-disabled") === "true" };
      region.controls.push(control);
      targets.set(control.id, element);
    }
    for (const region of regions) {
      const element = targets.get(region.id);
      if (element.querySelector("iframe,canvas,[role='img']")) limitations.add("embedded_content_limited");
      if (element.querySelector("[aria-busy='true']")) limitations.add("loading_content");
    }
    const nonempty = regions.filter(region => region.blocks.length || region.controls.length || region.name);
    if (focusedRoot) nonempty.sort((left, right) => Number(focusedRoot.contains(targets.get(right.id))) - Number(focusedRoot.contains(targets.get(left.id))));
    if (nonempty.length > 40) limitations.add("regions_limited");
    const kept = nonempty.slice(0, 40);
    if (omittedBlocks) limitations.add("content_limited");
    let selectedRegionId = null;
    if (validFocus) {
      selectedRegionId = owner(focusedElement)?.id || null;
      if (!kept.some(region => region.id === selectedRegionId)) selectedRegionId = null;
    }
    if (privateContext && !allowPrivateContent) {
      for (const region of kept) {
        region.blocks = [];
        region.notices = [];
        region.name = "";
        region.controls = region.controls.map(control => ({ ...control, name: "" }));
      }
      limitations.add("private_structure_only");
    }
    return { context: {
      version: "1", scope: requestScope, title: privateContext && !allowPrivateContent ? "" : sanitize(documentRef.title).slice(0, 240),
      privateContext, allowPrivateContent, regions: kept, selectedRegionId,
      coverage: { complete: limitations.size === 0, limitations: [...limitations], omittedBlocks }
    }, targets };
  }
  scope.BAA_PAGE_CONTEXT = Object.freeze({ collect, sanitize });
})(globalThis);
