(function registerPageSummaryPlanner(scope) {
  const TYPES = { article: "নিবন্ধ", form: "ফর্ম", table: "তথ্যের সারণি", collection: "তালিকা বা কথোপকথন", navigation: "নেভিগেশন", supporting: "সহায়ক অংশ", section: "বিষয়ভিত্তিক অংশ" };
  const PURPOSES = { article: "নিবন্ধ বা তথ্যের পৃষ্ঠা", form: "ফর্ম পূরণের পৃষ্ঠা", results: "ফলাফল বা তালিকার পৃষ্ঠা", product: "পণ্যের পৃষ্ঠা", checkout: "কেনাকাটা বা অর্থ প্রদানের পৃষ্ঠা", dashboard: "তথ্য ও কাজের ড্যাশবোর্ড", conversation: "বার্তা বা ব্যক্তিগত তথ্যের পৃষ্ঠা", general: "বিভিন্ন তথ্য ও কাজের পৃষ্ঠা" };
  const LIMITS = { content_limited: "বড় পৃষ্ঠার কিছু লেখা সীমার কারণে অন্তর্ভুক্ত হয়নি।", regions_limited: "কিছু অঞ্চল অন্তর্ভুক্ত হয়নি; নির্দিষ্ট অংশ নির্বাচন করুন।", controls_limited: "কিছু কন্ট্রোল তালিকায় অন্তর্ভুক্ত হয়নি।", embedded_content_limited: "এম্বেড করা অংশ বা চার্টের সব তথ্য পাওয়া যায়নি।", loading_content: "কিছু তথ্য এখনও লোড হচ্ছে।", private_structure_only: "ব্যক্তিগত তথ্যের পৃষ্ঠায় শুধু কাঠামোর বিবরণ দেখানো হচ্ছে।" };

  function plan(context) {
    const regions = context.regions;
    const byId = new Map(regions.map(region => [region.id, region]));
    const descendants = root => regions.filter(region => {
      if (region.secondary && !root.secondary) return false;
      for (let current = region; current; current = byId.get(current.parentId)) if (current.id === root.id) return true;
      return false;
    });
    const main = regions.find(region => region.landmark === "main" && !region.secondary);
    const candidates = regions.filter(region => !region.secondary && (region.blocks.length || region.controls.length));
    const articles = candidates.filter(region => region.type === "article");
    const contentRoots = main ? descendants(main) : candidates;
    const titles = [context.title, ...contentRoots.filter(region => region.type !== "form" || !/search|অনুসন্ধান/i.test(region.name)).flatMap(region => [region.name, ...region.blocks.filter(block => block.type === "heading").map(block => block.text)])].join(" ");
    let purpose = "general";
    if (/checkout|shopping cart|payment|চেকআউট|কার্ট|পেমেন্ট/i.test(titles)) purpose = "checkout";
    else if (/product|buy now|পণ্য/i.test(titles)) purpose = "product";
    else if (/search|results|directory|অনুসন্ধান|ফলাফল/i.test(titles)) purpose = "results";
    else if (articles.length) purpose = "article";
    else if (/dashboard|ড্যাশবোর্ড/i.test(titles)) purpose = "dashboard";
    else if (contentRoots.some(region => region.type === "form" && !/search|অনুসন্ধান/i.test(region.name) && region.controls.some(control => control.type === "field" && !["search", "checkbox", "radio"].includes(control.constraints?.type)))) purpose = "form";
    else if (context.privateContext) purpose = "conversation";
    const score = region => descendants(region).reduce((total, child) => total + child.blocks.reduce((n, block) => n + block.text.length, 0) + child.controls.filter(control => control.type !== "link").length * 30, 0);
    const independent = candidates.filter(region => !candidates.some(parent => parent.id === region.parentId));
    const scored = independent.map(region => ({ region, score: score(region) + (region.type === "article" ? 300 : 0) +
      (["form", "checkout"].includes(purpose) && region.type === "form" ? 800 : 0)
    })).sort((a, b) => b.score - a.score);
    let primaryIds = [];
    if (context.scope === "region" && context.selectedRegionId) {
      const selected = regions.find(region => region.id === context.selectedRegionId);
      primaryIds = selected ? descendants(selected).map(region => region.id) : [];
    }
    else if (articles.length === 1) primaryIds = descendants(articles[0]).map(region => region.id);
    else if (main) primaryIds = descendants(main).map(region => region.id);
    else if (scored.length === 1 || scored[0] && (!scored[1] || scored[0].score >= scored[1].score * 1.8)) primaryIds = descendants(scored[0].region).map(region => region.id);
    const selected = regions.filter(region => primaryIds.includes(region.id));
    const overview = [`${context.scope === "region" ? "নির্বাচিত অংশ" : "পৃষ্ঠার বিষয়"}: ${context.scope === "region" ? selected[0]?.name || TYPES[selected[0]?.type] || TYPES.section : context.title || PURPOSES[purpose]}।`];
    const fields = selected.flatMap(region => region.controls.filter(control => control.type === "field"));
    if (fields.some(control => control.invalid)) overview.push("ফর্মে ভুল রয়েছে; সংশোধন করে আবার চেষ্টা করুন।");
    if (fields.some(control => control.required)) overview.push("কিছু ঘর পূরণ করা বাধ্যতামূলক।");
    if (context.scope === "page" && !primaryIds.length && candidates.length > 1) overview.push("একাধিক গুরুত্বপূর্ণ অংশ রয়েছে। নিচের তালিকা থেকে একটি অংশের সারাংশ চাইতে পারেন।");
    const limitations = context.coverage.limitations.map(code => LIMITS[code]).filter(Boolean);
    const notices = (context.scope === "region" ? selected : contentRoots).filter(region => !region.secondary).flatMap(region => region.blocks.filter(block => region.notices.includes(block.id)).map(block => block.text)).slice(0, 3);
    const useful = selected.flatMap(region => region.controls).filter(control => control.name && !control.contextual &&
      (control.type !== "field" || control.required || control.invalid));
    // Related links may be useful destinations, but their text never becomes article content.
    const related = context.scope === "page" ? regions.filter(region => region.secondary && /related|recommended|see also|external links|further reading|আরও|সম্পর্কিত/i.test(region.name)).flatMap(region => region.controls.filter(control => control.type === "link" && control.name)) : [];
    const unique = new Set();
    const taskControls = useful.filter(control => control.type !== "link" || /\b(?:apply|download|buy|book|register|submit|start|track|renew|continue)\b|আবেদন|ডাউনলোড|কিনুন|বুক করুন|নিবন্ধন|জমা দিন/i.test(control.name));
    const importantControls = [...taskControls.sort((a, b) => Number(b.invalid) - Number(a.invalid) || Number(b.type === "action") - Number(a.type === "action")), ...related, ...useful].filter(control => {
      if (unique.has(control.name) || /^\[?\s*\d+\s*\]?\s*$|^edit$|^jump up|^v$|^t$|^e$/i.test(control.name)) return false;
      unique.add(control.name); return true;
    }).slice(0, 5);
    return { purpose, primaryIds, overview: overview.join(" "), limitations, notices, importantControls,
      canGenerate: selected.some(region => region.blocks.length > 0) && (!context.privateContext || context.allowPrivateContent) };
  }
  scope.BAA_SUMMARY_PLANNER = Object.freeze({ plan, typeName: type => TYPES[type] || TYPES.section });
})(globalThis);
