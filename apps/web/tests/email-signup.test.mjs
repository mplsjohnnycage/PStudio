import assert from "node:assert/strict";
import { test } from "node:test";
import {
  confirmEmailOtp,
  registerWithEmail,
  resendEmailOtp,
} from "../src/lib/email-signup.ts";

function authMock({ signupError, verifyError, resendError, sessionUser } = {}) {
  const calls = [];
  return {
    calls,
    client: {
      emailOtp: {
        sendVerificationOtp: ({ email, type }) => {
          calls.push(["resend", email, type]);
          return Promise.resolve({
            error: resendError ? { message: resendError } : null,
          });
        },
        verifyEmail: ({ email, otp }) => {
          calls.push(["verify", email, otp]);
          return Promise.resolve({
            error: verifyError ? { message: verifyError } : null,
          });
        },
      },
      getSession: () =>
        Promise.resolve({ data: { user: sessionUser ?? null } }),
      signUp: {
        email: (body) => {
          calls.push(["signup", body.email]);
          return Promise.resolve({
            error: signupError ? { message: signupError } : null,
          });
        },
      },
    },
  };
}

test("registration requiring email verification does not treat signup as authenticated", async () => {
  const { client } = authMock();
  assert.deepEqual(
    await registerWithEmail(client, {
      email: "owner@example.test",
      name: "Owner",
      password: "not-a-real-password",
    }),
    { kind: "verify_email" }
  );
});

test("registration with an established session proceeds directly", async () => {
  const { client } = authMock({ sessionUser: { id: "owner1" } });
  assert.deepEqual(
    await registerWithEmail(client, {
      email: "owner@example.test",
      name: "Owner",
      password: "not-a-real-password",
    }),
    { kind: "authenticated" }
  );
});

test("signup and OTP failures prevent authentication", async () => {
  const first = authMock({ signupError: "registration rejected" });
  assert.deepEqual(
    await registerWithEmail(first.client, {
      email: "a@example.test",
      name: "A",
      password: "not-a-real-password",
    }),
    { kind: "error", message: "registration rejected" }
  );
  const second = authMock({ verifyError: "wrong code" });
  assert.deepEqual(
    await confirmEmailOtp(second.client, "a@example.test", "123456"),
    {
      kind: "error",
      message: "wrong code",
    }
  );
});

test("successful verification either uses new session or requires explicit sign-in", async () => {
  assert.deepEqual(
    await confirmEmailOtp(authMock().client, "a@example.test", "123456"),
    {
      kind: "verified_sign_in_required",
    }
  );
  assert.deepEqual(
    await confirmEmailOtp(
      authMock({ sessionUser: { id: "owner1" } }).client,
      "a@example.test",
      "123456"
    ),
    { kind: "authenticated" }
  );
});

test("resend requests the correct Neon OTP type and propagates errors", async () => {
  const { client, calls } = authMock();
  assert.deepEqual(await resendEmailOtp(client, "owner@example.test"), {
    message: "A new verification code was requested.",
    ok: true,
  });
  assert.deepEqual(calls.at(-1), [
    "resend",
    "owner@example.test",
    "email-verification",
  ]);
  const denied = await resendEmailOtp(
    authMock({ resendError: "rate limited" }).client,
    "a@example.test"
  );
  assert.deepEqual(denied, { message: "rate limited", ok: false });
});
