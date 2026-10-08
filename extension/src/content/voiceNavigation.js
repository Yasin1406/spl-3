(function registerVoiceNavigation(globalScope) {
  function createVoiceNavigation({ dialog, shadow, list, category, navigate, announcer, documentRef, onIdle }) {
    const button = shadow.getElementById("voiceStart"), cancelButton = shadow.getElementById("voiceCancel"), status = shadow.getElementById("voiceStatus");
    // Preserve the label object while NVDA may be reviewing the focused button.
    const buttonLabel = button.firstChild;
    function setButtonLabel(text) { buttonLabel.data = text; }
    const detachVoiceShortcut = globalScope.BAA_NAVIGATION_SHORTCUT?.attachVoice?.(focusVoiceButton);
    let requestId = null, stage = "idle", snapshot = [], revision = 0, disposed = false;
    const send = message => new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) reject(new Error("VOICE_EXTENSION_UNAVAILABLE"));
        else resolve(response || {});
      });
    });
    function reset() {
      requestId = null; stage = "idle"; snapshot = [];
      status.setAttribute("aria-live", "polite");
      setButtonLabel("কথা বলা শুরু করুন");
      cancelButton.hidden = true;
      onIdle?.();
    }
    function cancel(silent = false) {
      if (requestId) send({ type: "BAA_VOICE_CANCEL", requestId }).catch(() => {});
      revision++; reset();
      if (!silent) status.textContent = "ভয়েস ইনপুট বাতিল হয়েছে।";
    }
    const errors = {
      MIC_PERMISSION_REQUIRED: "মাইক্রোফোনের অনুমতি দিতে খোলা সেটআপ পৃষ্ঠায় যান। তারপর ফিরে এসে আবার শুরু করুন।",
      MIC_UNAVAILABLE: "মাইক্রোফোন পাওয়া যাচ্ছে না। Chrome ও Windows-এর মাইক্রোফোন সেটিংস পরীক্ষা করুন।",
      VOICE_BUSY: "অন্য পৃষ্ঠায় ভয়েস ইনপুট চলছে। সেখানে বন্ধ করে আবার চেষ্টা করুন।",
      GEMINI_VOICE_KEY_MISSING: "ব্যাকএন্ডে Gemini API key যোগ করে সার্ভার আবার চালু করুন।",
      VOICE_TOO_SHORT: "রেকর্ডিং খুব ছোট। আবার শুরু করে গন্তব্যের নাম বলুন।",
      VOICE_RATE_LIMIT: "অনেক ভয়েস অনুরোধ হয়েছে। একটু পরে আবার চেষ্টা করুন।",
      VOICE_RESOLUTION_RATE_LIMIT: "কথা শোনা হয়েছে, কিন্তু Gemini-এর অনুরোধসীমা শেষ হওয়ায় গন্তব্য মেলানো যায়নি। একটু পরে চেষ্টা করুন অথবা গন্তব্য বেছে ‘যান’ চাপুন।",
      VOICE_RESOLUTION_TIMEOUT: "কথা শোনা হয়েছে, কিন্তু গন্তব্য মেলাতে সময় শেষ হয়েছে। আবার চেষ্টা করুন।",
      VOICE_RESOLUTION_UNAVAILABLE: "কথা শোনা হয়েছে, কিন্তু গন্তব্য মেলানোর সেবা এখন কাজ করছে না। আবার চেষ্টা করুন।",
      INVALID_VOICE_PROVIDER_RESPONSE: "কথা শোনা হয়েছে, কিন্তু গন্তব্য মেলানোর সেবা সঠিক উত্তর দেয়নি। আবার চেষ্টা করুন।",
      INVALID_VOICE_VERDICT: "সেবার উত্তর তালিকার কোনো গন্তব্যের সঙ্গে মেলেনি। আবার চেষ্টা করুন।"
    };
    function failure(code) { reset(); status.textContent = errors[code] || "ভয়েস সেবা কাজ করছে না। আবার চেষ্টা করুন অথবা গন্তব্য বেছে ‘যান’ চাপুন।"; }
    function destinations() {
      return Array.from(list.options).map((option, index) => ({ id: `d${index + 1}`, number: index + 1,
        label: option.dataset.voiceLabel || option.textContent, value: option.value }));
    }
    function unchanged() {
      const now = destinations();
      return now.length === snapshot.length && now.every((entry, index) => entry.value === snapshot[index].value && entry.label === snapshot[index].label);
    }
    async function toggle() {
      if (disposed || !dialog.open || stage === "starting" || stage === "processing") return;
      button.focus();
      if (stage === "recording") {
        const stoppingId = requestId;
        stage = "processing"; setButtonLabel("মিল খোঁজা হচ্ছে…");
        status.setAttribute("aria-live", "polite");
        status.textContent = "রেকর্ডিং শেষ। গন্তব্যের সঙ্গে মিল খোঁজা হচ্ছে।";
        try { const response = await send({ type: "BAA_VOICE_STOP", requestId }); if (requestId === stoppingId && response.error) failure(response.error); }
        catch { if (requestId === stoppingId) failure("VOICE_EXTENSION_UNAVAILABLE"); }
        return;
      }
      snapshot = destinations();
      if (!snapshot.length || snapshot.length > 200 || snapshot.some(entry => entry.label.length > 400)) {
        status.textContent = "এই তালিকা ভয়েস ইনপুটের জন্য বড় বা খালি। অংশের ধরন বেছে ছোট তালিকা খুলুন।"; return;
      }
      requestId = `voice-${Date.now()}-${++revision}`;
      const localId = requestId;
      // Keep the focused control available to screen readers. The stage guard above
      // ignores repeated activation while starting/processing without announcing disabled.
      stage = "starting"; setButtonLabel("মাইক্রোফোন চালু হচ্ছে…"); cancelButton.hidden = false;
      status.textContent = "মাইক্রোফোন চালু হচ্ছে। প্রস্তুতির শব্দের পরে বলুন।";
      try {
        const response = await send({ type: "BAA_VOICE_START", requestId,
          destinations: snapshot.map(({ id, number, label }) => ({ id, number, label })) });
        if (disposed || requestId !== localId || !dialog.open) return;
        if (response.error) { failure(response.error); return; }
        stage = "recording"; setButtonLabel("রেকর্ডিং শেষ করুন"); button.focus();
        // Announce instructions before capture, then use a tone and visual status while recording.
        status.setAttribute("aria-live", "off"); status.textContent = "রেকর্ড হচ্ছে — সর্বোচ্চ ১০ সেকেন্ড। গন্তব্যের নাম বা নম্বর বলুন।";
        try {
          const audio = new AudioContext(), oscillator = audio.createOscillator(), gain = audio.createGain();
          oscillator.frequency.value = 880; gain.gain.value = 0.06; oscillator.connect(gain); gain.connect(audio.destination);
          oscillator.start(); oscillator.stop(audio.currentTime + 0.12); oscillator.onended = () => audio.close();
        } catch { /* Visible recording status remains available if audio is blocked. */ }
      } catch { if (requestId === localId) failure("VOICE_EXTENSION_UNAVAILABLE"); }
    }
    function onMessage(message) {
      if (message?.type !== "BAA_VOICE_EVENT" || message.requestId !== requestId || !dialog.open || disposed) return;
      if (message.stage === "processing") {
        stage = "processing"; setButtonLabel("মিল খোঁজা হচ্ছে…");
        status.setAttribute("aria-live", "polite"); status.textContent = "রেকর্ডিং শেষ। গন্তব্যের সঙ্গে মিল খোঁজা হচ্ছে।"; return;
      }
      status.setAttribute("aria-live", "polite");
      if (message.error) { failure(message.error); return; }
      const result = message.result;
      if (!result || !["match", "no_match"].includes(result.result)) { failure("INVALID_VOICE_VERDICT"); return; }
      if (result.result === "no_match") {
        reset(); status.textContent = "কোনো গন্তব্যের সঙ্গে মিল পাওয়া যায়নি। নাম বা নম্বর বলে আবার চেষ্টা করুন।"; return;
      }
      const destination = snapshot.find(entry => entry.id === result.destination_id);
      if (!destination || !unchanged()) {
        cancel(true); status.textContent = "গন্তব্যের তালিকা বদলেছে। আবার কথা বলুন।"; return;
      }
      // Only an opaque ID from this recording's displayed list can reach the existing focus handler.
      list.value = destination.value; reset(); navigate(destination.value);
      if (!dialog.open) announcer?.announce(`${destination.label} অংশে যাওয়া হয়েছে।`);
    }
    function focusVoiceButton() { if (!disposed && dialog.open) button.focus(); }
    function onKey(event) {
      if (!dialog.open) return;
      if (event.key === "Escape" && requestId) { event.preventDefault(); event.stopImmediatePropagation(); cancel(); return; }
      const voiceMatch = globalScope.BAA_KEYBINDINGS ? globalScope.BAA_KEYBINDINGS.matches("voice", event) : (event.code === "KeyV" || !event.code && ["v", "V"].includes(event.key)) && event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.isComposing;
      if (!detachVoiceShortcut && voiceMatch) {
        event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) focusVoiceButton();
      }
    }
    function changed() { if (requestId) cancel(true); }
    button.addEventListener("click", toggle); cancelButton.addEventListener("click", () => cancel());
    list.addEventListener("change", changed); category.addEventListener("change", changed);
    globalScope.addEventListener("keydown", onKey, true);
    globalScope.addEventListener("pagehide", changed);
    chrome.runtime.onMessage.addListener(onMessage);
    return Object.freeze({
      cancel,
      setOpen(enabled) { globalScope.BAA_NAVIGATION_SHORTCUT?.setVoiceActive?.(enabled); },
      listChanged() { if (requestId && !unchanged()) { cancel(true); status.textContent = "গন্তব্যের তালিকা বদলেছে। আবার কথা বলুন।"; } },
      busy: () => Boolean(requestId),
      dispose() {
        cancel(true); disposed = true;
        detachVoiceShortcut?.();
        globalScope.removeEventListener("keydown", onKey, true); globalScope.removeEventListener("pagehide", changed);
        chrome.runtime.onMessage.removeListener?.(onMessage);
      }
    });
  }
  globalScope.BAA_VOICE_NAVIGATION = Object.freeze({ createVoiceNavigation });
})(globalThis);
