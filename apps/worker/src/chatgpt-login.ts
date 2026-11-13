import {
  type Credential,
  createModels,
  InMemoryCredentialStore,
} from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { actor, type Registry, UserError } from "rivetkit";
import type { credentials } from "./chatgpt-credentials";

interface PendingSignIn {
  cancel: () => void;
  credential: Promise<Credential>;
  pasteRedirect: (url: string) => void;
}
const APP_NAME = "Prospect Studio";
const HOST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Rivet guide: https://rivet.dev/guides/sign-in-with-chatgpt/
 * Consent uses the user's plan on supported self-hosted/open-source use cases,
 * NOT their Neon identity and NOT an OpenAI API key.
 *
 * Only the authenticated backend may call this private actor by Neon user ID.
 * The worker requires one stable CHATGPT_HOST_ID per deployment.
 */
export const chatgptLogin = actor({
  actions: {
    finish: async (c, redirectUrl?: string) => {
      const { pending } = c.vars;
      if (!pending) {
        throw new UserError("Start ChatGPT sign-in before finishing");
      }
      if (redirectUrl) {
        // Never log the callback URL: it contains an authorization code.
        pending.pasteRedirect(redirectUrl);
      }
      try {
        const credential = await pending.credential;
        const client =
          c.client<Registry<{ credentials: typeof credentials }>>();
        const [userId] = c.key;
        if (!userId) {
          throw new UserError("An authenticated Neon user is required");
        }
        await client.credentials
          .getOrCreate([userId])
          .save("openai", credential);
      } catch {
        // biome-ignore lint/style/useErrorCause: raw OAuth errors must never reach clients
        throw new UserError("ChatGPT consent or token exchange failed");
      } finally {
        c.vars.pending = undefined;
      }
    },
    start: (c) => {
      c.vars.pending?.cancel();
      const hostId = process.env.CHATGPT_HOST_ID;
      if (!(hostId && HOST_ID_PATTERN.test(hostId))) {
        throw new UserError("ChatGPT host identity is not configured");
      }
      const models = createModels({
        credentials: new InMemoryCredentialStore(),
      });
      models.setProvider(openaiProvider());
      const controller = new AbortController();
      const authUrl = Promise.withResolvers<string>();
      const redirect = Promise.withResolvers<string>();
      const credential = models.login(
        "openai",
        "oauth",
        {
          notify: (event) => {
            if (event.type === "auth_url") {
              authUrl.resolve(event.url);
            }
          },
          prompt: ({ signal }) =>
            new Promise<string>((resolve, reject) => {
              signal?.addEventListener(
                "abort",
                () => reject(new Error("ChatGPT sign-in cancelled")),
                { once: true }
              );
              redirect.promise.then(resolve, reject);
            }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10 * 60_000),
          ]),
        },
        { agentName: APP_NAME, getDeviceId: () => hostId }
      );
      c.vars.pending = {
        cancel: () => controller.abort(),
        credential,
        pasteRedirect: redirect.resolve,
      };
      c.keepAwake(credential.catch(() => undefined));
      return Promise.race([
        authUrl.promise,
        credential.then(() => authUrl.promise),
      ]);
    },
  },
  createVars: () => ({
    pending: undefined as PendingSignIn | undefined,
  }),
});
