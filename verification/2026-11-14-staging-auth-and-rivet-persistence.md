# Prospect Studio — Staging operator identity and Rivet persistence follow-up

**2026-11-14 UTC.** PR #12 (`feat/rivet-neon-discovery`). These checks do not authorize production deployment.

## Completed actor state survives staging worker restart

Following the staging-only Rivet worker and outbox-dispatcher restart, a read-only probe queried the **existing**, pre-restart, remote Rivet `default` namespace job gate:

- Workspace `workspace_f5416f86-c00f-4162-82b1-2a1d89c1f284`.
- Job `job_79311400206f9c8dffc309d4435d9e10a2a7cfd210c02de904642657411d791c`.
- Remote response: `phase=completed`, `attempt=1`, and matching job ID.
- Run from the isolated staging Sprite by `apps/worker/scripts/verify-staging-rivet-state.mjs`, requiring explicit `PSTUDIO_VERIFY_STAGING_RIVET=1`, exact Rivet staging endpoint and `default` namespace, private Rivet control-plane token file, and known workspace/job IDs. No token is printed. Script is **read-only**; no job resubmission.

**Scope of proof:** completed actor-state readback after worker restart. This does NOT prove that an *in-flight* job can resume without reprocessing or duplicate completion.

A separate *new* Overture job was also completed through restarted services, job `job_5f53da71e3ccb17a169710cd9b90fb1c22a98b83cdcf7bd1cfa935f6de14cdce` (one attempt, two evidence rows, delivered outbox, one pending review). Independent Neon readback confirmed it.

## Staging operator-auth gap and remediation

Read-only Neon staging inspection found **one real Neon Auth-matched workspace owner, emailVerified=false**; all staging `operator` memberships were isolated service fixtures with no Neon Auth match. No authenticated human sign-in, token consent, or operator-run Overture discovery is claimed.

The private Overture CLI previously trusted `DISCOVERY_OPERATOR_USER_ID` from environment configuration. The staging-only manual CLI now **rejects that override** and instead requires:

1. `OVERTURE_DISCOVERY_ENABLED=1`, `PSTUDIO_STAGING_ONLY=1`, and the scoped staging-only worker database connection.
2. `DISCOVERY_OPERATOR_TOKEN_FILE` pointing to an absolute, real, process-owner-owned, owner-only (no group/other permission bits) JWT file outside the CLI's sourced environment. Symlinks are rejected.
3. Neon Auth issuer and JWKS configuration; the existing `createNeonTokenVerifier` performs EdDSA signature, issuer, audience, expiration, and subject verification.
4. The verified token `sub` is passed into the existing transactional workspace-membership checks in admission and enqueue. No user ID or workspace claim is accepted from the token to bypass database scope.

Unit tests cover valid dependency-injected verifier result, staging-only gate, permission refusal, and rejected JWT. These are **logic tests**, not proof of a real verified operator session. Do not create or alter Neon Auth users to simulate one.

## Release blockers

Staging user must finish email verification and a real signed-in flow before this can be called an authenticated acceptance test; actual owner action and consent cannot be impersonated. In-flight Rivet restart/replay behavior, full source-refresh strategy, autonomous scheduler and production deployment remain unproved/unapproved. Neon staging branch `validation-20261111` expires 2026-11-18 UTC.
