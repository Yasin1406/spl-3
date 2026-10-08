# Email accounts and preference sync

The extension works immediately without an account. First-use defaults and guest changes stay in `chrome.storage.local`; guests never create Supabase Auth users or preference rows. Settings provides email/password sign-in, signup with email OTP confirmation, password recovery with email OTP, manual sync, and sign-out. Sessions persist so users do not need to sign in on every browser launch. The forms support password managers, showing passwords, and keyboard/screen-reader use. Passwords are sent only to Supabase Auth and are never saved in extension storage.

## Supabase setup

1. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `backend/.env`. Use `sb_publishable_...`; no secret key or database password is needed by the extension. A copied API endpoint URL is normalized to the project origin.
2. Open your Supabase project's SQL Editor and run [001_user_preferences.sql](../database/migrations/001_user_preferences.sql), then [002_preference_columns.sql](../database/migrations/002_preference_columns.sql). If 001 is already applied, run only 002. The publishable key cannot create tables or policies. Migration 001 creates one preference row per Auth user, enables RLS, denies guests, permits users to select/insert/update only their own rows, and timestamps updates. Migration 002 copies the existing JSON preferences into individual columns before removing the JSON column. Both can be re-run.
3. Enable email sign-in and new-user sign-ups. Configure custom SMTP using your Gmail address, `smtp.gmail.com`, port 465/SSL or 587/STARTTLS, and a Google App Password with spaces removed. SMTP credentials belong only in Supabase's Dashboard.
4. Keep email confirmation enabled. Include `{{ .Token }}` in both the **Confirm Signup** and **Reset Password** email templates so signup and recovery deliver numeric codes rather than links. Normal sign-in uses a password and sends no email. Set OTP expiration to 600 seconds if desired. Keep the resend cooldown at least 60 seconds. Supabase and Gmail sending limits apply separately.
5. From `extension`, run `npm.cmd run check:accounts` for a read-only connectivity/table-access check, then `npm.cmd run build`. Only the URL and publishable key are written into `dist/background/supabaseConfig.js`; `.env` and its other values are never copied. Rebuild after changing these two values.
6. Reload the unpacked `extension/dist` extension in Chrome, refresh existing pages, and open Settings. Create an account with email and password, then enter the signup code. Subsequent sign-ins use email and password. **Forgot password** requests a recovery code; verifying it opens the new-password form. Users created by the previous passwordless version can use this recovery flow once to set their password. Receiving an email alone does not authenticate; verification must succeed.

## Preference behavior

- A new account starts with the current guest preferences. An existing account loads its saved preferences, including custom keybindings. The local backend URL is device-specific and is never uploaded.
- Each synced preference has its own typed database column, and each of the six custom shortcuts has a separate nullable text column. Null shortcuts use their defaults. Database constraints validate preference enums and reject conflicting or reserved shortcuts.
- Settings saves and the popup's translation toggle go through the background worker. Invalid types and conflicting shortcuts are rejected before saving; remote preferences are validated before being applied.
- Signed-in preferences are cached locally for offline use. A failed upload retains a dirty account cache. Sync retries every five minutes, when the background worker starts, and via Settings. Unsaved edits in the Settings form are not synced.
- A successful explicit save replaces the remote preference snapshot. Across devices, the last successful save wins; no automatic per-field merge is attempted. A sync without pending local saves loads the current remote snapshot.
- Sign-out restores the separately retained guest preferences even without internet. Pending account changes remain cached under their user ID and are retried only after that same account signs in again. They are never uploaded as another user's preferences.
- Auth sessions persist across browser and worker restarts. Expiring tokens are refreshed before syncing. Revoked/expired refresh tokens require signing out locally and signing in with a password. If logout cannot reach Supabase, local tokens are removed but server revocation is not confirmed.
- Local storage is restricted to trusted extension contexts. Content scripts use filtered preference messages and never receive tokens. Account actions are accepted only from the extension's Settings and popup pages. Preferences, session tokens, and emails are not logged.
- If the preference table or new columns are missing, sign-in still works and settings remain local with a pending-sync message. Apply the migrations and retry sync.

## Acceptance checks

- Guest: change preferences, restart Chrome, confirm they persist locally and no Supabase row is created.
- New account: create an email/password account, verify the signup OTP, confirm guest preferences initialize the row, change settings and confirm individual columns update.
- Existing account: sign in on a second Chrome profile, confirm saved preferences and shortcut hints load. Test reset/default and conflicting shortcuts.
- Sign-out: confirm guest preferences return; changing them does not change the remote row.
- Offline: save account preferences, restart/reconnect and sync; also test signing out offline, making guest edits, and signing back into the same or a different account.
- Security: guest reads/writes fail; a signed-in user cannot select, insert, or update another user's row. Check that content scripts cannot read `chrome.storage.local` or invoke account actions.
- Test incorrect passwords, invalid/expired signup and recovery OTPs, resend limits, SMTP failure, token expiry, and NVDA focus/status announcements on the account forms. Confirm ordinary login sends no email and recovery requires a verified code before changing a password.

Implementation uses the [Supabase Auth REST API](https://github.com/supabase/auth/blob/master/openapi.yaml), [password authentication](https://supabase.com/docs/guides/auth/passwords), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), and [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
