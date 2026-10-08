(function registerNavigationShortcut(globalScope) {
  let handler = null;
  let pressed = false;
  const reserved = new Map();
  function reserve(element) {
    const current = element.getAttribute("accesskey");
    const previous = reserved.get(element);
    if (previous && current === previous.applied) return;
    const tokens = (current || "").split(/\s+/).filter(Boolean);
    if (!tokens.some(token => token.toLowerCase() === "z")) { reserved.delete(element); return; }
    const applied = tokens.filter(token => token.toLowerCase() !== "z").join(" ") || null;
    reserved.set(element, { original: current, applied });
    if (applied === null) element.removeAttribute("accesskey");
    else element.setAttribute("accesskey", applied);
  }
  function scan(root) {
    if (root.matches?.("[accesskey]")) reserve(root);
    for (const element of root.querySelectorAll?.("[accesskey]") || []) reserve(element);
  }
  const observer = new MutationObserver(mutations => {
    if (!handler) return;
    for (const mutation of mutations) {
      if (mutation.type === "attributes") reserve(mutation.target);
      else for (const node of mutation.addedNodes) if (node.nodeType === 1) scan(node);
    }
  });
  function restore() {
    observer.disconnect();
    for (const [element, record] of reserved) {
      if (element.getAttribute("accesskey") !== record.applied) continue;
      element.setAttribute("accesskey", record.original);
    }
    reserved.clear();
  }
  function isZ(event) {
    return event.code === "KeyZ" || !event.code && ["z", "Z"].includes(event.key);
  }
  function matches(event) {
    return isZ(event) && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.isComposing;
  }
  function consume(event) { event.preventDefault(); event.stopImmediatePropagation(); }
  function onKey(event) {
    if (!handler) return;
    if (event.type === "keyup") {
      // Modifiers may already have been released when Z is released.
      if (pressed && isZ(event)) { consume(event); pressed = false; }
      return;
    }
    if (!matches(event)) return;
    consume(event);
    if (event.type === "keydown") {
      pressed = true;
      if (!event.repeat) handler();
    }
  }
  // Installed at document_start, before page capture listeners can claim the gesture.
  for (const type of ["keydown", "keypress", "keyup"]) globalScope.addEventListener(type, onKey, true);
  globalScope.addEventListener("blur", () => { pressed = false; });
  globalScope.BAA_NAVIGATION_SHORTCUT = Object.freeze({
    attach(callback) {
      restore();
      handler = callback;
      // Chromium can activate native access keys before cancellable key handlers run.
      // Reserve only Z while the assistant is enabled; retain other tokens and authored changes.
      scan(document);
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["accesskey"] });
      return () => { if (handler === callback) { handler = null; pressed = false; restore(); } };
    }
  });
})(globalThis);
