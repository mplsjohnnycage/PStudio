# PStudio Eve / official ChatGPT plan provider — isolated proof

This package creates an Eve-compatible AI SDK model using the **official public OpenAI
Responses API** and the `chatgpt.tokens.use.direct` consent scope. It does **not**
use Rivet, the private Codex backend, or a project API key.

## Ownership and authorization

PStudio is a **single-owner, private application operated only by Johnny**.
The ChatGPT plan grant is for that owner alone. There is no customer tenancy,
user-to-user credential sharing, hosted model resale, or subscription pooling.
The existing Neon Auth and workspace membership checks remain in force;
being single-owner does not eliminate JWT verification or review gates.
Any future multi-user product requires an entirely separate authorization and
commercial eligibility assessment.

## Purpose

- Use inside a self-hosted Eve 1.0 agent on a Sprite, with Workflow PostgreSQL
  World using a separate Neon branch for durable state.
- Keep the owner-only model credential with a protected local host broker.
- Fail closed if subscription consent, credential ownership, or streaming support
  is missing.
- Preserve all PStudio review/approval/outreach gates and retain Rivet as default.

## Usage (only after an authorized broker is available)

```ts
import { defineAgent } from "eve";
import { createSiwcModel } from "@prospect-studio/siwc-provider";

export default defineAgent({
  model: createSiwcModel({
    modelId: "MODEL_RETURNED_BY_SIWC_DISCOVERY",
    ownerUserId: "VERIFIED_PSTUDIO_OWNER_USER_ID",
    credentialSource: {
      getCredential: ({ ownerUserId, forceRefresh, rejectedAccessToken }) =>
        trustedOwnerCredentialBroker.resolve({
          ownerUserId,
          forceRefresh,
          rejectedAccessToken,
        }),
    },
  }),
  modelOptions: { providerOptions: { openai: { store: false } } },
});
```

The snippet illustrates the credential-source interface only. PStudio now
has a concrete private **Rivet credentials Actor bridge** at
`apps/worker/src/eve-siwc-credential-source.ts`, and the
`createOwnerEveSiwcModel` factory at
`apps/worker/src/eve-siwc-model.ts`. The bridge reuses the existing
PStudio login and per-owner Rivet credentials Actor; it never returns a
refresh token or creates a separate OAuth login. The PStudio worker must
still have its private Rivet endpoint, token, verified Neon owner identity,
and host configuration. Do not load raw OAuth tokens from environment
variables, commit them, or send them to browsers. An agent cannot select
or change its credential principal.

**Native Rivet Eve / Workflow World integrations:** they exist but their
published versions are not currently compatible with Eve 1.0.0.
See `docs/rivet-eve-native-compatibility.md` for exact published
versions and proof. Keep Workflow Postgres World on an isolated Neon branch
until a compatible native Rivet World has been tested.

## Official sign-in setup

OpenAI's self-hosted VM guide requires **the owner** to complete SIWC OAuth
locally in a browser, grant **ChatGPT plan usage**, and securely transfer
the selected encrypted/protected credentials to the VM **without replacing the
VM's stable host ID**. The VM thereafter owns rotation. The provider intentionally
does not implement OAuth or read the protected file format; those belong to
an approved host credential broker.

No production token or owner authorization is present in this code. Until the
broker and the owner's consent are connected, inference fails closed.
No third-party DevKit OAuth implementation is vendored here. PStudio is
owner-operated and private; commercial distribution and multi-user eligibility
are explicitly out of scope.

## Transport limitations

SIWC HTTP Responses requires `stream: true`, `store: false`, complete
conversation context, and omission of unsupported fields. The provider enforces
these and rejects non-text system items. **Tool definitions are deliberately
disabled** until function namespaces or `additional_tools` items are
implemented and tested against an authorized account. This is a read-only,
text-inference proof; not a replacement for the PStudio job worker.

A real release requires: positive live model response, credential refresh,
restart recovery, Neon World persistence, an owner-approved authorization flow,
and negative authorization/outreach tests.

Official references:
- https://developers.openai.com/siwc/token-sharing-open-source/
- https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
