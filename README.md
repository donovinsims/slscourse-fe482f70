# SLS

## Supabase Key Contract

This repo currently uses a temporary mixed Supabase key model.

- Browser code uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- In this repo's current hosted setup, that browser env still needs to hold the legacy anon JWT-style public key until Edge Function auth is refactored.
- Hosted Edge Functions still rely on Supabase's legacy-compatible JWT verification path.
- Privileged function code prefers `SB_SERVICE_KEY` and falls back to `SUPABASE_SERVICE_ROLE_KEY` only for compatibility.
- User-scoped function verification uses `SUPABASE_ANON_KEY`.

Do not put `sb_secret_...` keys in frontend env vars, browser bundles, or Vercel public env vars.
Do not switch this repo's frontend straight to `sb_publishable_...` while hosted Edge Functions still depend on legacy JWT verification.

## Current Constraint

The new Supabase publishable/secret key model is not fully adopted here yet.

- Edge Functions are still wired for legacy-compatible JWT verification behavior.
- Live verification currently shows `sb_publishable_...` does not satisfy the existing function gateway expectations for this project.
- Do not rotate this repo to a secret-only assumption without an auth refactor.
- If a secret key is exposed, rotate it in Supabase immediately and replace only server-side references.

## Local Setup

Copy `.env.example` to `.env` for a clean local browser client configuration, then provide:

- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
