# Rivet integration and release gate

**Target:** standalone Prospect Studio on Sprite `prospect-studio-foundation`, public repo `mplsjohnnycage/PStudio`. The original Convex-backed Prospect Studio is not modified.

## Implemented

- `apps/worker`: `rivetkit@3.1.1` and `@rivet-dev/workflows@1.1.1`, pinned in the lockfile.
- `src/registry.ts`: a keyed Rivet workflow per `[workspaceId, jobId]`. It consumes `commands` queue messages via a recorded workflow step. The worker does not execute jobs or make external calls yet.
- `src/transitions.ts`: deterministic job state machine supporting deduplicated submissions, explicit approval gate, start, bounded retries (max 20), attempt-matched completion (rejecting stale retry results), failure, cancellation, and terminal-state immutability.
- `src/index.ts`: **fail-closed** process entry. The worker cannot start without an explicit local-dev opt-in, and refuses to start in production until a scoped-authenticated private control plane has been configured.

## Responsibility boundaries

- **Neon `jobs`** is intended as the authoritative business/job record; Rivet is the durable actor execution and command coordination state. A verified outbox and reconciliation bridge is NOT implemented.
- **No client/browser may connect directly to the Rivet control plane.** Future Hono job routes must authenticate the user against Neon Auth, authorize the workspace and prospect, and authorize the requested job action before sending a typed Rivet command. The actor key is *not* an authorization mechanism.
- Human approval must be a verified Neon `approvals` record and an authorized server operation. A queue message alone is not proof of approval.
- No customer outreach, crawl, publishing, paid inference, or external workflow side effect exists in this worker.

## Verification

- `npm run test`: 16 API/database tests + 4 Rivet state-machine unit tests pass.
- `npm run check-types`: includes Rivet worker.
- `npm run build`: compiles Rivet worker and existing app.
- `npm run test:integration -w @prospect-studio/worker`: real `rivetkit/test` registry workflow test, including stale-attempt rejection during a retry. **One successful end-to-end local run was observed after an orphaned test-owned `rivet-services` process was cleared. Further runs intermittently fail with registry 503 `starting` during local control-plane bootstrap.** Do not mark Rivet as production-ready until this is reproducible in isolated CI and a real controlled restart test succeeds.

## Next required integration

1. Stabilize Rivet local test startup and run a separate CI integration job; reproduce actor state across process restart and replay.
2. Deploy a private Rivet control plane/worker (Fly Machines or managed Rivet only after actual cost and credentials are approved). Do not expose unsafe SDK routes.
3. Implement an authenticated Hono-to-Rivet bridge with Neon-backed outbox, idempotency, reconciliation and retry scheduling. Add isolation/approval-negation tests with real JWTs.
4. Verify jobs and approvals in isolated Neon branch and live browser/API, with zero unapproved external side effects.
5. Capture recovery and observability evidence before production release.

See `docs/NEON-SETUP-STATUS.md` for the separate database/service blockers.
