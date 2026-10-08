# Database

Apply [001_user_preferences.sql](migrations/001_user_preferences.sql), followed by [002_preference_columns.sql](migrations/002_preference_columns.sql), in your Supabase project's SQL Editor. They create the preferences table and user-specific Row Level Security policies, then migrate preferences into separate typed columns, including one column per custom shortcut. See [account setup](../docs/accounts.md).

Planned database areas:

- Users.
- User preferences.
- Interaction events.
- Website profiles.
- Accessibility fixes.
- Feedback history.
