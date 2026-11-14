/**
 * User-consented ChatGPT plan usage is an optional feature. Private personal
 * open-source/self-hosted installations and separately approved hosted apps
 * may opt in, but credential sharing must never be enabled merely because a
 * Neon JWT is valid. Never expose model credentials to client code.
 */
export interface HostedChatGPTEnvironment {
  CHATGPT_HOST_ID?: string;
  PSTUDIO_CHATGPT_HOSTED_APPROVED?: string;
  PSTUDIO_CHATGPT_OWNER_USER_ID?: string;
  PSTUDIO_CHATGPT_PERSONAL_SELF_HOSTED?: string;
  PSTUDIO_CHATGPT_PLAN_ENABLED?: string;
}

const UUID =
  /^(?:urn:uuid:)?[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,255}$/;

export function validChatgptHostId(value: string | undefined): boolean {
  return UUID.test(value ?? "");
}

/** Explicit config is an operator assertion, not provider-issued approval. */
export function hostedPlanEnabled(
  env: HostedChatGPTEnvironment = process.env
): boolean {
  const personal =
    env.PSTUDIO_CHATGPT_PERSONAL_SELF_HOSTED === "1" &&
    USER_ID.test(env.PSTUDIO_CHATGPT_OWNER_USER_ID ?? "");
  const approvedHosted = env.PSTUDIO_CHATGPT_HOSTED_APPROVED === "1";
  return (
    env.PSTUDIO_CHATGPT_PLAN_ENABLED === "1" &&
    validChatgptHostId(env.CHATGPT_HOST_ID) &&
    (personal || approvedHosted)
  );
}

/** A personal deployment must never permit a second Neon subject to use it. */
export function allowedChatgptUser(
  userId: string,
  env: HostedChatGPTEnvironment = process.env
): boolean {
  if (!hostedPlanEnabled(env)) {
    return false;
  }
  if (env.PSTUDIO_CHATGPT_PERSONAL_SELF_HOSTED === "1") {
    return userId === env.PSTUDIO_CHATGPT_OWNER_USER_ID;
  }
  return env.PSTUDIO_CHATGPT_HOSTED_APPROVED === "1";
}
