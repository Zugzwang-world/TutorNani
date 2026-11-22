# LOOKUPS · checked 2026-11-17 (scout, official docs) plus Coordinator tests

"Verified" = the Coordinator called the live API and it worked. "Confirmed" = stated in the official docs. "Unconfirmed" = best reading.

## 1. ElevenLabs speech-to-text (batch)
- `POST https://api.elevenlabs.io/v1/speech-to-text`, multipart. Fields: `model_id` (required), `file`, `language_code`, `secondary_language_codes`, `file_format`, `diarize`, `timestamps_granularity`, `keyterms`.
- **Model: `scribe_v3`** (newest batch). `scribe_v2` is the previous one; `scribe_v1` is deprecated.
- Formats: all major formats; `audio/webm` and `audio/opus` are listed. MediaRecorder `audio/webm;codecs=opus` is unconfirmed but expected to work; test it.
- Hindi: `hin` (ISO 639-3) or `hi`. Leaving `language_code` unset auto-detects. Hindi plus English: `language_code=hin` with `secondary_language_codes=eng` (field exists; semantics unconfirmed). If it misbehaves, leave both unset.
- Faster option: `file_format=pcm_s16le_16` for raw 16 kHz mono PCM. Realtime models (`scribe_v3_live`, WebSocket) exist but are out of scope tonight.
- Links: https://elevenlabs.io/docs/api-reference/speech-to-text/convert · https://elevenlabs.io/docs/overview/models

## 2. ElevenLabs text-to-speech
- **Live: `eleven_v4_turbo`.** Pre-made lines: **`eleven_v4`**. Both support Hindi. Confirmed, and `GET /v1/models` lists both (verified).
- **Verified:** `POST /v1/text-to-speech/{voice_id}/stream?output_format=mp3_44100_64` with `{"text","model_id":"eleven_v4_turbo","language_code":"hi"}` works with Nani's voice. Warm first byte is about 0.17 s; the first call after idle took about 2.6 s.
- Output formats: `mp3_22050_32`, `mp3_24000_48`, `mp3_44100_32/64/96/128/192`, `pcm_16000…48000`, `opus_48000_*`, `ulaw_8000`.
- `optimize_streaming_latency` is deprecated; do not use it. The Text-to-Dialogue WebSocket is not used tonight: HTTP stream is enough.
- Links: https://elevenlabs.io/docs/api-reference/text-to-speech/stream

## 3. ElevenLabs sound effects
- `POST https://api.elevenlabs.io/v1/sound-generation`. Body: `text`, `duration_seconds` (0.5–30), `prompt_influence` (0–1, default 0.3), **`model_id: "eleven_text_to_sound_v3"`** (pass it explicitly; v2 is deprecated), `loop`. `output_format` is a query param (default `mp3_44100_128`). Confirmed.
- Link: https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert

## 4. ElevenLabs music
- `POST https://api.elevenlabs.io/v1/music`, JSON. **`model_id: "music_v2_5"`** (pass it explicitly; v1 is deprecated).
- Either `prompt` (with `music_length_ms` 3000–600000) or `composition_plan`, not both. Lyrics with v2/v2.5: `composition_plan.chunks[].text`, with an optional `[Section]` at the start and `{directions}` inline; 30 lines per section, 200 characters per line. Unconfirmed: whether `prompt` can carry lyrics directly. Try `prompt` with the lyrics embedded first, then `composition_plan`.
- `output_format` query, default `auto` (mp3_48000_192). Confirmed.
- Link: https://elevenlabs.io/docs/api-reference/music/compose

## 5. ElevenLabs voices
- List: `GET /v2/voices` (`search`, `gender`, `age`, `language`, `page_size` ≤ 100). Shared library: `GET /v1/shared-voices` (`search`, `gender`, `age`, `language`, `use_cases`, `page_size`, `page`). Add: `POST /v1/voices/add/{public_owner_id}/{voice_id}` with `{"new_name"}`. All verified.
- **Chosen:** Nani `wSMP2ehaozb5I36yi8vg` ("Dulari Didi, Gentle Old Aunty", Hindi, old, female). Test voices: adult female `xoV6iGVuOGYHLWjXhVC7` (Muskaan), adult male `bpkHhw4QrZFYIfahwsHh` (Amit Bhawani), child `5krdMTA5HonvWAlY2vSx` (Bholu). All in `content/demo.config.json`.

## 6. Kimi (Moonshot)
- `POST https://api.moonshot.ai/v1/chat/completions`, OpenAI-style. Verified.
- Thinking off: `"thinking": {"type": "disabled"}` (k2.6 defaults to on). Confirmed and verified.
- **Temperature is fixed for k2.6: 0.6 with thinking off** (1.0 with it on); top_p fixed at 0.95. Any other value errors. **Send 0.6 or omit it.** This overrides the plan's "about 0.7".
- Streaming: SSE `data: {...}` lines, `choices[].delta.content`, ending `data: [DONE]`. A `reasoning_content` delta may appear; ignore it.
- JSON mode: `response_format: {"type":"json_object"}`. Describe the fields and give an example in the prompt; say "Reply only with JSON". Objects only. Check `finish_reason == "length"`.
- Note: k2.6 is closed to new accounts and expected to retire in late December 2026. Our account has access.
- Links: https://platform.kimi.ai/docs/api/chat · https://platform.kimi.ai/docs/guide/use-json-mode-feature-of-kimi-api.md

## 7. Supabase Realtime (supabase-js 2.119)
- postgres_changes: `sb.channel('x').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'child_id=eq.aarav' }, cb).subscribe()`. Tables `messages`, `agent_files`, `turns` and `demo_state` are in the `supabase_realtime` publication, RLS is off, and anon has SELECT.
- Broadcast in the browser: `ch.on('broadcast', { event }, cb).subscribe()`; `ch.send({ type: 'broadcast', event, payload })`.
- Broadcast from the server: `POST {SUPABASE_URL}/realtime/v1/api/broadcast` with body `{"messages":[{"topic","event","payload"}]}` and the `apikey` header (secret key). Use `lib/broadcast.ts`.
- Keys: `sb_publishable_…` in the browser, `sb_secret_…` on the server, both in the `apikey` header, not as a Bearer token.
- Links: https://supabase.com/docs/guides/realtime/postgres-changes · https://supabase.com/docs/guides/realtime/broadcast
