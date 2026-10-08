(function registerNavigationShortcut(globalScope) {
  let handler = null;
  let voiceHandler = null, voiceActive = false;
  let pressed = null;
  const reserved = new Map();
  function reserve(element) {
    const current = element.getAttribute("accesskey");
    const previous = reserved.get(element);
    const original = previous && current === previous.applied ? previous.original : current;
    const tokens = (original || "").split(/\s+/).filter(Boolean);
    const isReserved = token => handler && token.toLowerCase() === "z" || voiceActive && token.toLowerCase() === "v";
    if (!tokens.some(isReserved)) {
      if (previous && current === previous.applied) element.setAttribute("accesskey", original);
      reserved.delete(element); return;
    }
    const applied = tokens.filter(token => !isReserved(token)).join(" ") || null;
    reserved.set(element, { original, applied });
    if (current === applied) return;
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
  function isV(event) { return event.code === "KeyV" || !event.code && ["v", "V"].includes(event.key); }
  function matches(event) {
    return isZ(event) && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.isComposing;
  }
  function consume(event) { event.preventDefault(); event.stopImmediatePropagation(); }
  function onKey(event) {
    if (!handler) return;
    if (event.type === "keyup") {
      // Modifiers may already have been released when Z is released.
      if (pressed && (pressed === "z" ? isZ(event) : isV(event))) { consume(event); pressed = null; }
      return;
    }
    const voiceMatch = voiceActive && voiceHandler && isV(event) && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.isComposing;
    if (!matches(event) && !voiceMatch) return;
    consume(event);
    if (event.type === "keydown") {
      pressed = voiceMatch ? "v" : "z";
      if (!event.repeat) (voiceMatch ? voiceHandler : handler)();
    }
  }
  // Installed at document_start, before page capture listeners can claim the gesture.
  for (const type of ["keydown", "keypress", "keyup"]) globalScope.addEventListener(type, onKey, true);
  globalScope.addEventListener("blur", () => { pressed = null; });
  globalScope.BAA_NAVIGATION_SHORTCUT = Object.freeze({
    attachVoice(callback) {
      voiceHandler = callback;
      return () => { if (voiceHandler === callback) { voiceHandler = null; voiceActive = false; for (const element of [...reserved.keys()]) reserve(element); } };
    },
    setVoiceActive(enabled) {
      voiceActive = enabled === true && Boolean(voiceHandler);
      for (const element of [...reserved.keys()]) reserve(element);
      if (handler) scan(document);
    },
    attach(callback) {
      restore();
      handler = callback;
      // Chromium can activate native access keys before cancellable key handlers run.
      // Reserve only Z while the assistant is enabled; retain other tokens and authored changes.
      scan(document);
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["accesskey"] });
      return () => { if (handler === callback) { handler = null; pressed = null; voiceActive = false; restore(); } };
    }
  });
})(globalThis);
