-- Run after 001_user_preferences.sql. Existing preferences are migrated before
-- the old JSON column is removed. The transaction rolls back on invalid data.
begin;

alter table public.user_preferences add column if not exists assistant_enabled boolean not null default true;
alter table public.user_preferences add column if not exists noise_reduction_enabled boolean not null default false;
alter table public.user_preferences add column if not exists form_guidance_enabled boolean not null default true;
alter table public.user_preferences add column if not exists translation_enabled boolean not null default false;
alter table public.user_preferences add column if not exists translation_verbosity text not null default 'balanced';
alter table public.user_preferences add column if not exists image_shortcut_guidance_enabled boolean not null default true;
alter table public.user_preferences add column if not exists ai_translation_enabled boolean not null default true;
alter table public.user_preferences add column if not exists ai_summary_enabled boolean not null default true;
alter table public.user_preferences add column if not exists summary_detail text not null default 'standard';
alter table public.user_preferences add column if not exists shortcut_navigator text;
alter table public.user_preferences add column if not exists shortcut_voice text;
alter table public.user_preferences add column if not exists shortcut_page_summary text;
alter table public.user_preferences add column if not exists shortcut_region_summary text;
alter table public.user_preferences add column if not exists shortcut_image_ocr text;
alter table public.user_preferences add column if not exists shortcut_image_description text;

-- Skip the data conversion if the migration was already applied.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'user_preferences' and column_name = 'preferences') then
    execute $conversion$
      update public.user_preferences set
        assistant_enabled = coalesce((preferences ->> 'baaAssistantEnabled')::boolean, true),
        noise_reduction_enabled = coalesce((preferences ->> 'baaNoiseReductionEnabled')::boolean, false),
        form_guidance_enabled = coalesce((preferences ->> 'baaFormGuidanceEnabled')::boolean, true),
        translation_enabled = coalesce((preferences ->> 'baaTranslationEnabled')::boolean, false),
        translation_verbosity = coalesce((preferences ->> 'baaTranslationVerbosity')::text, 'balanced'),
        image_shortcut_guidance_enabled = coalesce((preferences ->> 'baaImageShortcutGuidanceEnabled')::boolean, true),
        ai_translation_enabled = coalesce((preferences ->> 'baaAiTranslationEnabled')::boolean, true),
        ai_summary_enabled = coalesce((preferences ->> 'baaAiSummaryEnabled')::boolean, true),
        summary_detail = coalesce((preferences ->> 'baaSummaryDetail')::text, 'standard'),
        shortcut_navigator = nullif(preferences -> 'baaCustomKeybindings' ->> 'navigator', ''),
        shortcut_voice = nullif(preferences -> 'baaCustomKeybindings' ->> 'voice', ''),
        shortcut_page_summary = nullif(preferences -> 'baaCustomKeybindings' ->> 'pageSummary', ''),
        shortcut_region_summary = nullif(preferences -> 'baaCustomKeybindings' ->> 'regionSummary', ''),
        shortcut_image_ocr = nullif(preferences -> 'baaCustomKeybindings' ->> 'imageOcr', ''),
        shortcut_image_description = nullif(preferences -> 'baaCustomKeybindings' ->> 'imageDescription', '');
    $conversion$;
  end if;
end;
$$;

alter table public.user_preferences drop constraint if exists valid_translation_verbosity;
alter table public.user_preferences add constraint valid_translation_verbosity check (translation_verbosity in ('concise','balanced','detailed'));
alter table public.user_preferences drop constraint if exists valid_summary_detail;
alter table public.user_preferences add constraint valid_summary_detail check (summary_detail in ('brief','standard','detailed'));

create or replace function public.valid_preference_shortcuts(bindings text[])
returns boolean language sql immutable set search_path = '' as $$
  select count(distinct binding) = cardinality(bindings)
    and bool_and(binding ~ '^Alt\+Shift\+[A-Z0-9]$' and binding not in ('Alt+Shift+B','Alt+Shift+T','Alt+Shift+I'))
  from unnest(bindings) as binding;
$$;

alter table public.user_preferences drop constraint if exists valid_shortcuts;
alter table public.user_preferences add constraint valid_shortcuts check (
  public.valid_preference_shortcuts(array[
    coalesce(shortcut_navigator, 'Alt+Shift+Z'),
    coalesce(shortcut_voice, 'Alt+Shift+V'),
    coalesce(shortcut_page_summary, 'Alt+Shift+A'),
    coalesce(shortcut_region_summary, 'Alt+Shift+S'),
    coalesce(shortcut_image_ocr, 'Alt+Shift+O'),
    coalesce(shortcut_image_description, 'Alt+Shift+D')
  ])
);

-- Grants and policies from migration 001 also cover the new columns.
alter table public.user_preferences drop column if exists preferences;
notify pgrst, 'reload schema';
commit;

