import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const chromePath = process.env.BAA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

test("Chrome article integration: heading/content focus, complete translation, live updates and rollback", { skip: !existsSync(chromePath) }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "baa-article-test-"));
  try {
    const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"));
    const scripts = await Promise.all(manifest.content_scripts.flatMap(entry => entry.js).map((file) => readFile(new URL(`../src/${file}`, import.meta.url), "utf8")));
    const fixture = await readFile(new URL("../../tests/fixtures/article-accessibility.html", import.meta.url), "utf8");
    const setup = `
      const changedListeners = [];
      const messageListeners = [];
      const requests = [];
      const held = [];
      let hold = false;
      let verbosity = 'balanced';
      let active = 0;
      let maxActive = 0;
      const article = document.querySelector('article');
      for (let index = 0; index < 35; index++) {
        const paragraph = document.createElement('p');
        paragraph.textContent = ('The community discussed safer roads and better lighting near the school. ').repeat(10) + ' EndMarker' + index;
        article.append(paragraph);
      }
      const originals = new Map([...article.querySelectorAll('p')].map(p => [p, p.textContent]));
      const originalLink = document.getElementById('article-link');
      const originalHref = originalLink.getAttribute('href');
      const owned = document.createElement('div');
      owned.dataset.baaOwned = 'true';
      owned.textContent = 'Extension-owned instructions';
      document.body.append(owned);
      window.chrome = {
        storage: {
          local: { get(defaults, callback) { callback({ ...defaults, baaTranslationEnabled: true, baaFormGuidanceEnabled: false }); } },
          onChanged: { addListener(listener) { changedListeners.push(listener); } }
        },
        runtime: {
          onMessage: { addListener(listener) { messageListeners.push(listener); } },
          sendMessage(message, callback) {
            if (message.type === 'BAA_GET_PREFERENCES') { callback({ baaTranslationEnabled: true, baaFormGuidanceEnabled: false }); return; }
            requests.push(message);
            const requestVerbosity = verbosity;
            active++;
            maxActive = Math.max(maxActive, active);
            const respond = () => {
              active--;
              callback({ translations: message.items.map((item, index) => ({ id: item.id, translatedText: (requestVerbosity === 'detailed' ? 'বিস্তারিত বাংলা অনুবাদ ' : 'বাংলা অনুবাদ ') + index + '।' })), provider: 'mock' });
            };
            if (hold) held.push(respond);
            else setTimeout(respond, 25);
          }
        }
      };
      changedListeners.push((changes, area) => { if (area === 'local') messageListeners.forEach(listener => listener({ type: 'BAA_PREFERENCES_CHANGED', changes })); });
      window.errors = [];
      window.addEventListener('error', event => errors.push(event.message));
    `;
    const checks = `
      const result = document.createElement('pre');
      result.id = 'baa-test-result';
      result.dataset.baaOwned = 'true';
      document.body.append(result);
      const check = (condition, message) => { if (!condition) throw new Error(message); };
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      async function until(condition) {
        for (let index = 0; index < 180; index++) { if (condition()) return; await sleep(100); }
        throw new Error('Article operation timed out');
      }
      const setTranslation = enabled => messageListeners.forEach(listener => listener({ type: 'BAA_SET_TRANSLATION_STATE', enabled }, {}, () => {}));
      (async () => {
        try {
          const headline = document.getElementById('headline');
          check(headline.getAttribute('tabindex') === '0', 'Article heading is not in Tab order');
          headline.focus();
          check(document.activeElement === headline, 'Heading cannot receive real DOM focus');
          check(headline.tagName === 'H1' && !headline.hasAttribute('role'), 'Heading semantics changed');
          check(document.getElementById('authored-focus').getAttribute('tabindex') === '0', 'Negative-tabindex heading is still outside Tab order');
          check(document.getElementById('positive-focus').getAttribute('tabindex') === '2', 'Existing Tab order was overwritten');
          check(!document.getElementById('hidden-heading').hasAttribute('tabindex'), 'Hidden heading was made focusable');
          const intro = document.getElementById('intro');
          check(intro.getAttribute('tabindex') === '0', 'Article paragraph is outside Tab order');
          intro.focus();
          check(document.activeElement === intro && !intro.hasAttribute('role'), 'Paragraph focus or semantics are incorrect');
          for (const id of ['long-paragraph', 'linked-paragraph', 'negative-content', 'quote-content', 'list-content', 'caption-content', 'plain-content', 'wrapped-content']) {
            check(document.getElementById(id).getAttribute('tabindex') === '0', 'Reading block is not focusable: ' + id);
          }
          check(document.getElementById('positive-content').getAttribute('tabindex') === '3', 'Existing paragraph Tab order changed');
          for (const id of ['quote-wrapper', 'content-wrapper', 'editable-content', 'inert-content', 'navigation-content', 'form-content', 'empty-content']) {
            check(!document.getElementById(id).hasAttribute('tabindex'), 'Excluded or duplicate block gained focus: ' + id);
          }
          check(!document.querySelector('[hidden] p').hasAttribute('tabindex'), 'Hidden paragraph gained focus');
          await until(() => [...originals.keys()].filter(p => !p.closest('[hidden]')).every(p => !/[A-Za-z]/.test(p.textContent)));
          check(requests.length > 20, 'Article did not exercise multiple batches');
          check(maxActive === 1, 'Translation requests overlap');
          for (const request of requests) {
            check(request.items.length <= 20, 'Too many items in batch');
            check(request.items.reduce((n, item) => n + item.text.length, 0) <= 1200, 'Batch exceeds text budget');
            check(request.items.every(item => item.text.length <= 500), 'Chunk exceeds backend limit');
          }
          const sentText = requests.flatMap(request => request.items.map(item => item.text)).join(' ');
          for (let index = 0; index < 35; index++) check(sentText.includes('EndMarker' + index), 'Paragraph tail omitted: ' + index);
          check(owned.textContent === 'Extension-owned instructions', 'Extension-owned text was translated');
          check(document.getElementById('article-link') === originalLink && originalLink.getAttribute('href') === originalHref, 'Inline link changed');
          intro.focus();
          check(document.activeElement === intro && !/[A-Za-z]/.test(intro.textContent), 'Translated content cannot receive focus');
          originalLink.focus();
          check(document.activeElement === originalLink, 'Inline link is no longer independently focusable');
          check(document.querySelector('[hidden] p').textContent === originals.get(document.querySelector('[hidden] p')), 'Hidden text was translated');
          const requestsBeforePreference = requests.length;
          verbosity = 'detailed';
          changedListeners.forEach(listener => listener({ baaTranslationVerbosity: { oldValue: 'balanced', newValue: 'detailed' } }, 'local'));
          await until(() => [...originals.keys()].filter(p => !p.closest('[hidden]') && originals.get(p).trim()).every(p => p.textContent.includes('বিস্তারিত')));
          check(requests.length > requestsBeforePreference, 'Verbosity change did not retranslate existing content');
          hold = true;
          const pendingPreference = document.createElement('p');
          pendingPreference.textContent = 'A pending translation during a preference change';
          article.append(pendingPreference);
          await until(() => held.length > 0);
          verbosity = 'balanced';
          changedListeners.forEach(listener => listener({ baaTranslationVerbosity: { oldValue: 'detailed', newValue: 'balanced' } }, 'local'));
          hold = false;
          held.splice(0).forEach(respond => respond());
          await sleep(50);
          check(!pendingPreference.textContent.includes('বিস্তারিত'), 'Old response overwrote the changed preference');
          await until(() => [...originals.keys()].filter(p => !p.closest('[hidden]')).every(p => !/[A-Za-z]/.test(p.textContent)) && !/[A-Za-z]/.test(pendingPreference.textContent));
          check(!pendingPreference.textContent.includes('বিস্তারিত'), 'New translation retained the old style');
          pendingPreference.remove();
          const dynamic = document.createElement('h2');
          dynamic.textContent = 'A newly inserted article heading';
          article.append(dynamic);
          await until(() => dynamic.getAttribute('tabindex') === '0' && !/[A-Za-z]/.test(dynamic.textContent));
          intro.firstChild.nodeValue = 'Updated article information from the publisher';
          originals.set(intro, intro.textContent);
          await until(() => !/[A-Za-z]/.test(intro.textContent));
          const newParagraph = document.createElement('p');
          newParagraph.textContent = 'A dynamically loaded report paragraph';
          article.append(newParagraph);
          await until(() => newParagraph.getAttribute('tabindex') === '0' && !/[A-Za-z]/.test(newParagraph.textContent));
          newParagraph.focus();
          check(document.activeElement === newParagraph, 'Dynamic report content cannot receive focus');
          setTranslation(false);
          for (const [paragraph, original] of originals) check(paragraph.textContent === original, 'Original paragraph not restored');
          check(dynamic.textContent === 'A newly inserted article heading', 'Dynamic heading not restored');
          check(intro.getAttribute('tabindex') === '0', 'Disabling translation removed content focus');
          const empty = document.getElementById('empty-content');
          empty.append(document.createTextNode('Content loaded into an initially empty paragraph'));
          originals.set(empty, empty.textContent);
          await until(() => empty.getAttribute('tabindex') === '0');
          check(!article.querySelector('p').firstChild.__baaAiPendingId, 'Pending marker survived disable');
          const atomic = document.createElement('p');
          const atomicOriginal = '  ' + ('Important article details must survive every translation chunk. ').repeat(25) + 'Final detail.  ';
          atomic.textContent = atomicOriginal;
          article.append(atomic);
          const parts = BAA_DOM_TRANSLATOR.translatePage(atomic);
          check(parts.length > 1, 'Long paragraph was not chunked');
          check(parts.map(part => part.text).join(' ').replace(/\\s+/g, ' ').trim() === atomicOriginal.replace(/\\s+/g, ' ').trim(), 'Chunking omitted source text');
          const translatedParts = parts.map((part, index) => ({ id: part.id, translatedText: 'বাংলা অংশ ' + index }));
          BAA_DOM_TRANSLATOR.applyAiTranslations(translatedParts.slice(1).reverse());
          check(atomic.textContent === atomicOriginal, 'Incomplete chunk group was applied');
          BAA_DOM_TRANSLATOR.applyAiTranslations(translatedParts.slice(0, 1));
          check(!/[A-Za-z]/.test(atomic.textContent), 'Completed chunk group was not applied');
          BAA_DOM_TRANSLATOR.restorePage(atomic);
          check(atomic.textContent === atomicOriginal, 'Chunked original whitespace was not restored');
          const stale = BAA_DOM_TRANSLATOR.translatePage(atomic);
          atomic.firstChild.nodeValue = 'A newer publisher update';
          BAA_DOM_TRANSLATOR.applyAiTranslations(stale.map(part => ({ id: part.id, translatedText: 'পুরোনো অনুবাদ' })));
          check(atomic.textContent === 'A newer publisher update', 'Stale response overwrote publisher update');
          atomic.remove();
          setTranslation(true);
          await until(() => [...originals.keys()].filter(p => !p.closest('[hidden]')).every(p => !/[A-Za-z]/.test(p.textContent)));
          hold = true;
          const late = document.createElement('p');
          late.textContent = 'This paragraph waits for a late translation response';
          article.append(late);
          await until(() => held.length > 0);
          setTranslation(false);
          check(!late.firstChild.__baaAiPendingId, 'Pending text was not cleaned up');
          held.forEach(respond => respond());
          await sleep(300);
          check(late.textContent === 'This paragraph waits for a late translation response', 'Late response changed disabled page');
          changedListeners.forEach(listener => listener({ baaAssistantEnabled: { newValue: false } }, 'local'));
          check(!headline.hasAttribute('tabindex') && !dynamic.hasAttribute('tabindex'), 'Heading focus repair did not roll back');
          check(document.getElementById('authored-focus').getAttribute('tabindex') === '-1', 'Authored focus changed on rollback');
          check(document.getElementById('positive-focus').getAttribute('tabindex') === '2', 'Existing Tab order changed on rollback');
          check(!intro.hasAttribute('tabindex') && !newParagraph.hasAttribute('tabindex'), 'Content focus did not roll back');
          check(document.getElementById('negative-content').getAttribute('tabindex') === '-1', 'Original negative paragraph tabindex not restored');
          check(document.getElementById('positive-content').getAttribute('tabindex') === '3', 'Original paragraph Tab order changed on rollback');
          check(errors.length === 0, errors.join('; '));
          result.textContent = btoa(JSON.stringify({ ok: true, requests: requests.length, paragraphs: originals.size }));
        } catch (error) { result.textContent = btoa(JSON.stringify({ ok: false, error: error.message, errors })); }
      })();
    `;
    const html = fixture.replace("</html>", `<script>${setup}</script>${scripts.map(source => `<script>${source}</script>`).join("\n")}<script>${checks}</script></html>`);
    const page = join(directory, "article-test.html");
    await writeFile(page, html);
    const browser = spawnSync(chromePath, [
      "--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
      `--user-data-dir=${join(directory, "profile")}`, "--virtual-time-budget=30000", "--dump-dom", pathToFileURL(page).href
    ], { encoding: "utf8", timeout: 45000, maxBuffer: 2_000_000, windowsHide: true });
    assert.ifError(browser.error);
    assert.equal(browser.status, 0, browser.stderr.slice(-1500));
    const encoded = browser.stdout.match(/<pre id="baa-test-result"[^>]*>([A-Za-z0-9+/=]+)<\/pre>/)?.[1];
    assert.ok(encoded, `Chrome did not finish the article test: ${browser.stderr.slice(-1500)}`);
    const report = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    assert.equal(report.ok, true, JSON.stringify(report));
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
