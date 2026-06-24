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

  function translatePage(root = document.body) {
    if (!root) return;
    translateTextNodes(root);
    translateAttributes(root);
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

    for (const node of textNodes) {
      translateTextNode(node);
    }
  }

  function translateTextNode(node) {
    if (node.__baaTranslated) return;

    const originalText = node.nodeValue;
    const translatedText = translateText(originalText);

    if (translatedText !== originalText) {
      node.__baaOriginalText = originalText;
      node.nodeValue = translatedText;
      node.__baaTranslated = true;
    }
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
    }
  }

  function translateAttributes(root) {
    const elements = root.matches ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];

    for (const element of elements) {
      if (SKIPPED_TAGS.has(element.tagName)) continue;

      for (const attributeName of TRANSLATABLE_ATTRIBUTES) {
        const value = element.getAttribute(attributeName);
        if (!value || element.dataset[`baa${toDatasetSuffix(attributeName)}Translated`]) continue;

        const translatedValue = translateText(value);
        if (translatedValue !== value) {
          element.setAttribute(`data-baa-original-${attributeName}`, value);
          element.setAttribute(attributeName, translatedValue);
          element.dataset[`baa${toDatasetSuffix(attributeName)}Translated`] = "true";
        }
      }
    }
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

    const translated = text.replace(/\b[A-Za-z][A-Za-z'-]*\b/g, (word) => {
      return dictionary.shortWords?.[word.toLowerCase()] || word;
    });

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

  globalScope.BAA_DOM_TRANSLATOR = {
    restorePage,
    translatePage,
    translateText
  };
})(window);
