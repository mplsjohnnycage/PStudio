import { z } from "zod";

/**
 * Canonical capability contract for dashboard and headless agents.
 * Every persisted action maps onto an existing tenant-checked API route.
 */
export const operatorTools = [
  {
    description: "List workspaces and member roles.",
    effect: "read",
    name: "list_workspaces",
  },
  {
    description: "Create an owned workspace (up to the per-user limit).",
    effect: "write",
    name: "create_workspace",
  },
  {
    description: "Read source-backed prospects.",
    effect: "read",
    name: "list_prospects",
  },
  {
    description: "Read durable enrichment jobs.",
    effect: "read",
    name: "list_jobs",
  },
  {
    description:
      "Admit an exact historical municipal license with source evidence, not proof of current licensure.",
    effect: "write",
    name: "discover_municipal_record",
  },
  {
    description: "Add a prospect from explicitly operator-reported facts.",
    effect: "write",
    name: "create_prospect",
  },
  {
    description: "Queue source-backed enrichment with an idempotency key.",
    effect: "write",
    name: "enqueue_enrichment",
  },
  {
    description: "Read private website concept version history.",
    effect: "read",
    name: "list_previews",
  },
  {
    description: "Read an authorized private website proposal.",
    effect: "read",
    name: "read_preview",
  },
  {
    description:
      "Build another immutable, private website proposal version; never publish.",
    effect: "write",
    name: "create_private_preview",
  },
  {
    description: "Request a human owner's review of a private proposal.",
    effect: "write",
    name: "request_review",
  },
  {
    description: "Read a recorded human review decision.",
    effect: "read",
    name: "read_review",
  },
  {
    description:
      "Only a human owner in the dashboard may approve or reject; the model may only request approval.",
    effect: "owner_confirmation",
    name: "decide_review",
  },
  {
    description:
      "Move the shared dashboard between Map, Calendar, Inbox and Studio.",
    effect: "navigation",
    name: "navigate",
  },
  {
    description: "Focus on a prospect in the shared dashboard.",
    effect: "navigation",
    name: "select_prospect",
  },
] as const;

export type OperatorToolName = (typeof operatorTools)[number]["name"];
const resource = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const workspace = z.strictObject({ workspaceId: resource });
const prospect = workspace.extend({ prospectId: resource });
const preview = workspace.extend({ previewId: resource });

export const operatorCommandSchema = z.discriminatedUnion("tool", [
  z.strictObject({
    input: z.strictObject({}),
    tool: z.literal("list_workspaces"),
  }),
  z.strictObject({
    input: z.strictObject({ name: z.string().trim().min(2).max(160) }),
    tool: z.literal("create_workspace"),
  }),
  z.strictObject({ input: workspace, tool: z.literal("list_prospects") }),
  z.strictObject({ input: workspace, tool: z.literal("list_jobs") }),
  z.strictObject({
    input: workspace.extend({
      externalId: z.string().min(2).max(200).optional(),
      query: z
        .string()
        .trim()
        .min(3)
        .max(80)
        .regex(/^[A-Za-z0-9][A-Za-z0-9 &.,-]{2,79}$/),
    }),
    tool: z.literal("discover_municipal_record"),
  }),
  z.strictObject({
    input: workspace.extend({
      name: z.string().trim().min(2).max(160),
      physicalAddress: z.string().trim().max(300).optional(),
      websiteUrl: z.url().startsWith("https://").max(2048).optional(),
    }),
    tool: z.literal("create_prospect"),
  }),
  z.strictObject({
    input: prospect.extend({
      idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/),
    }),
    tool: z.literal("enqueue_enrichment"),
  }),
  z.strictObject({ input: prospect, tool: z.literal("list_previews") }),
  z.strictObject({ input: preview, tool: z.literal("read_preview") }),
  z.strictObject({
    input: prospect,
    tool: z.literal("create_private_preview"),
  }),
  z.strictObject({ input: preview, tool: z.literal("request_review") }),
  z.strictObject({ input: preview, tool: z.literal("read_review") }),
  z.strictObject({
    input: preview.extend({ decision: z.enum(["approved", "rejected"]) }),
    tool: z.literal("decide_review"),
  }),
  z.strictObject({
    input: z.strictObject({
      view: z.enum(["map", "calendar", "inbox", "studio"]),
      workspaceId: resource.optional(),
    }),
    tool: z.literal("navigate"),
  }),
  z.strictObject({
    input: z.strictObject({
      prospectId: resource,
      workspaceId: resource.optional(),
    }),
    tool: z.literal("select_prospect"),
  }),
]);
export type OperatorCommand = z.infer<typeof operatorCommandSchema>;

export function operatorToolHttpRequest(request: OperatorCommand):
  | {
      path: string;
      method: "GET" | "POST";
      body?: object;
      headers?: Record<string, string>;
    }
  | { error: "client_navigation" | "owner_confirmation_required" } {
  const { tool, input } = request;
  if (tool === "navigate" || tool === "select_prospect") {
    return { error: "client_navigation" };
  }
  if (tool === "decide_review") {
    return { error: "owner_confirmation_required" };
  }
  if (tool === "list_workspaces") {
    return { method: "GET", path: "/workspaces" };
  }
  if (tool === "create_workspace") {
    return { body: { name: input.name }, method: "POST", path: "/workspaces" };
  }
  const path = `/workspaces/${encodeURIComponent(input.workspaceId)}`;
  switch (tool) {
    case "list_prospects":
      return { method: "GET", path: `${path}/prospects` };
    case "list_jobs":
      return { method: "GET", path: `${path}/jobs` };
    case "discover_municipal_record":
      return {
        body: {
          query: input.query,
          ...(input.externalId ? { externalId: input.externalId } : {}),
        },
        method: "POST",
        path: `${path}/discover/minneapolis-license`,
      };
    case "create_prospect":
      return {
        body: {
          name: input.name,
          ...(input.physicalAddress
            ? { physicalAddress: input.physicalAddress }
            : {}),
          ...(input.websiteUrl ? { websiteUrl: input.websiteUrl } : {}),
        },
        method: "POST",
        path: `${path}/prospects`,
      };
    case "enqueue_enrichment":
      return {
        body: { type: "enrich" },
        headers: { "Idempotency-Key": input.idempotencyKey },
        method: "POST",
        path: `${path}/prospects/${encodeURIComponent(input.prospectId)}/jobs`,
      };
    case "list_previews":
      return {
        method: "GET",
        path:
          path +
          "/prospects/" +
          encodeURIComponent(input.prospectId) +
          "/previews",
      };
    case "read_preview":
      return {
        method: "GET",
        path: `${path}/previews/${encodeURIComponent(input.previewId)}`,
      };
    case "create_private_preview":
      return {
        body: {},
        method: "POST",
        path:
          path +
          "/prospects/" +
          encodeURIComponent(input.prospectId) +
          "/previews",
      };
    case "request_review":
      return {
        body: {},
        method: "POST",
        path: `${path}/previews/${encodeURIComponent(input.previewId)}/review`,
      };
    case "read_review":
      return {
        method: "GET",
        path: `${path}/previews/${encodeURIComponent(input.previewId)}/review`,
      };
    default:
      return { error: "client_navigation" };
  }
}
