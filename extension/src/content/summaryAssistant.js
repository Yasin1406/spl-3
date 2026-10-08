(function registerSummaryAssistant(globalScope) {
  const collector = globalScope.BAA_PAGE_CONTEXT;
  const planner = globalScope.BAA_SUMMARY_PLANNER;

  function createSummaryAssistant({ documentRef = document, announcer, sendMessage, detail = "standard" }) {
    const host = documentRef.createElement("div");
    host.dataset.baaOwned = "true";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      :host { all:initial; position:fixed; right:12px; bottom:12px; z-index:2147483647; font:16px/1.6 system-ui,sans-serif; color:#17212b; }
      * { box-sizing:border-box; } button,select,input { font:inherit; } button,select { padding:8px 12px; border:1px solid #526174; border-radius:5px; background:#fff; color:#17212b; cursor:pointer; }
      :focus-visible { outline:3px solid #075da9; outline-offset:3px; }
      .toolbar { display:flex; gap:6px; background:#f4f7fa; padding:6px; border:1px solid #526174; border-radius:6px; }
      dialog { font:16px/1.6 system-ui,sans-serif; color:#17212b; background:#fff; border:2px solid #526174; border-radius:8px; padding:20px; width:min(760px,94vw); max-height:85vh; overflow:auto; }
      dialog::backdrop { background:rgba(0,0,0,.4); } h1 { font-size:1.4rem; } h2 { font-size:1.15rem; } p { white-space:pre-wrap; }
      .controls { display:flex; flex-wrap:wrap; gap:10px; align-items:center; } label { display:block; } [hidden] { display:none!important; } li { margin:8px 0; }
    </style>
    <div class="toolbar" lang="bn" aria-label="সারাংশের কন্ট্রোল">
      <button id="pageButton" type="button" aria-keyshortcuts="Alt+Shift+A">পৃষ্ঠার সারাংশ</button>
      <button id="regionButton" type="button" aria-keyshortcuts="Alt+Shift+S">ফোকাসের অংশের সারাংশ</button>
    </div>
    <dialog lang="bn" aria-labelledby="summaryTitle">
      <h1 id="summaryTitle" tabindex="-1">বাংলা সারাংশ</h1>
      <div class="controls">
      <button id="refresh" type="button">আবার তৈরি করুন</button><button id="close" type="button">বন্ধ করুন</button></div>
      <p id="status" role="status" aria-live="polite"></p>
      <div id="results"></div>
      <section id="regionChoice" hidden><h2>অংশ নির্বাচন করুন</h2><label for="regions">পৃষ্ঠার অংশ</label><select id="regions"></select>
      <button id="summarizeRegion" type="button">এই অংশের সারাংশ</button></section>
      <label id="privacy" hidden><input id="allowPrivate" type="checkbox"> এই অনুরোধের জন্য ব্যক্তিগত অংশের লেখা বাহ্যিক AI সেবায় পাঠানোর অনুমতি দিন। ঘরে লেখা মান পাঠানো হবে না।</label>
    </dialog>`;
    const dialog = shadow.querySelector("dialog");
    const results = shadow.getElementById("results");
    const status = shadow.getElementById("status");
    let summaryDetail = ["brief", "standard", "detailed"].includes(detail) ? detail : "standard";
    let previousFocus = documentRef.activeElement;
    let active = false;
    let generation = 0;
    let requestId = null;
    let lastScope = "page";
    let regionTarget = null;
    let snapshot = null;
    let snapshotSignature = "";
    let invalidationTimer = null;
    const observer = new MutationObserver(mutations => {
      if (!requestId && !dialog.open) return;
      const relevant = mutations.some(mutation => {
        const element = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
        if (!element || element.closest("[data-baa-owned='true']")) return false;
        if (mutation.type === "attributes" && /^(?:data-baa-|tabindex$)/.test(mutation.attributeName)) return false;
        return lastScope === "page" || regionTarget?.contains(element) ||
          Array.from(mutation.removedNodes || []).some(node => node === regionTarget || node.contains?.(regionTarget));
      });
      if (!relevant) return;
      if (invalidationTimer) clearTimeout(invalidationTimer);
      invalidationTimer = setTimeout(() => {
        if (!dialog.open || !contentChanged()) return;
        invalidateSummary();
      }, 200);
    });

    function invalidateSummary() {
      cancel();
      results.querySelector("[data-summary-ai]")?.remove();
      status.textContent = "মূল তথ্য বদলেছে। নতুন সারাংশের জন্য আবার তৈরি করুন।";
      shadow.getElementById("refresh").focus();
    }

    function signature(context, plan) {
      return JSON.stringify({ title: context.title, privateContext: context.privateContext, regions: context.regions.filter(region => plan.primaryIds.includes(region.id)).map(region => ({
        type: region.type, name: region.name, blocks: region.blocks.map(block => [block.type, block.text]),
        controls: region.controls.filter(control => control.type !== "link" || !control.contextual).map(control => [control.name, control.required, control.invalid, control.disabled, control.constraints])
      })) });
    }
    function contentChanged() {
      if (!snapshot) return false;
      const fresh = collector.collect(documentRef, { scope: lastScope, focusedElement: regionTarget || previousFocus, allowPrivateContent: snapshot.context.allowPrivateContent }).context;
      return signature(fresh, planner.plan(fresh)) !== snapshotSignature;
    }

    function cancel() {
      generation++;
      if (requestId) sendMessage({ type: "BAA_CANCEL_SUMMARY", requestId }).catch(() => {});
      requestId = null;
      if (invalidationTimer) clearTimeout(invalidationTimer);
      results.removeAttribute("aria-busy");
    }
    function onFocus(event) {
      if (!host.contains(event.target) && event.target !== host && !event.target.closest?.("[data-baa-owned='true']")) previousFocus = event.target;
    }
    function close() {
      cancel();
      if (dialog.open) dialog.close();
      shadow.getElementById("allowPrivate").checked = false;
      if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    }
    function onKey(event) {
      if (!active || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || !event.altKey || !event.shiftKey) return;
      const keys = globalScope.BAA_KEYBINDINGS;
      const scope = keys ? (keys.matches("pageSummary", event) ? "page" : keys.matches("regionSummary", event) ? "region" : null) : (event.code === "KeyA" ? "page" : event.code === "KeyS" ? "region" : null);
      if (!scope) return;
      event.preventDefault();
      invoke(scope);
    }
    function paragraph(container, value) {
      const node = documentRef.createElement("p"); node.textContent = value; node.tabIndex = 0; container.append(node); return node;
    }
    function section(title) {
      const node = documentRef.createElement("section");
      const heading = documentRef.createElement("h2"); heading.textContent = title; node.append(heading); results.append(node); return node;
    }
    function renderLocal(plan, context) {
      results.replaceChildren();
      const overview = section("পৃষ্ঠার পরিচয়"); overview.dataset.summaryOverview = "true"; paragraph(overview, plan.overview);
      if (plan.notices.length) {
        const notices = section("গুরুত্বপূর্ণ বিজ্ঞপ্তি"); plan.notices.forEach(text => paragraph(notices, text));
      }
      const actions = plan.importantControls;
      if (actions.length) {
        const node = section("দরকারি লিংক ও কাজ");
        const list = documentRef.createElement("ul"); node.append(list);
        for (const action of actions) {
          const item = documentRef.createElement("li");
          const target = snapshot.targets.get(action.id);
          if (action.type === "link" && target?.href && /^(https?:)/i.test(target.href)) {
            const link = documentRef.createElement("a"); link.href = target.href; link.textContent = action.name; item.append(link);
          } else item.textContent = action.name;
          item.append(`${action.required ? " — বাধ্যতামূলক" : ""}${action.invalid ? " — ভুল রয়েছে" : ""}${action.disabled ? " — এখন ব্যবহার করা যাচ্ছে না" : ""}`);
          const constraints = action.constraints || {};
          const labels = { minlength: "অন্তত অক্ষর", maxlength: "সর্বোচ্চ অক্ষর", min: "সর্বনিম্ন মান", max: "সর্বোচ্চ মান", pattern: "নির্ধারিত বিন্যাস", type: "ঘরের ধরন" };
          for (const [key, value] of Object.entries(constraints)) if (labels[key] && action.type === "field") item.append(`; ${labels[key]}: ${value}`);
          list.append(item);
        }
      }
      if (plan.limitations.length) { const limits = section("সারাংশের সীমা"); plan.limitations.forEach(text => paragraph(limits, text)); }
      const regionsSelect = shadow.getElementById("regions");
      regionsSelect.replaceChildren();
      for (const region of context.regions.filter(region => !region.secondary || region.id === context.selectedRegionId)) {
        const option = documentRef.createElement("option"); option.value = region.id;
        option.textContent = `${planner.typeName(region.type)}${region.name ? ": " + region.name : ""}`; regionsSelect.append(option);
      }
      if (context.selectedRegionId) regionsSelect.value = context.selectedRegionId;
      shadow.getElementById("regionChoice").hidden = plan.canGenerate;
      shadow.getElementById("privacy").hidden = !context.privateContext;
    }

    async function invoke(scopeName = "page", target = null) {
      if (!active) return;
      cancel();
      lastScope = scopeName;
      const focused = target || previousFocus;
      snapshot = collector.collect(documentRef, { scope: scopeName, focusedElement: focused, allowPrivateContent: shadow.getElementById("allowPrivate").checked });
      const context = snapshot.context;
      context.detail = summaryDetail;
      shadow.getElementById("allowPrivate").checked = false;
      const plan = planner.plan(context);
      snapshotSignature = signature(context, plan);
      if (scopeName === "region" && !context.selectedRegionId) {
        announcer.announce("সারাংশের জন্য আগে পৃষ্ঠার কোনো অর্থপূর্ণ অংশে ফোকাস করুন।");
        return;
      }
      regionTarget = scopeName === "region" ? snapshot.targets.get(context.selectedRegionId) : null;
      renderLocal(plan, context);
      const wasOpen = dialog.open;
      if (!wasOpen) { dialog.showModal(); shadow.getElementById("summaryTitle").focus(); }
      status.textContent = "পৃষ্ঠার পরিচয় প্রস্তুত।";
      if (!plan.canGenerate) {
        status.textContent = context.privateContext && !context.allowPrivateContent ? "ব্যক্তিগত লেখা পাঠানো হয়নি। চাইলে এই অনুরোধের জন্য অনুমতি দিয়ে আবার তৈরি করুন।" : "সারাংশের জন্য একটি অংশ নির্বাচন করুন।";
        return;
      }
      const token = generation;
      requestId = `summary-${Date.now()}-${token}`;
      const currentRequest = requestId;
      status.textContent = "বাংলা সারাংশ তৈরি হচ্ছে।";
      results.setAttribute("aria-busy", "true");
      try {
        const response = await sendMessage({ type: "BAA_SUMMARIZE_PAGE", requestId: currentRequest, context: {
          ...context, detail: summaryDetail, purpose: plan.purpose,
          regions: context.regions.filter(region => plan.primaryIds.includes(region.id)).map(region => ({ ...region, controls: region.controls.filter(control => control.type !== "link" || plan.importantControls.some(important => important.id === control.id)) }))
        } });
        if (!active || token !== generation || !dialog.open) return;
        if (contentChanged()) { invalidateSummary(); return; }
        results.querySelector("[data-summary-overview]")?.remove();
        const main = section("মূল তথ্যের সারাংশ"); main.dataset.summaryAi = "true";
        const summaryContent = paragraph(main, response.summary_bn); results.prepend(main);
        status.textContent = "বাংলা সারাংশ প্রস্তুত।";
        results.removeAttribute("aria-busy");
        summaryContent.focus();
      } catch (error) {
        if (token !== generation || !dialog.open) return;
        status.textContent = error.message === "SUMMARY_AI_DISABLED" ? "AI সারাংশের সেটিংস বন্ধ আছে। পৃষ্ঠার পরিচয় ও দরকারি লিংক পড়তে পারেন।" : "AI সারাংশ এখন পাওয়া যাচ্ছে না। পৃষ্ঠার পরিচয় ও দরকারি লিংক পড়তে পারেন।";
        results.removeAttribute("aria-busy");
        shadow.getElementById("refresh").focus();
      } finally {
        if (token === generation) { requestId = null; results.removeAttribute("aria-busy"); }
      }
    }

    shadow.getElementById("pageButton").addEventListener("click", () => invoke("page"));
    shadow.getElementById("regionButton").addEventListener("click", () => invoke("region"));
    shadow.getElementById("close").addEventListener("click", close);
    shadow.getElementById("refresh").addEventListener("click", () => invoke(lastScope, regionTarget));
    shadow.getElementById("summarizeRegion").addEventListener("click", () => invoke("region", snapshot?.targets.get(shadow.getElementById("regions").value)));
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    let detachHints = [];
    return Object.freeze({ invoke,
      setDetail(value) { if (["brief", "standard", "detailed"].includes(value)) summaryDetail = value; },
      start() {
        if (active) return;
        active = true; documentRef.body.append(host);
        detachHints = [globalScope.BAA_KEYBINDINGS?.bindHint(shadow.getElementById("pageButton"), "pageSummary"), globalScope.BAA_KEYBINDINGS?.bindHint(shadow.getElementById("regionButton"), "regionSummary")];
        documentRef.addEventListener("focusin", onFocus, true); documentRef.addEventListener("keydown", onKey, true);
        documentRef.defaultView?.addEventListener("pagehide", close);
        documentRef.defaultView?.addEventListener("popstate", close);
        documentRef.defaultView?.addEventListener("hashchange", close);
        observer.observe(documentRef.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-invalid", "aria-selected", "aria-expanded", "aria-busy", "hidden", "disabled"] });
      },
      stop() {
        detachHints.forEach(detach => detach?.()); detachHints = [];
        active = false; observer.disconnect(); close();
        if (invalidationTimer) clearTimeout(invalidationTimer);
        documentRef.removeEventListener("focusin", onFocus, true); documentRef.removeEventListener("keydown", onKey, true); host.remove();
        documentRef.defaultView?.removeEventListener("pagehide", close);
        documentRef.defaultView?.removeEventListener("popstate", close);
        documentRef.defaultView?.removeEventListener("hashchange", close);
      }
    });
  }
  globalScope.BAA_SUMMARY_ASSISTANT = Object.freeze({ createSummaryAssistant });
})(globalThis);
