# Tutor Grandma

A plush toy for Indian children aged 5 to 8. The child squeezes its paw and talks; it answers in grandma's cloned voice. A projector home base shows animals on the wall. A parent website gives guidance and a nightly summary.

Buildathon prototype.

- `apps/web`: Next.js parent website and the `/home-base` projector page
- `apps/relay`: audio relay (host decided in the product session)
- `firmware`: ESP32-S3 firmware, an ElatoAI fork (arrives later)
- `agent/templates`: the five agent files
- `content/demo.config.json`: all demo content
- `docs/thinking-partner`: NOW, OPEN and DECISIONS for the thinking partner

Run locally: `pnpm install`, then `pnpm dev`.
