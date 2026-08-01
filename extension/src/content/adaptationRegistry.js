(function registerAdaptationRegistry(globalScope) {
  function createRegistry() {
    const adaptations = new Map();
    let sequence = 0;

    function applyAttribute({ element, attribute, value, reasonCode, ruleScore = 1 }) {
      if (!element || !attribute || adaptations.has(element)) return null;

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
          adaptations.delete(element);
        }
      });

      adaptations.set(element, record);
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
