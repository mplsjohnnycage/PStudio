import type { getAuthClient } from "./studio-auth";

type Client = ReturnType<typeof getAuthClient>;

/** Neon installs emailOTPClient in the Better Auth React adapter at runtime. */
type NeonEmailOtpClient = Client & {
  emailOtp: {
    verifyEmail: (params: {
      email: string;
      otp: string;
    }) => Promise<{ error: { message?: string } | null }>;
    sendVerificationOtp: (params: {
      email: string;
      type: "email-verification";
    }) => Promise<{ error: { message?: string } | null }>;
  };
};

export type EmailSignupResult =
  | { kind: "authenticated" }
  | { kind: "verify_email" }
  | { kind: "verified_sign_in_required" }
  | { kind: "error"; message: string };

async function hasSession(client: Client): Promise<boolean> {
  try {
    const session = await client.getSession();
    return Boolean(session.data?.user);
  } catch {
    return false;
  }
}

/** Neon may create a user without a session when email verification is on. */
export async function registerWithEmail(
  client: Client,
  input: { email: string; name: string; password: string }
): Promise<EmailSignupResult> {
  const response = await client.signUp.email(input);
  if (response.error) {
    return {
      kind: "error",
      message: response.error.message ?? "Registration failed.",
    };
  }
  return (await hasSession(client))
    ? { kind: "authenticated" }
    : { kind: "verify_email" };
}

/** Confirm Neon-managed verification OTP; never treat an unverified user as logged in. */
export async function confirmEmailOtp(
  client: Client,
  email: string,
  otp: string
): Promise<EmailSignupResult> {
  const result = await (client as NeonEmailOtpClient).emailOtp.verifyEmail({
    email,
    otp,
  });
  if (result.error) {
    return {
      kind: "error",
      message: result.error.message ?? "Invalid verification code.",
    };
  }
  return (await hasSession(client))
    ? { kind: "authenticated" }
    : { kind: "verified_sign_in_required" };
}

export async function resendEmailOtp(
  client: Client,
  email: string
): Promise<{ ok: boolean; message: string }> {
  const result = await (
    client as NeonEmailOtpClient
  ).emailOtp.sendVerificationOtp({
    email,
    type: "email-verification",
  });
  return result.error
    ? {
        message: result.error.message ?? "Unable to resend verification code.",
        ok: false,
      }
    : { message: "A new verification code was requested.", ok: true };
}
