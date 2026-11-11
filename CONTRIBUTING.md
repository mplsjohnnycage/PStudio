# Contributing

Use Node 24.22.1 and npm 12.0.2. Install from the committed lockfile with `npm ci`. Run `npm run check`, `npm run check-types`, and `npm run build`; capture the outputs and disclose failures. The scaffold currently has no automated test script; add meaningful tests alongside behavior, and include them in CI when introduced.

Keep changes focused, review generated files and migrations, and use throwaway credentials and isolated nonproduction resources for integration tests. Never commit secrets, customer data, or raw session histories. Before changing environment or service configuration, inspect and back up the existing configuration.

For changes requiring private systems, database writes, customer outreach, or publishing, follow the repository owner’s authorization and review rules. CI must not send messages, deploy, or use production credentials.
