import assert from "node:assert/strict";
import { test } from "node:test";
import {
  selectAccessibleWorkspace,
  workspaceCreationAllowed,
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
