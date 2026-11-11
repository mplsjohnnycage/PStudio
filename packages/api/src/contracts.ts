import { z } from "zod";

/**
 * Versioned domain contracts for Prospect Studio. They validate payload shape,
 * not caller authorization or whether a cited source actually proves a claim.
 * The service must enforce tenant ownership and source-to-prospect integrity.
 */
export const contractVersion = 1;
const identifier = z.string().trim().min(1).max(200);
const timestamp = z.iso.datetime({ offset: true });

const knownOrUnknown = (knownValue: z.ZodType) =>
  z.discriminatedUnion("status", [
    z.strictObject({
      checkedAt: timestamp,
      status: z.literal("known"),
      value: knownValue,
    }),
    z.strictObject({
      checkedAt: z.null(),
      status: z.literal("unknown"),
      value: z.null(),
    }),
  ]);

export const prospectSchema = z.strictObject({
  createdAt: timestamp,
  externalIds: z.array(
    z.strictObject({ provider: identifier, value: identifier })
  ),
  id: identifier,
  name: z.string().trim().min(1),
  phone: knownOrUnknown(z.string().trim().min(1)),
  physicalAddress: z.string().trim().min(1).nullable(),
  stage: z.enum([
    "discovered",
    "researching",
    "qualified",
    "designing",
    "review",
    "delivered",
    "archived",
  ]),
  updatedAt: timestamp,
  website: knownOrUnknown(z.url()),
});

export const evidenceSchema = z.strictObject({
  capturedAt: timestamp,
  excerpt: z.string().trim().min(1),
  id: identifier,
  prospectId: identifier,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string().trim().min(1),
  type: z.enum(["website", "directory", "document", "manual"]),
  uri: z.url(),
});

export const claimSchema = z
  .strictObject({
    evidenceIds: z.array(identifier),
    field: identifier,
    id: identifier,
    kind: z.enum(["observed", "reported", "inferred", "unknown"]),
    observedAt: timestamp,
    prospectId: identifier,
    unknownReason: z.string().trim().min(1).nullable(),
    value: z.string().trim().min(1).nullable(),
  })
  .superRefine((claim, ctx) => {
    if (claim.kind === "unknown") {
      if (
        claim.value !== null ||
        claim.evidenceIds.length !== 0 ||
        claim.unknownReason === null
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Unknown claims require a reason, null value and no cited evidence",
        });
      }
    } else if (
      claim.value === null ||
      claim.evidenceIds.length === 0 ||
      claim.unknownReason !== null
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Non-unknown claims require a value and cited evidence",
      });
    }
  });

export const jobSchema = z
  .strictObject({
    attempt: z.number().int().min(0),
    createdAt: timestamp,
    id: identifier,
    maxAttempts: z.number().int().min(1).max(20),
    prospectId: identifier,
    state: z.enum([
      "queued",
      "running",
      "retrying",
      "completed",
      "failed",
      "cancelled",
    ]),
    type: z.enum(["enrich", "crawl", "extract", "score", "index", "build"]),
    updatedAt: timestamp,
  })
  .refine((job) => job.attempt <= job.maxAttempts, {
    message: "Attempts cannot exceed the configured maximum",
    path: ["attempt"],
  });

export const approvalSchema = z
  .strictObject({
    createdAt: timestamp,
    decidedAt: timestamp.nullable(),
    decidedBy: identifier.nullable(),
    id: identifier,
    prospectId: identifier,
    state: z.enum(["pending", "approved", "rejected"]),
    subjectId: identifier,
    subjectType: z.enum(["preview", "outreach", "publish"]),
  })
  .superRefine((decision, ctx) => {
    const hasDecision =
      decision.decidedBy !== null && decision.decidedAt !== null;
    if (
      (decision.state === "pending" &&
        (decision.decidedBy !== null || decision.decidedAt !== null)) ||
      (decision.state !== "pending" && !hasDecision)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Pending approvals cannot have a decision; completed approvals need an actor and timestamp",
      });
    }
  });

export const previewSchema = z
  .strictObject({
    allowedViewerIds: z.array(identifier),
    createdAt: timestamp,
    expiresAt: timestamp,
    id: identifier,
    prospectId: identifier,
    releaseId: identifier,
    state: z.enum(["draft", "shared", "archived"]),
    version: z.number().int().min(1),
  })
  .refine(
    (preview) =>
      preview.state !== "shared" || preview.allowedViewerIds.length > 0,
    {
      message:
        "Shared previews require at least one explicitly permitted viewer",
      path: ["allowedViewerIds"],
    }
  );

export const commentSchema = z.strictObject({
  anchor: z
    .strictObject({
      kind: z.literal("element"),
      target: z.string().trim().min(1),
    })
    .nullable(),
  authorId: identifier,
  body: z.string().trim().min(1).max(10_000),
  createdAt: timestamp,
  id: identifier,
  previewId: identifier,
  prospectId: identifier,
  releaseId: identifier,
});

export const draftSchema = z.strictObject({
  body: z.string().trim().min(1),
  createdAt: timestamp,
  id: identifier,
  prospectId: identifier,
  recipient: z.email(),
  state: z.enum(["draft", "ready", "sent"]),
  subject: z.string().trim().min(1),
});

export function canAccessPreview(
  preview: unknown,
  request: { viewerId: string; prospectId: string; at: string }
): boolean {
  const parsed = previewSchema.safeParse(preview);
  if (!(parsed.success && timestamp.safeParse(request.at).success)) {
    return false;
  }
  const value = parsed.data;
  return (
    value.state === "shared" &&
    value.prospectId === request.prospectId &&
    value.allowedViewerIds.includes(request.viewerId) &&
    Date.parse(request.at) < Date.parse(value.expiresAt)
  );
}

/** Model-level prerequisite only: actual sends also require server authorization and revalidation. */
export function canReleaseDraft(draft: unknown, approval: unknown): boolean {
  const d = draftSchema.safeParse(draft);
  const a = approvalSchema.safeParse(approval);
  if (!(d.success && a.success)) {
    return false;
  }
  return (
    d.data.state === "draft" &&
    a.data.state === "approved" &&
    a.data.subjectType === "outreach" &&
    a.data.subjectId === d.data.id &&
    a.data.prospectId === d.data.prospectId
  );
}

export type Prospect = z.infer<typeof prospectSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Job = z.infer<typeof jobSchema>;
export type Approval = z.infer<typeof approvalSchema>;
export type Preview = z.infer<typeof previewSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type Draft = z.infer<typeof draftSchema>;
