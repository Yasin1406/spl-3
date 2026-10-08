import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

const environment = parseEnv(await readFile(new URL("../../backend/.env", import.meta.url), "utf8"));
const project = new URL(environment.SUPABASE_URL || "");
if (project.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(project.hostname)) throw new Error("Set your HTTPS Supabase project URL in backend/.env.");
const key = environment.SUPABASE_PUBLISHABLE_KEY || "";
if (!key.startsWith("sb_publishable_")) throw new Error("Set a Supabase publishable key in backend/.env.");
const headers = { apikey: key };
try {
  const auth = await fetch(`${project.origin}/auth/v1/settings`, { headers, signal: AbortSignal.timeout(15000) });
  const settings = await auth.json();
  console.log(`Supabase Auth reachable: ${auth.ok}; email sign-in enabled: ${settings.external?.email === true}`);
  console.log(`Signup email confirmation required: ${settings.mailer_autoconfirm === false}`);
  const table = await fetch(`${project.origin}/rest/v1/user_preferences?select=user_id,assistant_enabled,summary_detail,shortcut_navigator&limit=0`, { headers, signal: AbortSignal.timeout(15000) });
  const result = await table.json().catch(() => ({}));
  if (result.code === "PGRST205" || result.code === "42P01") console.log("Preferences table: missing. Apply database/migrations/001_user_preferences.sql in Supabase SQL Editor.");
  else if (["PGRST204", "42703"].includes(result.code)) console.log("Preference columns: missing. Apply database/migrations/002_preference_columns.sql in Supabase SQL Editor.");
  else if (!table.ok && result.code === "42501") console.log("Preferences table: present; guest access denied as expected. Signed-in RLS still needs verification.");
  else if (table.ok) { console.log("Preferences table: accessible to guests. Apply the migration to restrict access."); process.exitCode = 1; }
  else { console.log(`Preferences table: check inconclusive (HTTP ${table.status}).`); process.exitCode = 1; }
  if (!auth.ok) process.exitCode = 1;
} catch { console.error("Could not reach Supabase. Check network access and project configuration."); process.exitCode = 1; }
