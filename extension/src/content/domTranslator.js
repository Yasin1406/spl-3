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

  function translateText(text) {
    const dictionary = globalScope.BAA_DICTIONARY || { phrases: {}, words: {} };
    let translated = text;

    for (const [english, bangla] of Object.entries(dictionary.phrases)) {
      translated = replaceCaseInsensitivePhrase(translated, english, bangla);
    }

    translated = translated.replace(/\b[A-Za-z][A-Za-z'-]*\b/g, (word) => {
      const lowerWord = word.toLowerCase();
      return dictionary.words[lowerWord] || word;
    });

    return translated;
  }

  function replaceCaseInsensitivePhrase(text, phrase, replacement) {
    const pattern = new RegExp(escapeRegExp(phrase), "gi");
    return text.replace(pattern, replacement);
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function toDatasetSuffix(attributeName) {
    return attributeName
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
  }

  globalScope.BAA_DOM_TRANSLATOR = {
    translatePage,
    translateText
  };
})(window);
