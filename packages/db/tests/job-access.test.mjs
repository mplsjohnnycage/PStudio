import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createDb } from "../src/index.ts";
import { buildAuthorizedJobsQuery } from "../src/job-queries.ts";

const PATTERNS = {
  destructive: /\bDROP\s+(?:TABLE|SCHEMA|DATABASE)\b/i,
  key: /PRIMARY KEY\("workspace_id","user_id"\)/,
  limit: /limit \$\d+/,
  membershipJoin: /join "workspace_memberships"/,
  role: /membership_role_ck/,
  table: /CREATE TABLE "workspace_memberships"/,
  userScope: /"workspace_memberships"\."user_id"/,
  workspaceFk:
    /FOREIGN KEY \("workspace_id"\) REFERENCES "public"\."workspaces"/,
  workspaceJoin:
    /"workspace_memberships"\."workspace_id"\s*=\s*"prospects"\."workspace_id"/,
  workspaceScope: /"prospects"\."workspace_id"/,
};

test("every jobs row is constrained by verified user membership and workspace", () => {
  const db = createDb({
    DATABASE_URL: "postgresql://x:y@localhost/unused",
  });
  const query = buildAuthorizedJobsQuery(
    db,
    "user-one",
    "workspace-one"
  ).toSQL();
  const normalized = query.sql.toLowerCase();
  assert.match(normalized, PATTERNS.membershipJoin);
  assert.match(normalized, PATTERNS.workspaceJoin);
  assert.match(normalized, PATTERNS.userScope);
  assert.match(normalized, PATTERNS.workspaceScope);
  assert.ok(query.params.includes("user-one"));
  assert.ok(query.params.includes("workspace-one"));
  assert.match(normalized, PATTERNS.limit);
});

test("additive membership migration creates ownership and role constraints", () => {
  const file = new URL(
    "../src/migrations/0001_lush_mister_sinister.sql",
    import.meta.url
  );
  const sql = readFileSync(file, "utf8");
  assert.match(sql, PATTERNS.table);
  assert.match(sql, PATTERNS.key);
  assert.match(sql, PATTERNS.role);
  assert.match(sql, PATTERNS.workspaceFk);
  assert.doesNotMatch(sql, PATTERNS.destructive);
});
