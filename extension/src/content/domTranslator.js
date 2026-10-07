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
  const EXCLUDED_SELECTOR = "script, style, noscript, code, pre, textarea, input, select, option, [hidden], [inert], [aria-hidden='true'], [data-baa-owned='true'], [contenteditable]:not([contenteditable='false'])";

  function translatePage(root = document.body) {
    if (!root) return [];
    return [...translateTextNodes(root), ...translateAttributes(root)];
  }

  function restorePage(root = document.body) {
    discardAiCandidates([...pendingAiTargets.keys()]);
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
          if (isExcluded(node.parentElement)) return NodeFilter.FILTER_REJECT;
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    return textNodes.flatMap(translateTextNode);
  }

  function translateTextNode(node) {
    if (node.__baaTranslated) {
      if (node.nodeValue === node.__baaAppliedText) return [];
      // A site updated this text after translation. Treat the new authored text as a fresh source.
      node.__baaTranslated = false;
      node.__baaOriginalText = "";
    }
    if (node.__baaAiPendingId) {
      const pending = pendingAiTargets.get(node.__baaAiPendingId);
      if (pending?.group.originalText === node.nodeValue) return [];
      discardAiCandidates([node.__baaAiPendingId]);
    }

    const originalText = node.nodeValue;
    const translatedText = translateText(originalText);

    if (translatedText !== originalText) {
      node.__baaOriginalText = originalText;
      node.nodeValue = translatedText;
      node.__baaTranslated = true;
      node.__baaAppliedText = translatedText;
      return [];
    }

    return createAiCandidates({ kind: "text", target: node, text: originalText, context: node.parentElement?.tagName?.toLowerCase() || "page text" });
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
      if (node.nodeValue === node.__baaAppliedText) node.nodeValue = node.__baaOriginalText;
      node.__baaTranslated = false;
      node.__baaOriginalText = "";
      node.__baaAiPendingId = "";
      node.__baaAppliedText = "";
    }
  }

  function translateAttributes(root) {
    const elements = root.matches ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];

    const candidates = [];
    for (const element of elements) {
      if (isExcluded(element)) continue;

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
          candidates.push(...createAiCandidates({ kind: "attribute", target: element, attributeName, text: value, context: `${element.tagName.toLowerCase()} ${attributeName}` }));
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

  function isExcluded(element) {
    if (SKIPPED_TAGS.has(element.tagName) || element.closest?.(EXCLUDED_SELECTOR)) return true;
    const view = element.ownerDocument?.defaultView;
    for (let ancestor = element; ancestor && view?.getComputedStyle; ancestor = ancestor.parentElement) {
      const style = view.getComputedStyle(ancestor);
      if (style.display === "none" || style.visibility === "hidden") return true;
    }
    return false;
  }

  function splitText(text) {
    const chunks = [];
    let remaining = text;
    while (remaining.length > 500) {
      const window = remaining.slice(0, 500);
      // Prefer sentence endings, then word boundaries. Keep all original whitespace for reassembly.
      const sentences = [...window.matchAll(/[.!?][\s]+/g)];
      const lastSentence = sentences.at(-1);
      let end = lastSentence && lastSentence.index >= 200 ? lastSentence.index + lastSentence[0].length : 0;
      if (!end) {
        const spaces = [...window.matchAll(/\s+/g)];
        const lastSpace = spaces.at(-1);
        end = lastSpace ? lastSpace.index + lastSpace[0].length : 500;
      }
      chunks.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  }

  function createAiCandidates({ kind, target, attributeName = "", text, context }) {
    if (!/[A-Za-z]/.test(String(text || ""))) return [];
    const chunks = splitText(text);
    const group = { kind, target, attributeName, originalText: text, chunks, results: chunks.map(() => null), ids: [] };
    const candidates = [];
    chunks.forEach((chunk, index) => {
      if (!/[A-Za-z]/.test(chunk)) {
        group.results[index] = chunk;
        return;
      }
      const id = `translation-${++aiSequence}`;
      group.ids.push(id);
      pendingAiTargets.set(id, { group, index });
      candidates.push({ id, text: chunk.trim(), context });
    });
    group.marker = group.ids[0];
    if (kind === "text") target.__baaAiPendingId = group.marker;
    else target.dataset[`baa${toDatasetSuffix(attributeName)}AiPending`] = group.marker;
    return candidates;
  }

  function applyAiTranslations(translations) {
    let applied = 0;
    for (const translation of translations || []) {
      const pending = pendingAiTargets.get(translation?.id);
      const translatedText = String(translation?.translatedText || "").trim();
      if (!pending || !/[\u0980-\u09FF]/u.test(translatedText)) continue;
      const { group, index } = pending;
      const currentText = group.kind === "text" ? group.target.nodeValue : group.target.getAttribute(group.attributeName);
      if (group.target.isConnected === false || currentText !== group.originalText) {
        discardAiCandidates(group.ids);
        continue;
      }
      const chunk = group.chunks[index];
      group.results[index] = `${chunk.match(/^\s*/)[0]}${translatedText}${chunk.match(/\s*$/)[0]}`;
      // Keep all IDs until completion so stopping or rescanning can discard the entire group.
      if (group.results.some((result) => result === null)) continue;
      const resultText = group.results.join("");
      if (group.kind === "text") {
        group.target.__baaOriginalText = group.originalText;
        group.target.nodeValue = resultText;
        group.target.__baaAppliedText = resultText;
        group.target.__baaTranslated = true;
      } else {
        const suffix = toDatasetSuffix(group.attributeName);
        group.target.setAttribute(`data-baa-original-${group.attributeName}`, group.originalText);
        group.target.setAttribute(group.attributeName, resultText);
        group.target.dataset[`baa${suffix}Translated`] = "true";
      }
      discardAiCandidates(group.ids);
      applied += 1;
    }
    return applied;
  }

  function discardAiCandidates(ids) {
    for (const id of ids || []) {
      const pending = pendingAiTargets.get(id);
      if (!pending) continue;
      const { group } = pending;
      if (group.kind === "text") group.target.__baaAiPendingId = "";
      else delete group.target.dataset[`baa${toDatasetSuffix(group.attributeName)}AiPending`];
      for (const groupId of group.ids) pendingAiTargets.delete(groupId);
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
