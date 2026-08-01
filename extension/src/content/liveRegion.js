(function registerLiveRegion(globalScope) {
  function createLiveRegion(documentRef = document) {
    const container = documentRef.createElement("div");
    container.dataset.baaOwned = "true";
    container.style.cssText = "position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;";

    const polite = createChannel(documentRef, "polite", "status");
    const assertive = createChannel(documentRef, "assertive", "alert");
    container.append(polite, assertive);
    (documentRef.body || documentRef.documentElement).append(container);

    function announce(message, priority = "polite") {
      const channel = priority === "assertive" ? assertive : polite;
      channel.textContent = "";
      globalScope.setTimeout(() => { channel.textContent = String(message || ""); }, 40);
    }

    return Object.freeze({ announce, remove: () => container.remove() });
  }

  function createChannel(documentRef, ariaLive, role) {
    const channel = documentRef.createElement("div");
    channel.setAttribute("aria-live", ariaLive);
    channel.setAttribute("aria-atomic", "true");
    channel.setAttribute("role", role);
    return channel;
  }

  globalScope.BAA_LIVE_REGION = Object.freeze({ createLiveRegion });
})(globalThis);
