(function registerAccounts(globalScope) {
  const PRIVATE_KEY = "baaAccountPrivate";
  const STATUS_KEY = "baaAccountStatus";
  const columns = Object.freeze({ baaAssistantEnabled: "assistant_enabled", baaNoiseReductionEnabled: "noise_reduction_enabled", baaFormGuidanceEnabled: "form_guidance_enabled", baaTranslationEnabled: "translation_enabled", baaTranslationVerbosity: "translation_verbosity", baaImageShortcutGuidanceEnabled: "image_shortcut_guidance_enabled", baaAiTranslationEnabled: "ai_translation_enabled", baaAiSummaryEnabled: "ai_summary_enabled", baaSummaryDetail: "summary_detail" });
  const shortcutColumns = Object.freeze({ navigator: "shortcut_navigator", voice: "shortcut_voice", pageSummary: "shortcut_page_summary", regionSummary: "shortcut_region_summary", imageOcr: "shortcut_image_ocr", imageDescription: "shortcut_image_description" });
  function createAccountManager({ storage, defaults, keybindings, config = {}, fetchImpl = fetch, now = () => Date.now() }) {
    const preferenceDefaults = Object.fromEntries(Object.entries(defaults).filter(([key]) => key !== "baaBackendUrl"));
    const booleanKeys = Object.keys(preferenceDefaults).filter(key => typeof preferenceDefaults[key] === "boolean");
    const enums = { baaTranslationVerbosity: ["concise", "balanced", "detailed"], baaSummaryDetail: ["brief", "standard", "detailed"] };
    const configured = Boolean(config.url && config.publishableKey);
    let state, queue = Promise.resolve();
    function serialize(task) { const next = queue.then(task); queue = next.catch(() => {}); return next; }
    function preferences(values = {}, partial = false) {
      if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("INVALID_PREFERENCES");
      const result = partial ? {} : { ...preferenceDefaults };
      for (const key of Object.keys(values)) {
        if (!(key in preferenceDefaults)) { if (partial) throw new Error("INVALID_PREFERENCES"); else continue; }
        const value = values[key];
        if (booleanKeys.includes(key) && typeof value !== "boolean" || enums[key] && !enums[key].includes(value)) throw new Error("INVALID_PREFERENCES");
        if (key === "baaCustomKeybindings") {
          const validated = keybindings.validate(value);
          if (validated.error) throw new Error("INVALID_KEYBINDINGS");
          result[key] = validated.custom;
        } else result[key] = value;
      }
      return result;
    }
    function status() {
      return { configured, signedIn: Boolean(state.session), email: state.session?.user.email || "", sync: state.sync,
        lastSyncedAt: state.lastSyncedAt || null, error: state.error || null };
    }
    function toRow(values) {
      return { user_id: state.session.user.id, ...Object.fromEntries(Object.entries(columns).map(([key, column]) => [column, values[key]])),
        ...Object.fromEntries(Object.entries(shortcutColumns).map(([action, column]) => [column, values.baaCustomKeybindings[action] || null])) };
    }
    function fromRow(row) {
      const values = Object.fromEntries(Object.entries(columns).map(([key, column]) => [key, row[column]]));
      values.baaCustomKeybindings = Object.fromEntries(Object.entries(shortcutColumns).filter(([, column]) => row[column] !== null && row[column] !== undefined).map(([action, column]) => [action, row[column]]));
      return preferences(values);
    }
    async function persist(activePreferences) {
      if (state.session) {
        state.caches ||= {};
        state.caches[state.session.user.id] = { preferences: state.preferences, dirty: state.dirty, lastSyncedAt: state.lastSyncedAt || null };
      }
      await storage.set({ [PRIVATE_KEY]: state, [STATUS_KEY]: status(), ...(activePreferences || {}) });
    }
    async function request(path, { method = "GET", body, token, prefer } = {}) {
      if (!configured) throw new Error("ACCOUNT_NOT_CONFIGURED");
      let response;
      try {
        response = await fetchImpl(`${config.url}${path}`, { method,
          headers: { apikey: config.publishableKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...(prefer ? { Prefer: prefer } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
      } catch { throw new Error("ACCOUNT_NETWORK_ERROR"); }
      const data = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 429) throw new Error("ACCOUNT_RATE_LIMITED");
        if (data?.code === "PGRST205" || data?.code === "42P01") throw new Error("PREFERENCES_TABLE_MISSING");
        if (["PGRST204", "42703"].includes(data?.code)) throw new Error("PREFERENCES_MIGRATION_REQUIRED");
        if (data?.error_code === "email_not_confirmed") throw new Error("EMAIL_NOT_CONFIRMED");
        if (data?.error_code === "weak_password") throw new Error("WEAK_PASSWORD");
        if (data?.error_code === "otp_expired" || path === "/auth/v1/verify" && response.status === 403) throw new Error("INVALID_OTP");
        if (path === "/auth/v1/token?grant_type=password" && [400, 401, 403].includes(response.status)) throw new Error("INVALID_CREDENTIALS");
        if (path === "/auth/v1/token?grant_type=refresh_token" && [400, 401, 403].includes(response.status)) throw new Error("ACCOUNT_SESSION_EXPIRED");
        if ([401, 403].includes(response.status)) throw new Error("ACCOUNT_ACCESS_DENIED");
        if (path === "/auth/v1/verify") throw new Error("INVALID_OTP");
        if (["/auth/v1/signup", "/auth/v1/recover", "/auth/v1/resend"].includes(path)) throw new Error("OTP_SEND_FAILED");
        throw new Error("ACCOUNT_SERVICE_ERROR");
      }
      return data;
    }
    function sessionFrom(data) {
      if (!data?.access_token || !data.refresh_token || !/^[0-9a-f-]{36}$/i.test(data.user?.id || "") || typeof data.user?.email !== "string" || !Number.isFinite(data.expires_in)) throw new Error("INVALID_ACCOUNT_RESPONSE");
      return { access_token: data.access_token, refresh_token: data.refresh_token,
        expires_at: now() + data.expires_in * 1000, user: { id: data.user.id, email: data.user.email } };
    }
    async function ensureSession(force = false) {
      if (!state.session) throw new Error("ACCOUNT_SIGN_IN_REQUIRED");
      if (force || state.session.expires_at <= now() + 60000) {
        const session = sessionFrom(await request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: state.session.refresh_token } }));
        if (session.user.id !== state.session.user.id) throw new Error("INVALID_ACCOUNT_RESPONSE");
        state.session = session; await persist();
      }
      return state.session;
    }
    async function authenticated(path, options) {
      let session = await ensureSession();
      try { return await request(path, { ...options, token: session.access_token }); }
      catch (error) {
        if (error.message !== "ACCOUNT_ACCESS_DENIED") throw error;
        session = await ensureSession(true);
        return request(path, { ...options, token: session.access_token });
      }
    }
    async function pull() {
      const selected = [...Object.values(columns), ...Object.values(shortcutColumns)].join(",");
      const rows = await authenticated(`/rest/v1/user_preferences?user_id=eq.${state.session.user.id}&select=${selected}&limit=1`);
      if (!Array.isArray(rows)) throw new Error("INVALID_ACCOUNT_RESPONSE");
      return rows.length ? fromRow(rows[0]) : null;
    }
    async function sync() {
      if (!state.session) return status();
      try {
        if (state.dirty && !state.needsHydration) {
          await authenticated("/rest/v1/user_preferences?on_conflict=user_id", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
            body: toRow(state.preferences) });
        } else {
          let remote = await pull();
          if (state.dirty) {
            // An explicit local save wins over the remote snapshot when recovering offline.
            await authenticated("/rest/v1/user_preferences?on_conflict=user_id", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
              body: toRow(state.preferences) });
          } else if (remote) state.preferences = remote;
          else {
            // Do not overwrite a row another device created after our initial read.
            await authenticated("/rest/v1/user_preferences?on_conflict=user_id", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal",
              body: toRow(state.preferences) });
            remote = await pull();
            if (!remote) throw new Error("INVALID_ACCOUNT_RESPONSE");
            state.preferences = remote;
          }
        }
        state.dirty = false; state.needsHydration = false; state.sync = "synced"; state.error = null; state.lastSyncedAt = new Date(now()).toISOString();
        await persist(state.preferences);
      } catch (error) {
        state.sync = error.message === "ACCOUNT_SESSION_EXPIRED" ? "sign_in_required" : "pending";
        state.error = error.message; await persist();
      }
      return status();
    }
    const ready = (async () => {
      const values = await storage.get(null);
      const saved = values[PRIVATE_KEY];
      const local = preferences(Object.fromEntries(Object.keys(preferenceDefaults).filter(key => values[key] !== undefined).map(key => [key, values[key]])));
      if (saved && saved.projectUrl === config.url && saved.guest && saved.preferences) state = saved;
      else state = { projectUrl: config.url || "", session: null, guest: local, preferences: local, dirty: false, needsHydration: false, sync: "local", error: null };
      if (!state.session) state.preferences = state.guest;
      await persist(state.preferences);
    })();
    async function run(task) { return serialize(async () => { await ready; return task(); }); }
    function emailAddress(email) {
      const normalized = String(email || "").trim().toLowerCase();
      if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("INVALID_EMAIL");
      return normalized;
    }
    function validPassword(password, creating = true) {
      if (typeof password !== "string" || password.length < (creating ? 8 : 1) || password.length > 128) throw new Error("WEAK_PASSWORD");
      return password;
    }
    async function cooldown() {
      const values = await storage.get("baaOtpPending");
      if (values.baaOtpPending?.sentAt + 60000 > now()) throw new Error("ACCOUNT_RATE_LIMITED");
    }
    async function pendingOtp(email, purpose) {
      await storage.remove("baaRecoverySession");
      await storage.set({ baaOtpPending: { email, purpose, sentAt: now() } });
      return { sent: true, email, purpose, retryAfter: 60 };
    }
    async function activate(session) {
      const cached = state.caches?.[session.user.id];
      state.guest = state.preferences; state.session = session; state.needsHydration = true; state.dirty = cached?.dirty === true; state.sync = "pending";
      state.preferences = cached?.preferences ? preferences(cached.preferences) : state.guest;
      state.lastSyncedAt = cached?.lastSyncedAt || null;
      await storage.remove("baaOtpPending"); await storage.remove("baaRecoverySession"); await persist(state.preferences); await sync();
      return { account: status() };
    }
    return Object.freeze({
      ready,
      getStatus: () => run(() => status()),
      getPreferences: () => run(async () => ({ ...defaults, ...state.preferences, baaBackendUrl: (await storage.get(defaults)).baaBackendUrl })),
      save: patch => run(async () => {
        const validated = preferences(patch, true);
        state.preferences = { ...state.preferences, ...validated };
        if (state.session) { state.dirty = true; state.sync = "pending"; }
        else { state.guest = state.preferences; state.sync = "local"; }
        await persist(state.preferences);
        if (state.session) await sync();
        return { saved: true, account: status() };
      }),
      signIn: (email, password) => run(async () => {
        if (state.session) throw new Error("ACCOUNT_ALREADY_SIGNED_IN");
        const session = sessionFrom(await request("/auth/v1/token?grant_type=password", { method: "POST", body: { email: emailAddress(email), password: validPassword(password, false) } }));
        return activate(session);
      }),
      signUp: (email, password) => run(async () => {
        if (state.session) throw new Error("ACCOUNT_ALREADY_SIGNED_IN");
        const normalized = emailAddress(email); validPassword(password); await cooldown();
        const result = await request("/auth/v1/signup", { method: "POST", body: { email: normalized, password } });
        if (result?.access_token) throw new Error("EMAIL_CONFIRMATION_REQUIRED");
        return pendingOtp(normalized, "signup");
      }),
      recover: email => run(async () => {
        if (state.session) throw new Error("ACCOUNT_ALREADY_SIGNED_IN");
        const normalized = emailAddress(email); await cooldown();
        await request("/auth/v1/recover", { method: "POST", body: { email: normalized } });
        return pendingOtp(normalized, "recovery");
      }),
      resendOtp: () => run(async () => {
        if (state.session) throw new Error("ACCOUNT_ALREADY_SIGNED_IN");
        const pending = (await storage.get("baaOtpPending")).baaOtpPending;
        if (!pending || !["signup", "recovery"].includes(pending.purpose)) throw new Error("INVALID_OTP");
        await cooldown();
        await request(pending.purpose === "signup" ? "/auth/v1/resend" : "/auth/v1/recover", { method: "POST", body: { email: pending.email, ...(pending.purpose === "signup" ? { type: "signup" } : {}) } });
        return pendingOtp(pending.email, pending.purpose);
      }),
      verifyOtp: (email, token, purpose) => run(async () => {
        if (state.session) throw new Error("ACCOUNT_ALREADY_SIGNED_IN");
        const normalized = emailAddress(email);
        const pending = (await storage.get("baaOtpPending")).baaOtpPending;
        if (!pending || pending.email !== normalized || pending.purpose !== purpose || !["signup", "recovery"].includes(purpose) || !/^\d{6,10}$/.test(String(token || ""))) throw new Error("INVALID_OTP");
        const session = sessionFrom(await request("/auth/v1/verify", { method: "POST", body: { email: normalized, token: String(token), type: purpose } }));
        if (purpose === "recovery") {
          await storage.set({ baaRecoverySession: session }); await storage.remove("baaOtpPending");
          return { recoveryVerified: true };
        }
        return activate(session);
      }),
      resetPassword: password => run(async () => {
        if (state.session) throw new Error("ACCOUNT_ALREADY_SIGNED_IN");
        validPassword(password);
        const session = (await storage.get("baaRecoverySession")).baaRecoverySession;
        if (!session || session.expires_at <= now()) throw new Error("RECOVERY_VERIFICATION_REQUIRED");
        const user = await request("/auth/v1/user", { method: "PUT", token: session.access_token, body: { password } });
        if (user?.id !== session.user.id) throw new Error("INVALID_ACCOUNT_RESPONSE");
        return activate(session);
      }),
      signOut: () => run(async () => {
        const session = state.session;
        // Restore guest settings even if the server cannot be contacted.
        state.session = null; state.preferences = state.guest; state.dirty = false; state.needsHydration = false;
        state.sync = "local"; state.error = null; state.lastSyncedAt = null;
        await storage.remove("baaOtpPending"); await storage.remove("baaRecoverySession"); await persist(state.guest);
        let revoked = true;
        if (session) try { await request("/auth/v1/logout?scope=local", { method: "POST", token: session.access_token }); } catch { revoked = false; }
        return { account: status(), revoked };
      }),
      sync: () => run(sync)
    });
  }
  globalScope.BAA_ACCOUNTS = Object.freeze({ createAccountManager, columns, shortcutColumns });
})(globalThis);
