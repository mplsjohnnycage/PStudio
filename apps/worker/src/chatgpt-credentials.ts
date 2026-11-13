import {
  type Credential,
  InMemoryCredentialStore,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { PiProviderCredential } from "@rivet-dev/pi";
import { actor } from "rivetkit";

/**
 * Private Actor, one per *authenticated* Neon user.
 * The app never sends OAuth refresh tokens to browsers or models.
 * Do not expose this actor's control plane to public clients.
 */
export const credentials = actor({
  actions: {
    list: (c) =>
      Object.entries(c.state.saved).map(([providerId, { type }]) => ({
        providerId,
        type,
      })),
    read: (c, provider: string): PiProviderCredential | undefined =>
      withoutRefreshToken(c.state.saved[provider]),
    refresh: async (
      c,
      provider: string
    ): Promise<PiProviderCredential | undefined> => {
      if (provider !== "openai") {
        return undefined;
      }
      const saved = c.state.saved[provider];
      if (!saved) {
        return undefined;
      }
      const store = new InMemoryCredentialStore();
      await store.modify(provider, async () => saved);
      const runtime = await ModelRuntime.create({
        credentials: store,
        modelsPath: null,
      });
      await runtime.getAuth(provider, { minOAuthValidityMs: 10 * 60_000 });
      const refreshed = await store.read(provider);
      if (refreshed) {
        c.state.saved[provider] = refreshed;
      }
      return withoutRefreshToken(refreshed);
    },
    save: (c, provider: string, credential: Credential) => {
      if (provider !== "openai") {
        throw new Error("Unsupported identity provider");
      }
      c.state.saved[provider] = credential;
    },
  },
  state: { saved: {} as Record<string, Credential> },
});

function withoutRefreshToken(
  credential: Credential | undefined
): PiProviderCredential | undefined {
  if (credential?.type !== "oauth") {
    return credential;
  }
  const { refresh: _refresh, ...safe } = credential;
  return safe;
}
