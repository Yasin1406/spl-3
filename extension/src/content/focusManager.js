(function registerFocusManager(globalScope) {
  function createFocusManager({ documentRef = document }) {
    const temporary = new Map();
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
      if (scroll) element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      return true;
    }
    return Object.freeze({ focus, cleanup() { for (const restore of [...temporary.values()]) restore(); } });
  }
  globalScope.BAA_FOCUS_MANAGER = Object.freeze({ createFocusManager });
})(globalThis);
