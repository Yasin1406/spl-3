# Migrations

Run `001_user_preferences.sql`, then `002_preference_columns.sql`, in the Supabase SQL Editor. Migration 001 creates the account preferences table and its Row Level Security policies. Migration 002 copies existing JSON preferences into individual columns, validates values and shortcuts, then removes the JSON column. Both can be re-run; if 001 is already applied, run only 002. Invalid existing data causes 002 to roll back without dropping the JSON column. The extension's publishable key cannot apply migrations. See [account setup](../../docs/accounts.md).
