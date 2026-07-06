# FORGE — NexaPulse Asset Generator

Describe a vehicle, weapon, character, building, or prop in plain English (or speak it). Groq designs a rig-ready part hierarchy; Cloudflare Workers AI (FLUX.1-schnell) paints real textures onto it; Three.js renders it with PBR materials, image-based lighting, and bloom.

Both AI calls run through Cloudflare Pages Functions, so no API key ever ships to the browser or sits in this repo.

## Deploy (dashboard only — no CLI)

1. **Connect the repo:** Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick this repo. Leave build settings blank (static site, no build step) and deploy.
2. **Add your Groq key:** same project → Settings → Environment variables → Add variable → Name `GROQ_API_KEY` → Value: your `gsk_...` key → toggle **Encrypt** → Save.
3. **Enable texture generation:** same project → Settings → Bindings → Add → Workers AI → Variable name `AI` → Save.
4. Redeploy (Deployments tab → Retry deployment) so both take effect.
5. Open the deployed URL.

Without step 3, textures fall back to a procedural on-device look automatically — the app still works, just with simpler surfaces. Without step 2, generation will return a clear error telling you the key is missing.

## Files

- `index.html` — the app (Three.js scene, UI)
- `functions/api/spec.js` — Pages Function that calls Groq to turn a description into a rig-ready part hierarchy
- `functions/api/texture.js` — Pages Function that calls Workers AI FLUX to generate a surface texture
- Settings (gear icon, in-app) — optional external texture-endpoint override, low-power mode, voice narration toggle

## Known limits

- This builds one object at a time — a full city needs a separate layout-grid generation pass on top of this.
- Parts are a rig-*ready* hierarchy (named, nested, transform-correct), not a bone-weighted skinned skeleton. For character animation, export the shape and rig it in Mixamo, or that's the next layer to build.

## Changelog
- Object mode: describe any vehicle/weapon/character/prop, get a rig-ready part hierarchy with PBR materials
- Scene mode: describe a place, get a generated block (buildings, roads, props) — tap any building to regenerate it in full detail
- Groq and FLUX calls both run server-side via Pages Functions — no API keys ship to the browser or live in this repo

## Troubleshooting

**"Spec/Layout generation failed: 500" with an error mentioning GROQ_API_KEY**
The Pages Functions look for an environment variable named exactly `GROQ_API_KEY`. Check:
- Settings → Environment variables → the name is exactly `GROQ_API_KEY` (not `GROQ_KEY` or any variant)
- It's added under **Production** (Cloudflare separates Production and Preview variables)
- You've redeployed *after* adding/renaming it — existing deployments don't pick up new variables retroactively, only new ones do

**"Spec/Layout generation failed: 502"**
This one means the request reached Groq but Groq rejected it (bad key, rate limit, or a deprecated model name). Check the Functions real-time logs (project → Logs, or `wrangler pages deployment tail` if using the CLI) for the full Groq error text.
