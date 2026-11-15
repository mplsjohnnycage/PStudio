import assert from "node:assert/strict";
import { test } from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Node tsx uses classic JSX lowering; Next.js supplies React automatically.
globalThis.React = React;
const { AgentMailInbox } = await import(
  "../src/components/agentmail-inbox.tsx"
);
const { AgentMailCalendar } = await import(
  "../src/components/agentmail-calendar.tsx"
);
const props = {
  request: async () => ({ events: [], threads: [] }),
  workspaceId: "ws_owner",
};

test("Inbox shows actual provider labeling and does not expose an unaudited Send action", () => {
  const html = renderToStaticMarkup(createElement(AgentMailInbox, props));
  assert.ok(html.includes("AGENTMAIL"));
  assert.ok(html.includes("Actual") || html.includes("Real email threads"));
  assert.ok(html.includes("Automatic sends"));
  assert.equal(html.includes("Send message"), false);
});

test("Calendar provides an explicit internal hold with no invitation sends", () => {
  const html = renderToStaticMarkup(
    createElement(AgentMailCalendar, {
      ...props,
      prospects: [{ id: "p1", name: "Sample Prospect" }],
    })
  );
  assert.ok(html.includes("AGENTMAIL CALENDAR"));
  assert.ok(html.includes("Plan call (no invitation)"));
  assert.ok(html.includes("Sample Prospect"));
  assert.ok(html.includes("External invitations require explicit approval"));
});
