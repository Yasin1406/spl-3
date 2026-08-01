(function registerAdaptationRegistry(globalScope) {
  function createRegistry() {
    const adaptations = new Map();
    const attributesByElement = new WeakMap();
    let sequence = 0;

    function applyAttribute({ element, attribute, value, reasonCode, ruleScore = 1 }) {
      if (!element || !attribute) return null;
      const elementAttributes = attributesByElement.get(element) || new Map();
      if (elementAttributes.has(attribute)) return null;

      const id = `baa-adaptation-${++sequence}`;
      const hadAttribute = element.hasAttribute(attribute);
      const previousValue = element.getAttribute(attribute);
      element.setAttribute(attribute, value);
      element.setAttribute("data-baa-adapted", id);

      const record = Object.freeze({
        id,
        type: "attribute",
        reasonCode,
        ruleScore,
        validationStatus: "validated",
        rollback() {
          if (hadAttribute) element.setAttribute(attribute, previousValue);
          else element.removeAttribute(attribute);
          if (element.getAttribute("data-baa-adapted") === id) {
            element.removeAttribute("data-baa-adapted");
          }
          adaptations.delete(id);
          elementAttributes.delete(attribute);
          if (elementAttributes.size === 0) attributesByElement.delete(element);
        }
      });

      adaptations.set(id, record);
      elementAttributes.set(attribute, id);
      attributesByElement.set(element, elementAttributes);
      return record;
    }

    function rollbackAll() {
      for (const record of [...adaptations.values()].reverse()) record.rollback();
    }

    return Object.freeze({
      applyAttribute,
      get size() { return adaptations.size; },
      rollbackAll
    });
  }

  globalScope.BAA_ADAPTATION_REGISTRY = Object.freeze({ createRegistry });
})(globalThis);
