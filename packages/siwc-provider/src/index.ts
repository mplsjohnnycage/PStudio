import { createOpenAI } from "@ai-sdk/openai";

/**
 * Clean-room SIWC Responses API adapter based on OpenAI's public protocol docs.
 * This module DOES NOT sign users in, store refresh tokens, or mint OAuth tokens.
 * An authorized host credential broker handles those responsibilities.
 *
 * No integration with the older ChatGPT Codex private backend is used here.
 */
export const SIWC_REQUIRED_SCOPE = "chatgpt.tokens.use.direct" as const;
const SIWC_RESPONSES_URL = "https://api.openai.com/v1/responses";
const EXPIRY_SKEW_MS = 60_000;
const SCOPE_SEPARATOR = /\s+/;
const TOKEN_WHITESPACE = /\s/;

const DISALLOWED_FIELDS = [
  "background",
  "conversation",
  "max_output_tokens",
  "max_tool_calls",
  "metadata",
  "moderation",
  "multi_agent",
  "prompt",
  "prompt_cache_retention",
  "safety_identifier",
  "temperature",
  "top_logprobs",
  "top_p",
  "truncation",
  "user",
  "previous_response_id",
] as const;

export interface AuthorizedSiwcCredential {
  accessToken: string;
  expiresAt?: number | undefined; // Unix epoch in milliseconds
  ownerUserId: string;
  scopes: string | readonly string[];
}

export interface SiwcCredentialRequest {
  forceRefresh: boolean;
  ownerUserId: string;
  rejectedAccessToken?: string | undefined;
}

export interface SiwcCredentialSource {
  /** Must verify the owner grant, manage protected storage and rotate refresh tokens. */
  getCredential: (
    request: SiwcCredentialRequest
  ) => Promise<AuthorizedSiwcCredential>;
}

export interface SiwcModelOptions {
  credentialSource: SiwcCredentialSource;
  /** Test injection only; production uses global fetch. */
  fetch?: typeof fetch | undefined;
  modelId: string;
  /** PStudio is single-owner: only the authenticated owner may use this grant. */
  ownerUserId: string;
}

function permitted(scopes: string | readonly string[]): boolean {
  const values = Array.isArray(scopes)
    ? scopes
    : String(scopes).split(SCOPE_SEPARATOR);
  return values.includes(SIWC_REQUIRED_SCOPE);
}

function extractText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    throw new Error("SIWC system message must be textual");
  }
  return content
    .map((part) => {
      if (!part || typeof part !== "object") {
        throw new Error("Invalid SIWC system message");
      }
      const record = part as Record<string, unknown>;
      if (record.type !== "input_text" && record.type !== "text") {
        throw new Error("SIWC system message must be textual");
      }
      if (typeof record.text !== "string") {
        throw new Error("Invalid SIWC system text");
      }
      return record.text;
    })
    .join("\n");
}

/** Reject unsupported top-level tools, rather than silently dropping agent capabilities. */
export function normalizeSiwcBody(
  body: Record<string, unknown>
): Record<string, unknown> {
  if (body.stream !== true) {
    throw new Error(
      "SIWC requires streaming inference; doGenerate is disabled"
    );
  }
  if (!Array.isArray(body.input)) {
    throw new Error("SIWC requires a complete input message array");
  }
  if (Array.isArray(body.tools) && body.tools.length) {
    throw new Error(
      "SIWC tool schemas require separate namespace validation before enablement"
    );
  }

  const original = body.input as unknown[];
  const instructions: string[] = [];
  if (typeof body.instructions === "string" && body.instructions.trim()) {
    instructions.push(body.instructions);
  }
  const input = original.filter((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Invalid SIWC input item");
    }
    const message = item as Record<string, unknown>;
    if (message.role !== "system") {
      return true;
    }
    instructions.push(extractText(message.content));
    return false;
  });
  if (!input.length) {
    throw new Error("SIWC requires at least one non-system input item");
  }

  const blockedKeys = new Set<string>([
    ...DISALLOWED_FIELDS,
    "instructions",
    "tools",
  ]);
  const normalized: Record<string, unknown> = Object.fromEntries(
    Object.entries(body).filter(([key]) => !blockedKeys.has(key))
  );
  normalized.input = input;
  normalized.store = false;
  normalized.stream = true;
  if (instructions.length) {
    normalized.instructions = instructions.join("\n\n");
  }
  return normalized;
}

function assertCredential(
  credential: AuthorizedSiwcCredential,
  ownerUserId: string
): string {
  if (credential.ownerUserId !== ownerUserId) {
    throw new Error("SIWC credential principal mismatch");
  }
  if (!permitted(credential.scopes)) {
    throw new Error("ChatGPT plan-usage consent missing");
  }
  const token = credential.accessToken;
  if (
    typeof token !== "string" ||
    token.length < 8 ||
    TOKEN_WHITESPACE.test(token)
  ) {
    throw new Error("Invalid SIWC access credential");
  }
  return token;
}

/**
 * Create a standard AI SDK LanguageModel for defineAgent({ model }).
 * Never provide a direct API key and never pool a single owner's ChatGPT plan.
 * The authentication source MUST be bound to the authenticated PStudio principal.
 */
export function createSiwcModel(options: SiwcModelOptions) {
  if (!(options.ownerUserId && options.modelId && options.credentialSource)) {
    throw new Error("SIWC owner, model and credential source are required");
  }
  const transport = options.fetch ?? globalThis.fetch;
  const provider = createOpenAI({
    // Replaced before network dispatch. No ordinary OPENAI_API_KEY is consulted.
    apiKey: "siwc-credential-broker",
    fetch: async (url, init) => {
      const destination = typeof url === "string" ? url : url.toString();
      if (
        destination !== SIWC_RESPONSES_URL ||
        init?.method?.toUpperCase() !== "POST"
      ) {
        throw new Error("Unexpected SIWC inference endpoint");
      }
      if (typeof init.body !== "string") {
        throw new Error("SIWC request must be JSON");
      }
      let original: unknown;
      try {
        original = JSON.parse(init.body) as unknown;
      } catch (error) {
        throw new Error("Invalid SIWC inference JSON", { cause: error });
      }
      if (
        !original ||
        Array.isArray(original) ||
        typeof original !== "object"
      ) {
        throw new Error("Invalid SIWC inference payload");
      }
      const body = normalizeSiwcBody(original as Record<string, unknown>);
      const requestToken = async (
        forceRefresh: boolean,
        rejectedAccessToken?: string
      ) => {
        const credential = await options.credentialSource.getCredential({
          forceRefresh,
          ownerUserId: options.ownerUserId,
          ...(rejectedAccessToken ? { rejectedAccessToken } : {}),
        });
        let token = assertCredential(credential, options.ownerUserId);
        if (
          !forceRefresh &&
          typeof credential.expiresAt === "number" &&
          credential.expiresAt <= Date.now() + EXPIRY_SKEW_MS
        ) {
          const renewed = await options.credentialSource.getCredential({
            forceRefresh: true,
            ownerUserId: options.ownerUserId,
            rejectedAccessToken: token,
          });
          token = assertCredential(renewed, options.ownerUserId);
          if (
            typeof renewed.expiresAt === "number" &&
            renewed.expiresAt <= Date.now()
          ) {
            throw new Error("SIWC access credential expired");
          }
        }
        return token;
      };
      const wire = (accessToken: string) => {
        const headers = new Headers(init.headers);
        headers.delete("authorization");
        headers.delete("x-api-key");
        headers.set("authorization", `Bearer ${accessToken}`);
        headers.set("content-type", "application/json");
        return transport(SIWC_RESPONSES_URL, {
          ...init,
          body: JSON.stringify(body),
          headers,
          redirect: "error",
        });
      };
      const token = await requestToken(false);
      const response = await wire(token);
      if (response.status !== 401) {
        return response;
      }
      // Exactly one replay with host-owned token rotation, never retry non-401 failures.
      const refreshed = await requestToken(true, token);
      if (refreshed === token) {
        return response;
      }
      return wire(refreshed);
    },
  });
  return provider.responses(options.modelId);
}
