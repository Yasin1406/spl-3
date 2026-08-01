(function registerDomTranslator(globalScope) {
  const SKIPPED_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "CODE",
    "PRE",
    "TEXTAREA",
    "INPUT",
    "SELECT",
    "OPTION"
  ]);

  const TRANSLATABLE_ATTRIBUTES = [
    "aria-label",
    "title",
    "alt",
    "placeholder"
  ];
  const pendingAiTargets = new Map();
  let aiSequence = 0;

  function translatePage(root = document.body) {
    if (!root) return [];
    return [...translateTextNodes(root), ...translateAttributes(root)];
  }

  function restorePage(root = document.body) {
    if (!root) return;
    restoreTextNodes(root);
    restoreAttributes(root);
  }

  function translateTextNodes(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.parentElement) return NodeFilter.FILTER_REJECT;
          if (SKIPPED_TAGS.has(node.parentElement.tagName)) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    return textNodes.map(translateTextNode).filter(Boolean);
  }

  function translateTextNode(node) {
    if (node.__baaTranslated || node.__baaAiPendingId) return null;

    const originalText = node.nodeValue;
    const translatedText = translateText(originalText);

    if (translatedText !== originalText) {
      node.__baaOriginalText = originalText;
      node.nodeValue = translatedText;
      node.__baaTranslated = true;
      return null;
    }

    return createAiCandidate({ kind: "text", target: node, text: originalText, context: node.parentElement?.tagName?.toLowerCase() || "page text" });
  }

  function restoreTextNodes(root) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.__baaTranslated) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    for (const node of textNodes) {
      node.nodeValue = node.__baaOriginalText;
      node.__baaTranslated = false;
      node.__baaOriginalText = "";
      node.__baaAiPendingId = "";
    }
  }

  function translateAttributes(root) {
    const elements = root.matches ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];

    const candidates = [];
    for (const element of elements) {
      if (SKIPPED_TAGS.has(element.tagName)) continue;

      for (const attributeName of TRANSLATABLE_ATTRIBUTES) {
        const value = element.getAttribute(attributeName);
        const suffix = toDatasetSuffix(attributeName);
        if (!value || element.dataset[`baa${suffix}Translated`] || element.dataset[`baa${suffix}AiPending`]) continue;

        const translatedValue = translateText(value);
        if (translatedValue !== value) {
          element.setAttribute(`data-baa-original-${attributeName}`, value);
          element.setAttribute(attributeName, translatedValue);
          element.dataset[`baa${toDatasetSuffix(attributeName)}Translated`] = "true";
        } else {
          const candidate = createAiCandidate({ kind: "attribute", target: element, attributeName, text: value, context: `${element.tagName.toLowerCase()} ${attributeName}` });
          if (candidate) candidates.push(candidate);
        }
      }
    }
    return candidates;
  }

  function restoreAttributes(root) {
    const elements = root.matches ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];

    for (const element of elements) {
      for (const attributeName of TRANSLATABLE_ATTRIBUTES) {
        const originalAttributeName = `data-baa-original-${attributeName}`;
        const originalValue = element.getAttribute(originalAttributeName);
        const datasetKey = `baa${toDatasetSuffix(attributeName)}Translated`;

        if (originalValue !== null) {
          element.setAttribute(attributeName, originalValue);
          element.removeAttribute(originalAttributeName);
          delete element.dataset[datasetKey];
        }
        delete element.dataset[`baa${toDatasetSuffix(attributeName)}AiPending`];
      }
    }
  }

  function translateText(text) {
    const dictionary = globalScope.BAA_DICTIONARY || {};
    const leadingWhitespace = text.match(/^\s*/)[0];
    const trailingWhitespace = text.match(/\s*$/)[0];
    const coreText = text.trim();

    if (!coreText) return text;

    const translatedCore =
      translateExactPhrase(coreText, dictionary) ||
      translatePattern(coreText, dictionary) ||
      translateShortText(coreText, dictionary);

    if (!translatedCore) {
      return text;
    }

    return `${leadingWhitespace}${translatedCore}${trailingWhitespace}`;
  }

  function translateExactPhrase(text, dictionary) {
    const normalized = normalizeKey(text);
    return dictionary.exactPhrases?.[normalized] || "";
  }

  function translatePattern(text, dictionary) {
    return translateAuthPattern(text, dictionary) ||
      translateFieldOrPattern(text, dictionary);
  }

  function translateAuthPattern(text, dictionary) {
    const match = text.match(/^(log|sign)\s+in\s+to\s+(.+?)[.!?]?$/i);
    if (!match) return "";

    const action = match[1].toLowerCase();
    const brand = translateBrand(match[2], dictionary, "locative");
    const actionText = action === "sign"
      ? "\u09b8\u09be\u0987\u09a8 \u0987\u09a8 \u0995\u09b0\u09c1\u09a8"
      : "\u09b2\u0997 \u0987\u09a8 \u0995\u09b0\u09c1\u09a8";

    return `${brand} ${actionText}`;
  }

  function translateFieldOrPattern(text, dictionary) {
    const match = text.match(/^(.+?)\s+or\s+(.+?)[.!?]?$/i);
    if (!match) return "";

    const firstField = translateField(match[1], dictionary);
    const secondField = translateField(match[2], dictionary);

    if (!firstField || !secondField) return "";

    return `${firstField} \u09ac\u09be ${secondField}`;
  }

  function translateShortText(text, dictionary) {
    const words = text.match(/[A-Za-z][A-Za-z'-]*/g) || [];
    if (words.length === 0 || words.length > 3) return "";

    if (!words.every((word) => dictionary.shortWords?.[word.toLowerCase()])) return "";
    const translated = text.replace(/\b[A-Za-z][A-Za-z'-]*\b/g, (word) => dictionary.shortWords[word.toLowerCase()]);

    return translated !== text ? translated : "";
  }

  function translateBrand(value, dictionary, form) {
    const normalized = normalizeKey(value);
    const brand = dictionary.brands?.[normalized];

    if (brand?.[form]) return brand[form];
    if (brand?.name) return `${brand.name}-\u098f`;
    return `${value.trim()}-\u098f`;
  }

  function translateField(value, dictionary) {
    return dictionary.fields?.[normalizeKey(value)] || "";
  }

  function normalizeKey(value) {
    return value
      .replace(/[.!?]+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function toDatasetSuffix(attributeName) {
    return attributeName
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
  }

  function createAiCandidate({ kind, target, attributeName = "", text, context }) {
    const normalizedText = String(text || "").trim();
    if (!/[A-Za-z]/.test(normalizedText) || normalizedText.length > 500) return null;
    const id = `translation-${++aiSequence}`;
    pendingAiTargets.set(id, { kind, target, attributeName, originalText: text });
    if (kind === "text") target.__baaAiPendingId = id;
    else target.dataset[`baa${toDatasetSuffix(attributeName)}AiPending`] = id;
    return { id, text: normalizedText, context };
  }

  function applyAiTranslations(translations) {
    let applied = 0;
    for (const translation of translations || []) {
      const pending = pendingAiTargets.get(translation?.id);
      const translatedText = String(translation?.translatedText || "").trim();
      if (!pending || !/[\u0980-\u09FF]/u.test(translatedText)) continue;
      if (pending.kind === "text") {
        const leadingWhitespace = pending.originalText.match(/^\s*/)[0];
        const trailingWhitespace = pending.originalText.match(/\s*$/)[0];
        pending.target.__baaOriginalText = pending.originalText;
        pending.target.nodeValue = `${leadingWhitespace}${translatedText}${trailingWhitespace}`;
        pending.target.__baaTranslated = true;
        pending.target.__baaAiPendingId = "";
      } else {
        const suffix = toDatasetSuffix(pending.attributeName);
        pending.target.setAttribute(`data-baa-original-${pending.attributeName}`, pending.originalText);
        pending.target.setAttribute(pending.attributeName, translatedText);
        pending.target.dataset[`baa${suffix}Translated`] = "true";
        delete pending.target.dataset[`baa${suffix}AiPending`];
      }
      pendingAiTargets.delete(translation.id);
      applied += 1;
    }
    return applied;
  }

  function discardAiCandidates(ids) {
    for (const id of ids || []) {
      const pending = pendingAiTargets.get(id);
      if (!pending) continue;
      if (pending.kind === "text") pending.target.__baaAiPendingId = "";
      else delete pending.target.dataset[`baa${toDatasetSuffix(pending.attributeName)}AiPending`];
      pendingAiTargets.delete(id);
    }
  }

  globalScope.BAA_DOM_TRANSLATOR = {
    applyAiTranslations,
    discardAiCandidates,
    restorePage,
    translatePage,
    translateText
  };
})(window);
