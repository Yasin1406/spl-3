import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
const chromePath = process.env.BAA_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function browserChecks() {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async condition => { for (let i = 0; i < 100; i++) { if (condition()) return; await wait(10); } throw new Error("Timed out"); };
  const reporter = document.createElement("pre"); reporter.id = "test-result"; document.body.append(reporter);
  const submit = id => document.getElementById(id).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  try {
    await until(() => !document.getElementById("accountLoginForm").hidden);
    check(document.getElementById("summaryDetail").value === "brief", "Guest preferences not loaded");
    document.getElementById("accountShowSignup").click();
    document.getElementById("accountEmail").value = "one@example.test";
    document.getElementById("accountSignupPassword").value = "test-password";
    document.getElementById("accountSignupConfirm").value = "different-password"; submit("accountEmailForm");
    await until(() => document.getElementById("accountMessage").textContent.includes("পাসওয়ার্ড এক নয়"));
    check(!network.some(url => url.endsWith('/signup')), "Mismatched signup passwords were sent");
    document.getElementById("accountSignupConfirm").value = "test-password"; submit("accountEmailForm");
    await until(() => !document.getElementById("accountOtpForm").hidden);
    check(document.activeElement.id === "accountOtp", "OTP field did not receive focus");
    check(document.getElementById("accountResend").disabled, "Resend cooldown absent");
    check(document.getElementById("accountSignedIn").hidden, "Sending OTP signed user in");
    document.getElementById("accountOtp").value = "000000"; submit("accountOtpForm");
    await until(() => document.getElementById("accountMessage").textContent.includes("কোডটি ভুল"));
    check(document.getElementById("accountSignedIn").hidden, "Invalid OTP signed user in");
    document.getElementById("accountOtp").value = "123456"; submit("accountOtpForm");
    await until(() => !document.getElementById("accountSignedIn").hidden && document.getElementById("summaryDetail").value === "detailed");
    check(document.getElementById("accountOtpForm").hidden && !document.getElementById("accountOtp").value, "Verified OTP form/code not cleared");
    check(document.activeElement.id === "accountSync", "Successful sign-in did not focus an available control");
    check(document.getElementById("shortcut-navigator").value === "Alt+Shift+Q", "Account custom binding not loaded");
    document.getElementById("summaryDetail").value = "standard"; submit("settingsForm");
    await until(() => row.baaSummaryDetail === "standard");
    check(document.getElementById("saveStatus").textContent.includes("অ্যাকাউন্টে"), "Account save feedback absent");
    offline = true; document.getElementById("summaryDetail").value = "brief"; submit("settingsForm");
    await until(() => document.getElementById("saveStatus").textContent.includes("সিঙ্ক বাকি"));
    check(row.baaSummaryDetail === "standard", "Offline change reached server");
    document.getElementById("accountSignOut").click();
    await until(() => !document.getElementById("accountLoginForm").hidden && document.getElementById("summaryDetail").value === "brief");
    check(!document.getElementById("shortcut-navigator").value, "Sign-out did not restore guest bindings");
    const before = network.length;
    document.getElementById("summaryDetail").value = "detailed"; submit("settingsForm");
    await until(() => document.getElementById("saveStatus").textContent.includes("অতিথির"));
    check(network.length === before && row.baaSummaryDetail === "standard", "Guest save accessed account database");
    offline = false;
    document.getElementById("accountLoginEmail").value = "one@example.test";
    document.getElementById("accountLoginPassword").value = "wrong-password"; submit("accountLoginForm");
    await until(() => document.getElementById("accountMessage").textContent.includes("সঠিক নয়"));
    const otpRequests = network.filter(url => /\/(signup|recover|resend|verify)$/.test(url)).length;
    document.getElementById("accountLoginPassword").value = "test-password"; submit("accountLoginForm");
    await until(() => !document.getElementById("accountSignedIn").hidden);
    check(network.filter(url => /\/(signup|recover|resend|verify)$/.test(url)).length === otpRequests, "Password login sent an OTP");
    document.getElementById("accountSignOut").click(); await until(() => !document.getElementById("accountLoginForm").hidden);
    document.getElementById("accountShowRecovery").click(); document.getElementById("accountRecoveryEmail").value = "one@example.test"; submit("accountRecoveryForm");
    await until(() => !document.getElementById("accountOtpForm").hidden);
    document.getElementById("accountOtp").value = "123456"; submit("accountOtpForm");
    await until(() => !document.getElementById("accountResetForm").hidden);
    check(document.getElementById("accountSignedIn").hidden && document.activeElement.id === "accountResetPassword", "Recovery signed in before password update or lost focus");
    document.getElementById("accountResetPassword").value = "new-password"; document.getElementById("accountResetConfirm").value = "new-password"; submit("accountResetForm");
    await until(() => !document.getElementById("accountSignedIn").hidden);
    check(passwordValue === "new-password", "Recovery did not update password");
    check(!JSON.stringify(stored).includes('new-password') && !JSON.stringify(stored).includes('test-password'), "Password persisted in local storage");
    reporter.textContent = btoa(JSON.stringify({ ok: true }));
  } catch (error) { reporter.textContent = btoa(JSON.stringify({ ok: false, error: error.message, stack: error.stack })); }
}

test("Chrome password login, signup/recovery OTP, cloud preferences and guest restoration", { skip: !existsSync(chromePath) }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "baa-account-ui-"));
  try {
    const [html, keys, account, settings, ui] = await Promise.all(["settings/settings.html", "content/keybindings.js", "background/account.js", "settings/settings.js", "settings/account.js"].map(file => readFile(new URL(`../src/${file}`, import.meta.url), "utf8")));
    const setup = `const changed=[],network=[];let stored={baaSummaryDetail:'brief'},row={baaSummaryDetail:'detailed',baaCustomKeybindings:{navigator:'Alt+Shift+Q'}},offline=false,passwordValue='test-password';
      const defaults={baaAssistantEnabled:true,baaCustomKeybindings:{},baaNoiseReductionEnabled:false,baaFormGuidanceEnabled:true,baaTranslationEnabled:false,baaTranslationVerbosity:'balanced',baaImageShortcutGuidanceEnabled:true,baaAiTranslationEnabled:true,baaAiSummaryEnabled:true,baaSummaryDetail:'standard',baaBackendUrl:'http://localhost:3000'};
      window.chrome={storage:{local:{get(query,callback){const values=query===null?structuredClone(stored):typeof query==='string'?{[query]:structuredClone(stored[query])}:{...query,...structuredClone(stored)};if(callback)callback(values);return Promise.resolve(values);},async set(values){const updates=Object.fromEntries(Object.entries(values).filter(([key,value])=>JSON.stringify(value)!==JSON.stringify(stored[key])).map(([key,value])=>[key,{newValue:structuredClone(value)}]));stored={...stored,...structuredClone(values)};changed.forEach(listener=>listener(updates,'local'));},async remove(key){delete stored[key];}},onChanged:{addListener(callback){changed.push(callback);}}},runtime:{}};
      async function mockFetch(url,options){network.push(url);if(offline)throw Error('offline');const body=options.body?JSON.parse(options.body):null;let status=200,data={};
      const session={access_token:'access',refresh_token:'refresh',expires_in:3600,user:{id:'11111111-1111-4111-8111-111111111111',email:'one@example.test'}};
      if(url.endsWith('/verify')){if(body.token!=='123456')return{ok:false,status:403,json:async()=>({error_code:'otp_expired'})};data=session;}
      else if(url.includes('grant_type=password')){if(body.password!==passwordValue)return{ok:false,status:400,json:async()=>({error_code:'invalid_credentials'})};data=session;}
      else if(url.endsWith('/user')){passwordValue=body.password;data=session.user;}
      else if(url.includes('/rest/v1/')){if(options.method==='POST'){row=Object.fromEntries(Object.entries(BAA_ACCOUNTS.columns).map(([key,column])=>[key,body[column]]));row.baaCustomKeybindings=Object.fromEntries(Object.entries(BAA_ACCOUNTS.shortcutColumns).filter(([,column])=>body[column]!==null).map(([action,column])=>[action,body[column]]));status=204;data=null;}else{const values={...defaults,...row};data=[{...Object.fromEntries(Object.entries(BAA_ACCOUNTS.columns).map(([key,column])=>[column,values[key]])),...Object.fromEntries(Object.entries(BAA_ACCOUNTS.shortcutColumns).map(([action,column])=>[column,values.baaCustomKeybindings[action]||null]))}];}}
      return{ok:true,status,json:async()=>structuredClone(data)};}`;
    const transport = `const manager=BAA_ACCOUNTS.createAccountManager({storage:chrome.storage.local,defaults,keybindings:BAA_KEYBINDINGS,config:{url:'https://project.supabase.co',publishableKey:'sb_publishable_test'},fetchImpl:mockFetch});
      chrome.runtime.sendMessage=(message,callback)=>{let task;if(message.type==='BAA_GET_PREFERENCES')task=manager.getPreferences();else if(message.type==='BAA_GET_ACCOUNT_STATUS')task=manager.getStatus().then(account=>({account}));else if(message.type==='BAA_SAVE_PREFERENCES')task=manager.save(message.preferences);else if(message.type==='BAA_SIGN_IN')task=manager.signIn(message.email,message.password);else if(message.type==='BAA_SIGN_UP')task=manager.signUp(message.email,message.password);else if(message.type==='BAA_RECOVER_ACCOUNT')task=manager.recover(message.email);else if(message.type==='BAA_RESEND_OTP')task=manager.resendOtp();else if(message.type==='BAA_RESET_PASSWORD')task=manager.resetPassword(message.password);else if(message.type==='BAA_VERIFY_OTP')task=manager.verifyOtp(message.email,message.token,message.purpose);else if(message.type==='BAA_SIGN_OUT')task=manager.signOut();else task=manager.sync().then(account=>({account}));task.then(callback).catch(error=>callback({error:error.message}));};`;
    const page = join(directory, "account.html");
    await writeFile(page, html.replace('<script src="../content/keybindings.js"></script>', `<script>${setup}</script><script>${keys}</script><script>${account}</script><script>${transport}</script>`).replace('<script src="settings.js"></script>', `<script>${settings}</script>`).replace('<script src="account.js"></script>', `<script>${ui}</script><script>(${browserChecks.toString()})();</script>`));
    const browser = spawnSync(chromePath, ["--headless", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--user-data-dir=" + join(directory, "profile"), "--virtual-time-budget=8000", "--dump-dom", pathToFileURL(page).href], { encoding: "utf8", timeout: 45000, maxBuffer: 2_000_000, windowsHide: true });
    assert.ifError(browser.error); assert.equal(browser.status, 0, browser.stderr.slice(-1200));
    const encoded = browser.stdout.match(/<pre id="test-result"[^>]*>([A-Za-z0-9+/=]+)<\/pre>/)?.[1];
    assert.ok(encoded, "Account UI checks did not finish");
    const report = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    assert.equal(report.ok, true, JSON.stringify(report));
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
});
