import {
  allowedChatgptUser,
  type HostedChatGPTEnvironment,
} from "@prospect-studio/api/chatgpt-hosted-policy";

/** Enforced inside each private Rivet actor, not just at the HTTP broker. */
export function assertChatgptActorOwner(
  userId: string | undefined,
  env: HostedChatGPTEnvironment = process.env
): void {
  if (!allowedChatgptUser(userId ?? "", env)) {
    throw new Error("ChatGPT credentials are unavailable for this user");
  }
}
