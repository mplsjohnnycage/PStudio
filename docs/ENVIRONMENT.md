# Environment

The main Sprite hosts this development repository and the initial application/runtime. Its URL must remain private while authentication and public preview boundaries are unfinished. Sprite services restart on wake; verify actual lifecycle, scheduling and recovery before relying on them.

This file is a project-owned environment contract, not a Sprite-specific standard. Record pinned tool versions, services, ports, connectivity and health probes when implemented. Node and npm versions should match the project's package manager and CI.

The generated Varlock schemas in apps/web, apps/server and packages/db describe currently required scaffold variables. Planned integrations and proposed variables belong in the environment template and connector inventory; they are not proof of configured credentials. Never commit real credentials. Use isolated accounts and databases for tests.

Checkpoint before risky Sprite changes. Checkpoints do not back up external Neon or R2 data; independently back up and test restores. Do not publish or deploy without owner approval.
