import assert from "node:assert/strict";
import { test } from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Node tsx uses classic JSX lowering; Next.js supplies React automatically.
globalThis.React = React;
const { StudioAgent } = await import("../src/components/studio-agent.tsx");

const props = {
  onNavigate: () => undefined,
  onOpenChange: () => undefined,
  onRefresh: () => Promise.resolve(),
  onSelectProspect: () => undefined,
  request: () =>
    Promise.resolve({
      available: true,
      chatgptConnected: false,
      planEnabled: false,
    }),
  workspaceId: "workspace_owner",
};

test("mobile Agent entry can control the same accessible desktop panel", () => {
  const closed = renderToStaticMarkup(
    createElement(StudioAgent, { ...props, open: false })
  );
  assert.equal(closed.includes('aria-expanded="false"'), true);
  assert.equal(closed.includes("<aside"), false);

  const opened = renderToStaticMarkup(
    createElement(StudioAgent, { ...props, open: true })
  );
  assert.equal(opened.includes('aria-expanded="true"'), true);
  assert.equal(opened.includes('id="studio-agent-panel"'), true);
  assert.equal(opened.includes('aria-label="Prospect Operator"'), true);
});
