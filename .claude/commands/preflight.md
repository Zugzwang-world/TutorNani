Check that the live keys work and have credit. Read keys from .env.local in the main TutorNani folder (values may be quoted: strip the quotes). Never print a key.

- Kimi: one tiny streaming call with KIMI_API_KEY to the model and base URL in `brain.providers.kimi` in content/demo.config.json, thinking off, max_tokens 1. Then `GET <baseUrl>/users/me/balance` for the remaining balance.
- ElevenLabs: `GET https://api.elevenlabs.io/v1/user/subscription` with ELEVENLABS_API_KEY, for characters used and the limit.
- Supabase: one tiny read, `GET <NEXT_PUBLIC_SUPABASE_URL>/rest/v1/agent_files?select=*&limit=1` with SUPABASE_SECRET_KEY as the `apikey` header. A 200 works. A 404 with code PGRST205 means the table is missing, so something is broken (the migrations in supabase/migrations create it); a 401 means the key is wrong. This call also keeps the Free project from pausing.
- Anthropic: skipped while `brain.provider` is "kimi" (DECISIONS.md). When it is "anthropic" again, make one call to claude-haiku-5-5 with max_tokens 1.

Report which work and the remaining credit where the API shows it. Put any problem in OPEN.md.
