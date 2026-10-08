(function registerFocusManager(globalScope) {
  function createFocusManager({ documentRef = document }) {
    const temporary = new Map();
    let highlighted = null;
    function highlight(element) {
      highlighted?.();
      const properties = ["outline", "outline-offset"];
      const previous = properties.map(name => [name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)]);
      element.style.setProperty("outline", "3px solid #075da9", "important");
      element.style.setProperty("outline-offset", "3px", "important");
      const applied = properties.map(name => [name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)]);
      const restore = () => {
        for (let index = 0; index < properties.length; index++) {
          const [name, value, priority] = previous[index], [, currentValue, currentPriority] = applied[index];
          if (element.style.getPropertyValue(name) !== currentValue || element.style.getPropertyPriority(name) !== currentPriority) continue;
          if (value) element.style.setProperty(name, value, priority); else element.style.removeProperty(name);
        }
        element.removeEventListener("blur", restore);
        if (highlighted === restore) highlighted = null;
      };
      highlighted = restore; element.addEventListener("blur", restore);
    }
    function focus(element, scroll = true) {
      if (!globalScope.BAA_NAVIGATION_MODEL.available(element) || element.matches(":disabled")) return false;
      // Preserve authored tabindex, including negative values. Only add one for an otherwise unfocusable target.
      if (!element.hasAttribute("tabindex") && !element.matches("a[href],button,input,select,textarea,summary,[contenteditable='true']")) {
        element.setAttribute("tabindex", "-1");
        const restore = () => {
          if (element.getAttribute("tabindex") === "-1") element.removeAttribute("tabindex");
          element.removeEventListener("blur", restore);
          temporary.delete(element);
        };
        temporary.set(element, restore);
        element.addEventListener("blur", restore);
      }
      element.focus({ preventScroll: true });
      let focused = documentRef.activeElement;
      while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
      if (focused !== element) { temporary.get(element)?.(); return false; }
      highlight(element);
      if (scroll) element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      return true;
    }
    return Object.freeze({ focus, cleanup() { highlighted?.(); for (const restore of [...temporary.values()]) restore(); } });
  }
  globalScope.BAA_FOCUS_MANAGER = Object.freeze({ createFocusManager });
})(globalThis);
