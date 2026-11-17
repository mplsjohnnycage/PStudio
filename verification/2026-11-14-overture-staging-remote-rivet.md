# Prospect Studio — Live Overture → Neon staging → remote Rivet verification

**UTC date:** 2026-11-14. **Result:** PASS for isolated remote-Rivet staging discovery; NOT a production deployment or authenticated-user acceptance test.

## System boundaries

- Base: `main` merge `422d419` (PR #11), isolated integration worktree `feat/rivet-neon-discovery` (original slice `ac8d807`).
- Staging Neon project `PS` (`morning-surf-12386530`), branch `validation-20261111` (`br-fancy-shadow-bekwm85g`); scoped staging worker database credentials, held outside Git. Production branch `br-steep-surf-bek7urvd` was **not targeted**.
- Remote Rivet Cloud control plane `https://pstudio9jo8-api.onrivet.dev`, staging namespace `default`, with staging worker version `4` running as a Sprite service. Separate production namespace `production` and its services were **not changed**.
- Staging service launch scripts were backed up outside Git in `.pstudio-private/staging-rollbacks`, changed to load `/home/sprite/pstudio-discovery-real`, and restarted. Both the staging Rivet node and the staging outbox dispatcher reported running after the change.
- Test fixture created its own staging workspace and a service-test operator membership. **This identity is not a real verified Neon Auth user and does not establish browser or OAuth authentication.** No owner approval, publication, outreach, or spend occurred.

## Failure reproduced and repaired

1. Initial live test failed with `Overture source unavailable` under Rivet's isolated `HOME`; Python user-site DuckDB packages and the cached `httpfs` extension were inaccessible. Python child now receives the OS account home rather than the temporary Rivet actor-lock home. No worker database secrets are forwarded to the Python process.
2. A subsequent attempt found `claimed=0` because an already-running staging dispatcher had claimed the outbox item. Independent Neon readback showed the older staging node exhausted three attempts with error `unsupported_provider`; the outbox was delivered but the job failed. The running node was pointed at the new Overture-capable code and restarted at Rivet node version 4. The old failed job remains a recorded staging failure; it is not claimed as a pass.
3. Added regression handling so re-admitting the same external identity does not count or enqueue a new job with potentially stale source evidence; source refresh across Overture releases remains a separate unimplemented capability.

## Successful real staging evidence

Opt-in command (private staging Sprite, secret file path omitted):

```sh
PSTUDIO_STAGING_OVERTURE_RIVET_E2E=1 \
PSTUDIO_NEON_STAGING_WORKER_ENV_PATH=<private-staging-only-worker-env> \
npm run test:staging-neon -w @prospect-studio/worker
```

**1/1 live integration test passed.** The test requested a bounded one-record Minneapolis-area plumbing Overture GeoParquet result through DuckDB/Python, called the actual source admission and transactional outbox, then observed the existing remote staging dispatcher and Rivet Cloud-connected worker complete the job. It read stored evidence, generated a SHA-256-verified private HTML artifact, and opened a **pending** review.

- Overture external ID: `8348e62a-ac73-4468-9b3b-46c0fd327624`.
- Staging workspace: `workspace_92c3ddb7-86ae-4e5c-8ff6-f6e4e858f2c2`.
- Prospect: `prospect_9c765ba9-44e1-45cc-8685-00e79e2d8416`.
- Job: `job_b4a2483c1ea7f839e5aec867ffc9cbd9ceef8959afb53727a924fb1ebb21852c`.
- Neon outbox state `delivered`; job state `completed`; exactly one completed worker attempt, 2 source/enrichment evidence rows, 2 durable artifacts, 1 pending approval.
- Explicit private preview: `preview_3fd5d825-234a-4b5a-aa1d-023500785996`.
- Private artifact SHA-256: `c0861fd09de30dd7100336f8ec3d9fc2573b7c39ca711dde20516e30401776d5`.
- Test log: `/tmp/pstudio-overture-stage-remote-v3.log` (Sprite local; contains no database URL).
- An independent **Neon connector readback after test completion** confirmed all job/outbox/evidence/artifact/review counts and states. Website data was kept unknown rather than inferred absent or verified.

## Remaining release gates

- A verified Neon Auth user with operator/owner workspace membership must perform the real private intake; no staging workspace memberships currently join verified auth users (read-only count was 0).
- A second acceptance test must prove an authenticated browser/operator request through the application API, not an isolated service principal.
- The auto-scheduled market loop, website-independent verification, broader website/browser auditing, source refresh, and policy-controlled owner approval workflow have **not** been proved by this slice.
- Restart/replay durability of the Rivet actor across a worker failure is not established by this test; a remote control plane was used, but full disaster recovery was not exercised.
- Do not promote to production, run autonomous discovery against production data, or grant owner approval without explicit authorization and remaining gate verification. The staging Neon branch expires on 2026-11-18 UTC.

## Final post-fix verification

After the duplicate-admission refactor, a **second independent live remote staging run passed (1/1)**. Job `job_79311400206f9c8dffc309d4435d9e10a2a7cfd210c02de904642657411d791c` completed in one attempt; the outbox is `delivered`, with 2 evidence records and 1 pending review. Private preview `preview_b89cb76b-b658-477e-b2af-e4456be8e6be` has SHA-256 artifact hash `aa12464903986d26728a7a093d2f62c5f7ebef7e4029cf283dd59b3e6ddf4de6`. Independent Neon connector readback confirmed final job, attempt, outbox, evidence, and review state. Log: `/tmp/pstudio-overture-stage-remote-final.log`.

Final local verification after the code edits: `npm run check` **pass**; `npm run check-types` **pass**; `npm test` **27/27 pass** (7 worker test files); production-style `npm run build` **6/6 Turborepo tasks pass**, when the existing public server URL is supplied to the otherwise isolated Git worktree. The default worker unit tests and explicit staging E2E use separate test gates. No production app deployment was performed.
