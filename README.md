# Title Proof V1

This Next.js app reads its approved Formula 1 dataset, anonymous selections, and complete calculation history from Convex. The browser keeps only a random anonymous identifier in an HTTP-only cookie. Convex stores its SHA-256 hash, not the cookie value.

## Local checks

Requires Node.js 20.9 or newer and a local Convex deployment configured in the ignored `.env.local` file. Generate two different random values of at least 32 characters. Put one in `CONVEX_SERVER_CREDENTIAL` and the other in `CONVEX_SEED_CREDENTIAL`, then set the same values in the matching Convex deployment with `npx convex env set`. Never use a `NEXT_PUBLIC_` name for either value.

```powershell
npm ci
npx convex dev
npm run convex:seed
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:e2e
npm run test:convex:security
npm run verify:deployment
```

The Playwright command starts the production Next server, uses the running local Convex backend when present, creates temporary test credentials when local values are absent, puts them in the local Convex process, seeds the approved dataset idempotently, and starts Convex itself when it is not running. No credential is written to source or browser code. No browser-storage or bundled-data fallback exists.

## Production handoff

These steps require the owner&apos;s accounts and have not been run:

1. Create or connect the Git repository. If the repository root is the parent folder, set Vercel&apos;s Root Directory to `v1`.
2. Create separate Convex preview and production deployments.
3. Create their deploy keys. Set the appropriate `CONVEX_DEPLOY_KEY` in each Vercel environment; never expose it with a `NEXT_PUBLIC_` name.
4. Generate a different `CONVEX_SERVER_CREDENTIAL` and `CONVEX_SEED_CREDENTIAL` for Preview and Production. Put each server credential in the matching Vercel environment and Convex deployment. Put each seed credential in the environment used to run the seed and in its Convex deployment. Never commit either value or expose it with a `NEXT_PUBLIC_` name.
5. Keep Vercel&apos;s build command from `vercel.json`: it deploys Convex functions, runs the Next build, and supplies `NEXT_PUBLIC_CONVEX_URL`.
6. Seed each Convex deployment with the approved frozen dataset by running `npm run convex:seed` while `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_SEED_CREDENTIAL` point to that deployment. Run it twice to confirm the second result reports no insertion.
7. Deploy a Vercel Preview and smoke-test `/`, `/api/state`, `/api/selection`, `/api/calculate`, and `/api/reopen`. Confirm direct Convex calls without the server credential fail, and confirm the `titleproof_anon` cookie is HTTP-only, `SameSite=Lax`, secure, and contains no user data.
8. Promote only after the Preview checks pass. Production deployment has not been performed from this workspace.
