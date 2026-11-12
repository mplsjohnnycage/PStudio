const HTTPS_ERROR = /https/i;

import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createNeonTokenVerifier } from "../src/auth.ts";

test("signed Neon-compatible EdDSA JWT succeeds with trusted issuer", async () => {
  const pair = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(pair.publicKey);
  const verifier = createNeonTokenVerifier(
    {
      issuer: "https://auth.example.test",
      jwksUrl: "https://auth.example.test/jwks",
    },
    createLocalJWKSet({ keys: [{ ...jwk, alg: "EdDSA", kid: "test-key" }] })
  );
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA", kid: "test-key" })
    .setSubject("neon-user-1")
    .setIssuer("https://auth.example.test")
    .setAudience("https://auth.example.test")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(pair.privateKey);
  assert.equal(await verifier(`Bearer ${token}`), "neon-user-1");
  assert.equal(await verifier(`bearer ${token}`), "neon-user-1");
  assert.equal(await verifier("Basic whatever"), null);
  assert.equal(await verifier(undefined), null);
});

test("JWT verifier denies wrong issuer, invalid signature, expired or non-expiring tokens", async () => {
  const pair = await generateKeyPair("EdDSA");
  const badPair = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(pair.publicKey);
  const verify = createNeonTokenVerifier(
    {
      issuer: "https://auth.example.test",
      jwksUrl: "https://auth.example.test/jwks",
    },
    createLocalJWKSet({ keys: [{ ...jwk, alg: "EdDSA", kid: "test-key" }] })
  );
  const mint = (privateKey, issuer, expiration) => {
    let jwt = new SignJWT({})
      .setProtectedHeader({ alg: "EdDSA", kid: "test-key" })
      .setSubject("u1")
      .setIssuer(issuer)
      .setAudience("https://auth.example.test")
      .setIssuedAt();
    if (expiration) {
      jwt = jwt.setExpirationTime(expiration);
    }
    return jwt.sign(privateKey);
  };
  assert.equal(
    await verify(
      `Bearer ${await mint(badPair.privateKey, "https://auth.example.test", "2m")}`
    ),
    null
  );
  assert.equal(
    await verify(
      `Bearer ${await mint(pair.privateKey, "https://wrong.test", "2m")}`
    ),
    null
  );
  assert.equal(
    await verify(
      `Bearer ${await mint(pair.privateKey, "https://auth.example.test", "-2m")}`
    ),
    null
  );
  assert.equal(
    await verify(
      `Bearer ${await mint(pair.privateKey, "https://auth.example.test", null)}`
    ),
    null
  );
});

test("missing or unsafe auth configuration fails closed", async () => {
  const absent = createNeonTokenVerifier({
    issuer: undefined,
    jwksUrl: undefined,
  });
  assert.equal(await absent("Bearer abc.def.ghi"), null);
  assert.throws(
    () =>
      createNeonTokenVerifier({
        issuer: "http://remote.example.com",
        jwksUrl: "http://remote.example.com/jwks",
      }),
    HTTPS_ERROR
  );
});

test("Neon JWT verifier rejects signed tokens with wrong or missing audience", async () => {
  const pair = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(pair.publicKey);
  const verify = createNeonTokenVerifier(
    {
      issuer: "https://auth.example.test/PS/auth",
      jwksUrl: "https://auth.example.test/PS/auth/.well-known/jwks.json",
    },
    createLocalJWKSet({ keys: [{ ...jwk, alg: "EdDSA", kid: "test-key" }] })
  );
  const sign = (audience) => {
    let token = new SignJWT({})
      .setProtectedHeader({ alg: "EdDSA", kid: "test-key" })
      .setSubject("user-1")
      .setIssuer("https://auth.example.test")
      .setIssuedAt()
      .setExpirationTime("5m");
    if (audience) {
      token = token.setAudience(audience);
    }
    return token.sign(pair.privateKey);
  };
  assert.equal(
    await verify(`Bearer ${await sign("https://auth.example.test")}`),
    "user-1"
  );
  assert.equal(
    await verify(`Bearer ${await sign("https://different.example.test")}`),
    null
  );
  assert.equal(await verify(`Bearer ${await sign(null)}`), null);
});
