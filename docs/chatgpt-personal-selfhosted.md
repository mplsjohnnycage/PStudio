# Prospect Studio — personal Sign in with ChatGPT (Pi Durable + Rivet)

**Scope:** Open-source **personal** installation on a self-hosted Sprite VM, for a single Neon-authenticated owner. This is not a multi-tenant sign-in service, paid app, or an authorization to sell ChatGPT plan access. Provider eligibility and the user's actual consent are separate from infrastructure readiness.

Official references: [OpenAI OSS sign-in](https://developers.openai.com/siwc/token-sharing-open-source), [self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms), [Rivet's Pi sign-in guide](https://rivet.dev/guides/sign-in-with-chatgpt/), [OpenAI UI guidelines](https://developers.openai.com/siwc/ui-ux-guidelines).

## Architecture (implemented)

`Next.js StudioAgent` -> Neon JWT-authenticated `createNeonApi` routes -> `createPrivateAgentBroker` -> private Rivet HTTPS control plane -> per-owner `chatgptLogin` and `credentials` actors -> `operatorAgent` (Pi Durable; per owner + workspace). All operator tools use bounded, workspace-scoped DB operations; Neon retains evidence and job state. The agent's model credential comes from the per-owner credentials actor, not an OpenAI API key. User authorization and workspace membership are checked before broker calls.

- `chatgptLogin.start()` starts the OAuth flow; `finish()` consumes the pasted local loopback redirect *inside the authenticated app*, never chat, logs or an external URL. The OAuth operation is tied to a 10-minute timeout.
- `credentials` saves and refreshes provider auth within Rivet actor state and returns an access token **without** the refresh token to Pi. Every list/read/save/refresh operation checks the configured owner ID, not only HTTP routing.
- `operatorAgent` is bound to `[NeonUserId, workspaceId]` and uses `@rivet-dev/pi` with `@earendil-works/pi-durable` and the existing operator tool catalog. The worker denies plan access to anyone other than the configured personal owner.
- The React client renders `Continue with ChatGPT` only when the authenticated broker advertises owner-specific eligibility; after connection it labels `Using ChatGPT plan` and links to ChatGPT usage settings.
- `RIVET_TOKEN`, OAuth codes, access tokens and refresh tokens never belong in Next.js `NEXT_PUBLIC_*`, Git, screenshots or ChatGPT messages.

## Private deployment variables

Configure the **server-side API broker and private Rivet worker** with consistent settings:

```dotenv
PSTUDIO_CHATGPT_PERSONAL_SELF_HOSTED=1
PSTUDIO_CHATGPT_PLAN_ENABLED=1
PSTUDIO_CHATGPT_OWNER_USER_ID=<exact authenticated Neon subject>
CHATGPT_HOST_ID=urn:uuid:<stable-per-VM-UUIDv4>
```

Use the identical stable host ID on the broker and worker across restarts and deploys; do not generate a new one at every build. The host ID is not a secret. Set `RIVET_OPERATOR_AGENT_ENABLED=1`, a private HTTPS `RIVET_ENDPOINT`, a server-side scoped `RIVET_TOKEN`, the expected namespace, and server-side DB credentials on the backend. The API must also have Neon Auth issuer/JWKS configuration. The owner must be an actual Neon Auth user with current owner/operator membership; never impersonate an account or flip email verification flags just to make a test pass.

The separate `PSTUDIO_CHATGPT_HOSTED_APPROVED=1` mode is retained for separately authorized commercial/public hosting but is **not required for personal self-hosted mode**. Changing one environment flag alone is not evidence of provider authorization; OpenAI's real OAuth result and granted `chatgpt.tokens.use.direct` permission determine whether plan-backed requests are possible.

## Verification and remaining human step

Run `npm run check`, `npm run check-types`, `npm test` and a production-style build. Use the authenticated staging UI to start sign-in and complete real consent. For a remote VM the loopback redirect reaches the browser device; Rivet documents a paste-redirect step, while OpenAI also documents completing OAuth locally and securely transferring protected credentials to a self-hosted VM. Never paste OAuth callback URLs or protected credential files into a general-purpose chat, issue tracker or logs. Test one authenticated agent prompt and a durable actor restart after consent.

A successful Neon staging enrichment job does not prove OpenAI login, model inference, OAuth rotation, billing/plan eligibility, or consent. Do not claim that the system is fully live until a real owner session, consent, first response and token refresh have been observed. Existing staging Neon owner email verification is pending; no verification status should be changed by the deploy process.
