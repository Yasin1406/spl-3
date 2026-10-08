(function setupAccountControls() {
  const status = document.getElementById("accountStatus"), message = document.getElementById("accountMessage");
  const forms = { login: "accountLoginForm", signup: "accountEmailForm", recovery: "accountRecoveryForm", otp: "accountOtpForm", reset: "accountResetForm" };
  const field = id => document.getElementById(id);
  let account = null, view = "login", sentEmail = "", purpose = "", retryAt = 0, cooldown = null, busy = false;
  const errors = {
    ACCOUNT_NOT_CONFIGURED: "অ্যাকাউন্ট সেবা এখন চালু নেই। অতিথি হিসেবে ব্যবহার করতে পারবেন।",
    ACCOUNT_NETWORK_ERROR: "ইন্টারনেট বা অ্যাকাউন্ট সেবায় সংযোগ পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।",
    ACCOUNT_RATE_LIMITED: "অনুরোধসীমা পূর্ণ হয়েছে। অন্তত এক মিনিট পরে আবার চেষ্টা করুন।",
    OTP_SEND_FAILED: "কোড পাঠানো যায়নি। ইমেইল ঠিকানা ও ইমেইল সেবা পরীক্ষা করে আবার চেষ্টা করুন।",
    INVALID_EMAIL: "সঠিক ইমেইল ঠিকানা লিখুন।", INVALID_OTP: "কোডটি ভুল বা মেয়াদ শেষ হয়েছে। আবার কোড নিয়ে চেষ্টা করুন।",
    INVALID_CREDENTIALS: "ইমেইল বা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন অথবা পাসওয়ার্ড পুনরুদ্ধার করুন।",
    EMAIL_NOT_CONFIRMED: "ইমেইল এখনও যাচাই করা হয়নি। অ্যাকাউন্ট তৈরির কোড দিয়ে যাচাই করুন।",
    WEAK_PASSWORD: "৮ থেকে ১২৮ অক্ষরের পাসওয়ার্ড দিন। সেবার অতিরিক্ত পাসওয়ার্ড শর্ত থাকলে সেগুলোও মানতে হবে।",
    PASSWORDS_DO_NOT_MATCH: "দুটি পাসওয়ার্ড এক নয়। আবার লিখুন।",
    RECOVERY_VERIFICATION_REQUIRED: "পাসওয়ার্ড বদলানোর আগে ইমেইলের পুনরুদ্ধার কোড যাচাই করুন।",
    EMAIL_CONFIRMATION_REQUIRED: "অ্যাকাউন্ট সেবায় ইমেইল নিশ্চিতকরণ চালু করতে হবে।",
    PREFERENCES_TABLE_MISSING: "পছন্দ সংরক্ষণের সেবা এখন প্রস্তুত নয়।",
    PREFERENCES_MIGRATION_REQUIRED: "পছন্দ সংরক্ষণের নতুন ডাটাবেজ কাঠামো এখনও চালু হয়নি।",
    ACCOUNT_ACCESS_DENIED: "অ্যাকাউন্টে প্রবেশ করা যায়নি। আবার সাইন ইন করুন।",
    ACCOUNT_SESSION_EXPIRED: "সাইন ইন-এর মেয়াদ শেষ হয়েছে। সাইন আউট করে পাসওয়ার্ড দিয়ে আবার সাইন ইন করুন।"
  };
  function send(type, detail = {}) {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type, ...detail }, response => {
      if (chrome.runtime.lastError || response?.error || !response) reject(new Error(response?.error || "ACCOUNT_SERVICE_ERROR")); else resolve(response);
    }));
  }
  function clearPasswords() { document.querySelectorAll("[data-account-password]").forEach(input => { input.value = ""; }); }
  function render(value = account) {
    account = value;
    if (!account) return;
    for (const [name, id] of Object.entries(forms)) field(id).hidden = account.signedIn || !account.configured || view !== name;
    field("accountSignedIn").hidden = !account.signedIn;
    if (account.signedIn) {
      status.textContent = `${account.email} — ${account.sync === "synced" ? "পছন্দগুলো অ্যাকাউন্টে সংরক্ষিত আছে।" : "পছন্দগুলো এই ব্রাউজারে আছে; অ্যাকাউন্টে সিঙ্ক বাকি।"}`;
      if (account.error) message.textContent = errors[account.error] || "পছন্দগুলো সিঙ্ক করা যায়নি। আবার চেষ্টা করুন।";
    } else status.textContent = account.configured ? "অতিথি হিসেবে ব্যবহার করছেন। আপনার পছন্দগুলো শুধু এই ব্রাউজারে সংরক্ষিত হচ্ছে।" : errors.ACCOUNT_NOT_CONFIGURED;
  }
  function show(next, focusId) { view = next; render(); message.textContent = ""; if (focusId) field(focusId).focus(); }
  function updateCooldown() {
    const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
    field("accountResend").disabled = busy || Boolean(seconds);
    field("accountResend").textContent = seconds ? `আবার কোড পাঠান (${seconds} সেকেন্ড)` : "আবার কোড পাঠান";
    if (!seconds && cooldown) { clearInterval(cooldown); cooldown = null; }
  }
  async function action(task) {
    if (busy) return;
    busy = true; message.textContent = "অনুগ্রহ করে অপেক্ষা করুন…";
    document.querySelectorAll("#accountSection button").forEach(button => { button.disabled = true; });
    const controls = [...document.querySelectorAll("#settingsForm fieldset, #settingsForm button[type='submit']")].map(control => [control, control.disabled]);
    controls.forEach(([control]) => { control.disabled = true; });
    let target;
    try { target = await task(); }
    catch (error) { message.textContent = errors[error.message] || "অ্যাকাউন্ট সেবা এখন সাড়া দিচ্ছে না। আবার চেষ্টা করুন।"; }
    finally {
      busy = false; document.querySelectorAll("#accountSection button").forEach(button => { button.disabled = false; });
      controls.forEach(([control, disabled]) => { control.disabled = disabled; }); updateCooldown(); target?.focus();
    }
  }
  function otpSent(result) {
    clearPasswords(); sentEmail = result.email; purpose = result.purpose; retryAt = Date.now() + result.retryAfter * 1000;
    field("accountOtp").value = ""; show("otp", "accountOtp");
    message.textContent = purpose === "recovery" ? "এই ইমেইলে অ্যাকাউন্ট থাকলে পুনরুদ্ধারের কোড পাঠানো হয়েছে। কোডটি লিখুন।" : `${sentEmail} ঠিকানায় যাচাইয়ের কোড পাঠানো হয়েছে। কোডটি লিখুন।`;
    if (cooldown) clearInterval(cooldown); cooldown = setInterval(updateCooldown, 1000); updateCooldown();
  }
  function confirmPassword(passwordId, confirmId) {
    if (field(passwordId).value !== field(confirmId).value) throw new Error("PASSWORDS_DO_NOT_MATCH");
    return field(passwordId).value;
  }
  function signedIn(response) { clearPasswords(); sentEmail = ""; purpose = ""; field("accountOtp").value = ""; view = "login"; message.textContent = "সাইন ইন হয়েছে।"; render(response.account); return field("accountSync"); }
  function submit(id, task) { field(id).addEventListener("submit", event => { event.preventDefault(); action(task); }); }
  field("accountShowSignup").addEventListener("click", () => show("signup", "accountEmail"));
  field("accountShowRecovery").addEventListener("click", () => { field("accountRecoveryEmail").value = field("accountLoginEmail").value; show("recovery", "accountRecoveryEmail"); });
  document.querySelectorAll(".accountBackLogin").forEach(button => button.addEventListener("click", () => { clearPasswords(); field("accountOtp").value = ""; show("login", "accountLoginEmail"); }));
  field("showAccountPasswords").addEventListener("change", event => document.querySelectorAll("[data-account-password]").forEach(input => { input.type = event.target.checked ? "text" : "password"; }));
  submit("accountLoginForm", async () => signedIn(await send("BAA_SIGN_IN", { email: field("accountLoginEmail").value, password: field("accountLoginPassword").value })));
  submit("accountEmailForm", async () => otpSent(await send("BAA_SIGN_UP", { email: field("accountEmail").value, password: confirmPassword("accountSignupPassword", "accountSignupConfirm") })));
  submit("accountRecoveryForm", async () => otpSent(await send("BAA_RECOVER_ACCOUNT", { email: field("accountRecoveryEmail").value })));
  field("accountResend").addEventListener("click", () => { if (Date.now() >= retryAt) action(async () => otpSent(await send("BAA_RESEND_OTP"))); });
  field("accountChangeEmail").addEventListener("click", () => { field("accountOtp").value = ""; show(purpose === "recovery" ? "recovery" : "signup", purpose === "recovery" ? "accountRecoveryEmail" : "accountEmail"); });
  submit("accountOtpForm", async () => {
    const response = await send("BAA_VERIFY_OTP", { email: sentEmail, token: field("accountOtp").value.trim(), purpose });
    field("accountOtp").value = "";
    if (response.recoveryVerified) { show("reset", "accountResetPassword"); message.textContent = "ইমেইল যাচাই হয়েছে। নতুন পাসওয়ার্ড লিখুন।"; return; }
    return signedIn(response);
  });
  submit("accountResetForm", async () => signedIn(await send("BAA_RESET_PASSWORD", { password: confirmPassword("accountResetPassword", "accountResetConfirm") })));
  field("accountSync").addEventListener("click", () => action(async () => { const response = await send("BAA_SYNC_PREFERENCES"); message.textContent = response.account.sync === "synced" ? "পছন্দগুলো সিঙ্ক হয়েছে।" : "সিঙ্ক বাকি আছে।"; render(response.account); }));
  field("accountSignOut").addEventListener("click", () => action(async () => {
    const response = await send("BAA_SIGN_OUT"); clearPasswords(); view = "login"; render(response.account);
    message.textContent = response.revoked ? "সাইন আউট হয়েছে। অতিথির পছন্দগুলো ফিরিয়ে আনা হয়েছে।" : "এই ব্রাউজার থেকে সাইন আউট হয়েছে। সার্ভারে সেশন বন্ধের অনুরোধ পৌঁছায়নি।";
    return field("accountLoginEmail");
  }));
  chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.baaAccountStatus) render(changes.baaAccountStatus.newValue); });
  send("BAA_GET_ACCOUNT_STATUS").then(response => render(response.account)).catch(error => { status.textContent = errors[error.message] || "অ্যাকাউন্টের অবস্থা দেখা যায়নি। অতিথি হিসেবে ব্যবহার করতে পারবেন।"; });
})();
