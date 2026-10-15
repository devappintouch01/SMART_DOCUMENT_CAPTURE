# 01: Scaffold, shared login and empty result list on Vercel

**What to build:** A signed-out visitor is sent to a Thai login page. After signing in with the shared credentials they see an empty result list. Behind it sits the Next.js app with Supabase wired in, the Document service with its AI reader and Store ports, fakes for both, and a Vitest harness, all deployable to Vercel. This lays the ground every later ticket builds on (spec: Platform, Modules, Auth; ADR 0002).

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Next.js (TypeScript) app runs locally and deploys to Vercel
- [x] Supabase project connected; a schema migration exists for the Document Type, Field and Document tables (shape per spec)
- [x] Document service exists with AI reader and Store ports; tests can use an in-memory Store fake and a scripted AI reader fake
- [x] Vitest runs a first test through the Document service (listing Documents returns an empty list)
- [x] Login checks `ADMIN_USERNAME` / `ADMIN_PASSWORD` from environment variables and sets a signed http-only session cookie
- [x] When the visitor is signed out, middleware sends every page and API route except login to the login page; sign-out works
- [x] Result list page renders an empty state in Thai
- [x] Required environment variables are documented
