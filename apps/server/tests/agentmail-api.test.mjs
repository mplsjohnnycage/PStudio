import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentMailRoutes } from "../src/agentmail-api.ts";
import { createAgentMailClient } from "../src/agentmail-client.ts";

const INBOX_MISMATCH = /agentmail_inbox_mismatch/;

const url = "https://test.invalid/workspaces/ws-owner/agentmail";
const headers = { Authorization: "Bearer signed" };
const makeApp = (overrides = {}) => {
  const calls = { agenda: 0, events: 0, threads: 0 };
  const client = {
    createEvent(input) {
      calls.events += 1;
      return Promise.resolve({ eventId: "e2", ...input });
    },
    getAgenda() {
      calls.agenda += 1;
      return Promise.resolve([
        {
          endAt: "2026-11-15T12:30:00Z",
          eventId: "e1",
          startAt: "2026-11-15T12:00:00Z",
          status: "confirmed",
          timezone: "America/Chicago",
          title: "Call",
        },
      ]);
    },
    getThread(threadId) {
      return Promise.resolve([
        {
          from: "Sender <sender@example.com>",
          messageId: "m1",
          subject: threadId,
          text: "Plain text message",
          timestamp: "2026-11-14T12:00:00Z",
        },
      ]);
    },
    listThreads() {
      calls.threads += 1;
      return Promise.resolve([
        {
          labels: ["unread"],
          preview: "Reply",
          senders: ["test@example.com"],
          subject: "Hello",
          threadId: "t1",
          timestamp: "2026-11-14T12:00:00Z",
        },
      ]);
    },
  };
  const app = createAgentMailRoutes({
    assignedWorkspaceId: "ws-owner",
    authorize: async (user, ws) => user === "owner" && ws === "ws-owner",
    client,
    prospectExists: async (_user, _ws, prospectId) => prospectId === "p1",
    verify: async (header) =>
      header === headers.Authorization ? "owner" : null,
    ...overrides,
  });
  return { app, calls };
};

test("AgentMail is denied without verified owner authorization and fixed workspace binding", async () => {
  const { app, calls } = makeApp();
  assert.equal((await app.request(`${url}/threads`)).status, 401);
  assert.equal(
    (
      await app.request(`${url.replace("ws-owner", "other")}/threads`, {
        headers,
      })
    ).status,
    404
  );
  assert.equal(
    (
      await app.request(`${url}/threads`, {
        headers: { Authorization: "Bearer forged" },
      })
    ).status,
    401
  );
  assert.equal(
    (
      await makeApp({ authorize: async () => false }).app.request(
        `${url}/threads`,
        { headers }
      )
    ).status,
    404
  );
  assert.deepEqual(calls, { agenda: 0, events: 0, threads: 0 });
});

test("without configured inbox never returns another mailbox's content", async () => {
  const { app, calls } = makeApp({ assignedWorkspaceId: "", client: null });
  const r = await app.request(`${url}/threads`, { headers });
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: "integration_not_configured" });
  assert.equal(calls.threads, 0);
});

test("verified operator reads separate real threads and AgentMail calendar events", async () => {
  const { app, calls } = makeApp();
  const t = await app.request(`${url}/threads`, { headers });
  assert.equal(t.status, 200);
  assert.equal((await t.json()).threads[0].threadId, "t1");
  const a = await app.request(
    `${url}/agenda?after=2026-11-14T00:00:00Z&before=2026-12-14T00:00:00Z`,
    { headers }
  );
  assert.equal(a.status, 200);
  assert.equal((await a.json()).events[0].eventId, "e1");
  assert.deepEqual(calls, { agenda: 1, events: 0, threads: 1 });
});

test("authenticated Inbox opens a specific thread but rejects unsafe identifiers", async () => {
  const { app } = makeApp();
  const response = await app.request(`${url}/threads/thread_1`, { headers });
  assert.equal(response.status, 200);
  const { messages } = await response.json();
  assert.equal(messages[0].text, "Plain text message");
  assert.equal(
    (await app.request(`${url}/threads/bad.thread`, { headers })).status,
    400
  );
});

test("calendar rejects cross-workspace prospects and implicit invitation sending", async () => {
  const { app, calls } = makeApp();
  const input = {
    clientId: "a48d6065-781e-43a6-9a8b-215a75a9c111",
    end: "2026-11-16T10:30:00",
    prospectId: "p1",
    start: "2026-11-16T10:00:00",
    timezone: "America/Chicago",
  };
  const post = (data) =>
    app.request(`${url}/events`, {
      body: JSON.stringify(data),
      headers: { ...headers, "Content-Type": "application/json" },
      method: "POST",
    });
  assert.equal((await post({ ...input, prospectId: "not-ours" })).status, 404);
  assert.equal((await post({ ...input, sendInvites: true })).status, 400);
  assert.equal(
    (await post({ ...input, end: "2026-11-16T09:30:00" })).status,
    400
  );
  const r = await post(input);
  assert.equal(r.status, 201);
  assert.equal((await r.json()).event.eventId, "e2");
  assert.equal(calls.events, 1);
});

test("AgentMail client uses server-only bearer credential and never sends invites", async () => {
  const calls = [];
  const fakeFetch = (targetUrl, opts) => {
    calls.push({ opts, url: String(targetUrl) });
    return Promise.resolve({
      json: () =>
        Promise.resolve(
          targetUrl.toString().endsWith("/events")
            ? { event: { event_id: "event-1" } }
            : {
                threads: [
                  {
                    labels: [],
                    senders: ["contact@example.com"],
                    subject: "Reply",
                    thread_id: "t1",
                    timestamp: "2026-11-14T12:00:00Z",
                  },
                ],
              }
        ),
      ok: true,
    });
  };
  const client = createAgentMailClient({
    apiKey: "server-secret",
    fetchImpl: fakeFetch,
    inboxId: "pstudio@agentmail.to",
  });
  const threads = await client.listThreads();
  assert.equal(threads[0].threadId, "t1");
  await client.createEvent({
    clientId: "idempotent",
    end: "2026-11-16T10:30:00",
    prospectId: "p1",
    start: "2026-11-16T10:00:00",
    timezone: "America/Chicago",
    title: "Demo",
    workspaceId: "ws-owner",
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].opts.headers.Authorization, "Bearer server-secret");
  assert.equal(calls[1].opts.method, "POST");
  const eventBody = JSON.parse(calls[1].opts.body);
  assert.equal(eventBody.send_invites, false);
  assert.equal(eventBody.metadata.workspace_id, "ws-owner");
  assert.equal(eventBody.metadata.prospect_id, "p1");
  assert.equal(JSON.stringify(threads).includes("server-secret"), false);
});

test("AgentMail full-thread retrieval uses the provider's global route and confirms inbox ownership", async () => {
  const calls = [];
  const client = createAgentMailClient({
    apiKey: "server-secret",
    fetchImpl: (targetUrl) => {
      calls.push(String(targetUrl));
      return Promise.resolve({
        json: async () => ({
          inbox_id: "pstudio@agentmail.to",
          messages: [
            {
              from: "Client <client@example.com>",
              message_id: "msg-1",
              text: "Confirmed",
              timestamp: "2026-11-14T16:00:00Z",
            },
          ],
          thread_id: "thread-1",
        }),
        ok: true,
      });
    },
    inboxId: "pstudio@agentmail.to",
  });
  const messages = await client.getThread("thread-1");
  assert.deepEqual(calls, [
    "https://api.agentmail.to/v0/threads/thread-1?limit=50",
  ]);
  assert.equal(messages[0].text, "Confirmed");
});

test("AgentMail must not display a thread belonging to another inbox", async () => {
  const client = createAgentMailClient({
    apiKey: "server-secret",
    fetchImpl: async () => ({
      json: async () => ({
        inbox_id: "other-private@agentmail.to",
        messages: [
          {
            from: "Private",
            message_id: "msg-private",
            text: "private content",
          },
        ],
        thread_id: "thread-foreign",
      }),
      ok: true,
    }),
    inboxId: "pstudio@agentmail.to",
  });
  await assert.rejects(client.getThread("thread-foreign"), INBOX_MISMATCH);
});

test("AgentMail must not accept a thread result without inbox attribution", async () => {
  const client = createAgentMailClient({
    apiKey: "server-secret",
    fetchImpl: async () => ({
      json: async () => ({
        messages: [{ message_id: "m1", text: "unattributed" }],
      }),
      ok: true,
    }),
    inboxId: "pstudio@agentmail.to",
  });
  await assert.rejects(client.getThread("thread-1"), INBOX_MISMATCH);
});
