import { createOwnerEveSiwcModel } from "../../worker/src/eve-siwc-model.ts";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing private runtime configuration: ${name}`);
  }
  return value;
}

const REPLY = "PSTUDIO-SIWC-OK";
const ownerUserId = required("PSTUDIO_CHATGPT_OWNER_USER_ID");
const modelId = required("PSTUDIO_SIWC_MODEL_ID");

const model = createOwnerEveSiwcModel({ modelId, ownerUserId });
const controller = new AbortController();
const watchdog = setTimeout(() => controller.abort(), 45_000);
try {
  const response = await model.doStream({
    abortSignal: controller.signal,
    prompt: [
      {
        content: [{ text: `Reply with exactly ${REPLY}.`, type: "text" }],
        role: "user",
      },
    ],
  });
  const tokens = [];
  let streamErrors = 0;
  for await (const chunk of response.stream) {
    if (chunk.type === "text-delta") {
      const text = chunk.text ?? chunk.delta;
      if (typeof text === "string") {
        tokens.push(text);
      }
    }
    if (chunk.type === "error") {
      streamErrors += 1;
    }
  }
  const actual = tokens.join("");
  const success = streamErrors === 0 && actual.includes(REPLY);
  console.log(
    JSON.stringify({
      apiKeyFallback: false,
      credentialSource: "private-rivet-actor",
      inferenceTransport: "public-openai-responses-api",
      model: modelId,
      ownerScoped: true,
      responseMatchesChallenge: success,
      responseReceived: actual.length > 0,
      streamErrors,
    })
  );
  process.exitCode = success ? 0 : 1;
} catch (error) {
  // Do not print arbitrary provider errors; they may embed sensitive headers,
  // callback URLs, OAuth tokens, account identifiers, or request bodies.
  const detail = String(error?.message ?? "");
  let category = "provider_request_failed";
  if (detail.includes("No authorized ChatGPT OAuth credential")) {
    category = "owner_grant_missing";
  } else if (detail.includes("owner access not enabled")) {
    category = "owner_authorization_disabled";
  } else if (detail.includes("plan-usage consent missing")) {
    category = "plan_use_scope_missing";
  }
  console.error(
    JSON.stringify({
      category,
      failureType: error?.name ?? "unknown",
      liveVerified: false,
    })
  );
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
}
