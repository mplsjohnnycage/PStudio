import assert from "node:assert/strict";
import { test } from "node:test";
import {
  selectAccessibleWorkspace,
  selectScopedWorkspaceData,
  workspaceCreationAllowed,
  workspaceDataScope,
} from "../src/lib/workspace-selection.ts";

const workspaces = [
  { id: "workspace_owner", name: "Owner" },
  { id: "workspace_two", name: "Two" },
];

test("keeps a selected workspace if membership is still active", () => {
  assert.equal(
    selectAccessibleWorkspace(workspaces, "workspace_two", "workspace_owner"),
    "workspace_two"
  );
});

test("restores the user's saved workspace after a mobile page reload", () => {
  assert.equal(
    selectAccessibleWorkspace(workspaces, "", "workspace_two"),
    "workspace_two"
  );
});

test("auto-selects an accessible workspace when no preference exists", () => {
  assert.equal(
    selectAccessibleWorkspace(workspaces, "", ""),
    "workspace_owner"
  );
});

test("never trusts stale IDs from another account or revoked membership", () => {
  assert.equal(
    selectAccessibleWorkspace(
      workspaces,
      "workspace_revoked",
      "workspace_other_user"
    ),
    "workspace_owner"
  );
});

test("does not synthesize workspace IDs when the authenticated list is empty", () => {
  assert.equal(
    selectAccessibleWorkspace([], "workspace_other_user", "workspace_owner"),
    ""
  );
});

test("invite-only staging never offers a create-workspace action", () => {
  assert.equal(workspaceCreationAllowed("1"), false);
  assert.equal(workspaceCreationAllowed("0"), true);
  assert.equal(workspaceCreationAllowed(undefined), true);
});

test("workspace data requires the current user's verified membership", () => {
  const scope = workspaceDataScope(
    "owner",
    "owner",
    "workspace_owner",
    workspaces
  );
  assert.ok(scope);
  assert.equal(
    workspaceDataScope("other", "owner", "workspace_owner", workspaces),
    null
  );
  assert.equal(
    workspaceDataScope("owner", "owner", "revoked", workspaces),
    null
  );
  assert.equal(workspaceDataScope("owner", "owner", "", workspaces), null);
});

test("workspace changes hide previously loaded prospects and jobs before the next response", () => {
  const previous = workspaceDataScope(
    "owner",
    "owner",
    "workspace_owner",
    workspaces
  );
  const next = workspaceDataScope(
    "owner",
    "owner",
    "workspace_two",
    workspaces
  );
  const data = {
    jobs: ["old job"],
    prospects: ["old prospect"],
    scope: previous,
  };
  assert.equal(selectScopedWorkspaceData(data, previous), data);
  assert.equal(selectScopedWorkspaceData(data, next), null);
  assert.equal(selectScopedWorkspaceData(data, null), null);
  const differentUser = workspaceDataScope(
    "other",
    "other",
    "workspace_owner",
    workspaces
  );
  assert.equal(selectScopedWorkspaceData(data, differentUser), null);
});
