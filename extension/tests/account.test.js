import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const sources = await Promise.all(["content/keybindings", "background/account"].map(file => readFile(new URL(`../src/${file}.js`, import.meta.url), "utf8")));
const defaults = { baaAssistantEnabled: true, baaCustomKeybindings: {}, baaNoiseReductionEnabled: false, baaFormGuidanceEnabled: true, baaTranslationEnabled: false, baaTranslationVerbosity: "balanced", baaImageShortcutGuidanceEnabled: true, baaAiTranslationEnabled: true, baaAiSummaryEnabled: true, baaSummaryDetail: "standard", baaBackendUrl: "http://localhost:3000" };
const firstId = "11111111-1111-4111-8111-111111111111", secondId = "22222222-2222-4222-8222-222222222222";
function fixture(initial = {}, options = {}) {
  let stored = structuredClone(initial), time = 100000, offline = false, userId = firstId, failures = {}, writes = 0;
  const requests = [], rows = new Map();
  const storage = {
    async get(query) { if (query === null) return structuredClone(stored); if (typeof query === "string") return { [query]: structuredClone(stored[query]) }; return { ...structuredClone(query), ...structuredClone(stored) }; },
    async set(value) { stored = { ...stored, ...structuredClone(value) }; },
    async remove(key) { delete stored[key]; }
  };
  function session() { return { access_token: "access", refresh_token: "refresh", expires_in: 3600, user: { id: userId, email: userId === firstId ? "one@example.test" : "two@example.test" } }; }
  const fetchImpl = async (url, request) => {
    const path = url.replace("https://project.supabase.co", ""), body = request.body ? JSON.parse(request.body) : null;
    requests.push({ path, request, body });
    if (offline) throw new Error("offline");
    if (failures[path]) { const failure = failures[path]; delete failures[path]; return { ok: false, status: failure.status, json: async () => failure.body }; }
    let data = {}, status = 200;
    if (path === "/auth/v1/verify" || path.startsWith("/auth/v1/token")) data = session();
    else if (path === "/auth/v1/user") data = session().user;
    else if (path.startsWith("/rest/v1/user_preferences")) {
      if (request.method === "POST") {
        writes++;
        const values = Object.fromEntries(Object.entries(sandbox.BAA_ACCOUNTS.columns).map(([key, column]) => [key, body[column]]));
        values.baaCustomKeybindings = Object.fromEntries(Object.entries(sandbox.BAA_ACCOUNTS.shortcutColumns).filter(([, column]) => body[column] !== null).map(([action, column]) => [action, body[column]]));
        if (!request.headers.Prefer.includes("ignore-duplicates") || !rows.has(body.user_id)) rows.set(body.user_id, structuredClone(values));
        status = 204; data = null;
      } else {
        const id = new URL(url).searchParams.get("user_id").slice(3);
        const values = { ...defaults, ...rows.get(id) };
        const row = { ...Object.fromEntries(Object.entries(sandbox.BAA_ACCOUNTS.columns).map(([key, column]) => [column, values[key]])), ...Object.fromEntries(Object.entries(sandbox.BAA_ACCOUNTS.shortcutColumns).map(([action, column]) => [column, values.baaCustomKeybindings[action] || null])) };
        data = rows.has(id) ? [row] : [];
      }
    } else if (path.startsWith("/auth/v1/logout")) { status = 204; data = null; }
    return { ok: true, status, json: async () => structuredClone(data) };
  };
  const sandbox = vm.createContext({ AbortSignal, Date });
  sources.forEach(source => vm.runInContext(source, sandbox));
  function manager() { return sandbox.BAA_ACCOUNTS.createAccountManager({ storage, defaults, keybindings: sandbox.BAA_KEYBINDINGS,
    config: options.unconfigured ? {} : { url: "https://project.supabase.co", publishableKey: "sb_publishable_test" }, fetchImpl, now: () => time }); }
  const account = manager();
  return { account, manager, rows, requests, storage, get stored() { return stored; }, get writes() { return writes; },
    get pullPath() { return `/rest/v1/user_preferences?user_id=eq.${userId}&select=${[...Object.values(sandbox.BAA_ACCOUNTS.columns), ...Object.values(sandbox.BAA_ACCOUNTS.shortcutColumns)].join(',')}&limit=1`; },
    set offline(value) { offline = value; }, set userId(value) { userId = value; }, advance(ms) { time += ms; }, fail(path, status, body = {}) { failures[path] = { status, body }; } };
}
async function login(f, email = "one@example.test") { return f.account.signIn(email, "test-password"); }

test("first-use defaults and guest modifications never contact Supabase", async () => {
  const f = fixture();
  await f.account.ready; assert.equal((await f.account.getPreferences()).baaSummaryDetail, "standard");
  await f.account.save({ baaSummaryDetail: "brief", baaCustomKeybindings: { navigator: "Alt+Shift+Q" } });
  await f.account.sync(); assert.equal(f.requests.length, 0);
  assert.equal((await f.manager().getPreferences()).baaSummaryDetail, "brief");
  assert.equal((await f.account.getStatus()).signedIn, false);
});

test("accounts are optional when configuration is absent", async () => {
  const f = fixture({}, { unconfigured: true });
  await f.account.save({ baaAssistantEnabled: false });
  assert.equal((await f.account.getStatus()).configured, false);
  await assert.rejects(f.account.signUp("one@example.test", "test-password"), /ACCOUNT_NOT_CONFIGURED/);
  assert.equal(f.requests.length, 0);
});

test("new account starts with guest preferences, signs in only after verification, and keeps secrets private", async () => {
  const f = fixture({ baaSummaryDetail: "brief", baaBackendUrl: "http://localhost:4444" });
  await f.account.signUp(" ONE@example.test ", "test-password");
  assert.equal((await f.account.getStatus()).signedIn, false);
  await f.account.verifyOtp("one@example.test", "123456", "signup");
  assert.equal(f.rows.get(firstId).baaSummaryDetail, "brief");
  assert.equal(f.rows.get(firstId).baaBackendUrl, undefined);
  assert.equal((await f.account.getPreferences()).baaBackendUrl, "http://localhost:4444");
  assert.doesNotMatch(JSON.stringify(await f.account.getStatus()), /access_token|refresh_token/);
  assert.doesNotMatch(JSON.stringify(await f.account.getPreferences()), /access_token|refresh_token|baaAccountPrivate/);
  assert.equal(f.requests.find(request => request.path === "/auth/v1/verify").body.type, "signup");
  assert.equal(f.requests.find(request => request.path === "/auth/v1/signup").request.headers.Authorization, undefined);
  assert.doesNotMatch(JSON.stringify(f.stored), /test-password/);
  const inserted = f.requests.find(request => request.path.startsWith("/rest/v1/") && request.body)?.body;
  assert.equal(inserted.preferences, undefined); assert.equal(inserted.summary_detail, "brief"); assert.equal(inserted.shortcut_navigator, null);
  assert.equal((await f.account.getStatus()).sync, "synced");
});

test("existing account loads remote settings and sign-out restores separate guest preferences", async () => {
  const f = fixture({ baaSummaryDetail: "brief" }); f.rows.set(firstId, { baaSummaryDetail: "detailed" });
  await login(f); assert.equal((await f.account.getPreferences()).baaSummaryDetail, "detailed"); assert.equal(f.writes, 0);
  await f.account.save({ baaNoiseReductionEnabled: true }); assert.equal(f.rows.get(firstId).baaNoiseReductionEnabled, true);
  await f.account.signOut(); assert.equal((await f.account.getPreferences()).baaSummaryDetail, "brief");
  const requests = f.requests.length;
  await f.account.save({ baaSummaryDetail: "standard" }); await f.account.sync();
  assert.equal(f.requests.length, requests); assert.equal(f.rows.get(firstId).baaSummaryDetail, "detailed");
});

test("offline account saves survive worker restart, sign-out and reauthentication without uploading guest edits", async () => {
  const f = fixture(); await login(f); f.offline = true;
  const saved = await f.account.save({ baaSummaryDetail: "detailed" }); assert.equal(saved.saved, true); assert.equal(saved.account.sync, "pending");
  const restarted = f.manager(); assert.equal((await restarted.getPreferences()).baaSummaryDetail, "detailed");
  await f.account.signOut(); await f.account.save({ baaNoiseReductionEnabled: true }); f.offline = false; f.advance(60000);
  await login(f); assert.equal(f.rows.get(firstId).baaSummaryDetail, "detailed"); assert.equal(f.rows.get(firstId).baaNoiseReductionEnabled, false);
});

test("switching accounts does not apply another account's cached settings", async () => {
  const f = fixture({ baaSummaryDetail: "brief" }); await login(f); await f.account.save({ baaSummaryDetail: "detailed" }); await f.account.signOut();
  f.userId = secondId; f.advance(60000); f.rows.set(secondId, { baaSummaryDetail: "standard" });
  await login(f, "two@example.test"); assert.equal((await f.account.getPreferences()).baaSummaryDetail, "standard");
  assert.equal(f.rows.get(firstId).baaSummaryDetail, "detailed");
});

test("expired sessions refresh and persist rotated tokens before preference access", async () => {
  const f = fixture(); await login(f); f.advance(3600000);
  await f.account.sync(); assert.ok(f.requests.some(request => request.path === "/auth/v1/token?grant_type=refresh_token"));
  assert.ok(f.stored.baaAccountPrivate.session.expires_at > 3700000);
});

test("expired refresh tokens keep account cache and request sign-in without writing as guest", async () => {
  const f = fixture(); await login(f); f.advance(3600000); f.fail("/auth/v1/token?grant_type=refresh_token", 400);
  const saved = await f.account.save({ baaSummaryDetail: "brief" });
  assert.equal(saved.account.sync, "sign_in_required"); assert.equal(f.stored.baaAccountPrivate.dirty, true);
  assert.equal(f.stored.baaAccountPrivate.guest.baaSummaryDetail, "standard");
});

test("missing table does not break verified sign-in or local settings", async () => {
  const f = fixture(); f.fail(f.pullPath, 404, { code: "PGRST205" });
  const response = await login(f); assert.equal(response.account.signedIn, true); assert.equal(response.account.error, "PREFERENCES_TABLE_MISSING");
  assert.equal((await f.account.getPreferences()).baaSummaryDetail, "standard"); await f.account.sync(); assert.equal(f.rows.has(firstId), true);
});

test("invalid remote keybindings are rejected without replacing local preferences", async () => {
  const f = fixture({ baaSummaryDetail: "brief" }); f.rows.set(firstId, { baaCustomKeybindings: { navigator: "Alt+Shift+A" } });
  await login(f); assert.equal((await f.account.getStatus()).error, "INVALID_KEYBINDINGS");
  assert.equal((await f.account.getPreferences()).baaSummaryDetail, "brief");
});

test("invalid settings, arbitrary configuration, conflicting shortcuts, and incorrect email/OTP are rejected", async () => {
  const f = fixture();
  for (const preferences of [{ baaAssistantEnabled: "yes" }, { baaSummaryDetail: "huge" }, { baaBackendUrl: "https://attacker.test" }, { baaAccountPrivate: {} }, { baaCustomKeybindings: { voice: "Alt+Shift+Z" } }]) await assert.rejects(f.account.save(preferences), /INVALID_/);
  await assert.rejects(f.account.signUp("invalid", "test-password"), /INVALID_EMAIL/);
  await f.account.signUp("one@example.test", "test-password");
  await assert.rejects(f.account.verifyOtp("other@example.test", "123456", "signup"), /INVALID_OTP/);
  await assert.rejects(f.account.verifyOtp("one@example.test", "abc", "signup"), /INVALID_OTP/);
  await assert.rejects(f.account.verifyOtp("one@example.test", "123456", "recovery"), /INVALID_OTP/);
  assert.equal((await f.account.getStatus()).signedIn, false);
});

test("OTP cooldown applies across worker restarts and does not reveal provider errors", async () => {
  const f = fixture(); await f.account.signUp("one@example.test", "test-password");
  await assert.rejects(f.manager().signUp("two@example.test", "test-password"), /ACCOUNT_RATE_LIMITED/);
  f.advance(60000); f.fail("/auth/v1/resend", 500, { msg: "SMTP password: private" });
  await assert.rejects(f.account.resendOtp(), /^Error: OTP_SEND_FAILED$/);
});

test("401 preference access retries once with a refreshed session", async () => {
  const f = fixture(); await login(f);
  f.fail(f.pullPath, 401);
  await f.account.sync(); assert.equal((await f.account.getStatus()).sync, "synced");
  assert.ok(f.requests.some(request => request.path.startsWith("/auth/v1/token")));
});

test("password sign-in sends no OTP and wrong credentials do not create sessions", async () => {
  const f = fixture(); f.fail("/auth/v1/token?grant_type=password", 400, { error_code: "invalid_credentials" });
  await assert.rejects(login(f), /INVALID_CREDENTIALS/); assert.equal((await f.account.getStatus()).signedIn, false);
  await login(f);
  assert.equal(f.requests.some(request => ["/auth/v1/otp", "/auth/v1/signup", "/auth/v1/recover"].includes(request.path)), false);
  assert.doesNotMatch(JSON.stringify(f.stored), /test-password/);
});

test("recovery requires its own verified OTP before resetting a password and restores the existing account", async () => {
  const f = fixture(); f.rows.set(firstId, { baaSummaryDetail: "detailed" });
  await assert.rejects(f.account.resetPassword("new-password"), /RECOVERY_VERIFICATION_REQUIRED/);
  await f.account.recover("one@example.test");
  await assert.rejects(f.account.verifyOtp("one@example.test", "123456", "signup"), /INVALID_OTP/);
  const verified = await f.account.verifyOtp("one@example.test", "123456", "recovery");
  assert.equal(verified.recoveryVerified, true); assert.equal((await f.account.getStatus()).signedIn, false);
  await f.account.resetPassword("new-password");
  assert.equal((await f.account.getPreferences()).baaSummaryDetail, "detailed"); assert.equal((await f.account.getStatus()).signedIn, true);
  assert.equal(f.stored.baaRecoverySession, undefined); assert.doesNotMatch(JSON.stringify(f.stored), /new-password/);
});

test("weak passwords and expired recovery sessions cannot update passwords", async () => {
  const f = fixture(); await assert.rejects(f.account.signUp("one@example.test", "short"), /WEAK_PASSWORD/);
  await f.account.recover("one@example.test"); await f.account.verifyOtp("one@example.test", "123456", "recovery"); f.advance(3600000);
  await assert.rejects(f.account.resetPassword("new-password"), /RECOVERY_VERIFICATION_REQUIRED/);
  assert.equal(f.requests.some(request => request.path === "/auth/v1/user"), false);
});
