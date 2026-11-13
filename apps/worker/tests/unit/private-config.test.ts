import { describe, expect, test } from "vitest";
import { privateRivetConfigured } from "../../src/private-config";

const configured = {
  DATABASE_URL: "postgresql://fake-example.invalid/not-usable",
  RIVET_ENDPOINT: "https://staging:sk_FAKE_NOT_A_SECRET@api.rivet.dev",
};

describe("private worker transport gate", () => {
  test("requires HTTPS and a server-only control-plane secret", () => {
    expect(privateRivetConfigured(configured)).toBe(true);
    expect(
      privateRivetConfigured({ ...configured, DATABASE_URL: undefined })
    ).toBe(false);
    expect(
      privateRivetConfigured({
        ...configured,
        RIVET_ENDPOINT: "http://localhost:6420",
      })
    ).toBe(false);
    expect(
      privateRivetConfigured({
        ...configured,
        RIVET_ENDPOINT: "https://staging:pk_FAKE@api.rivet.dev",
      })
    ).toBe(false);
    expect(
      privateRivetConfigured({ ...configured, RIVET_ENDPOINT: "not a URL" })
    ).toBe(false);
  });
  test("supports the scoped-token configuration without leaking values", () => {
    expect(
      privateRivetConfigured({
        DATABASE_URL: "postgresql://fake-example.invalid/not-usable",
        RIVET_ENDPOINT: "https://api.rivet.dev",
        RIVET_NAMESPACE: "staging",
        RIVET_TOKEN: "sk_FAKE_NOT_A_SECRET",
      })
    ).toBe(true);
  });
});
