import {
  createSiwcModel,
  type SiwcModelOptions,
} from "@prospect-studio/siwc-provider";
import {
  createRivetSiwcCredentialSource,
  type RivetSiwcSourceOptions,
} from "./eve-siwc-credential-source";

export interface OwnerEveModelOptions extends RivetSiwcSourceOptions {
  /** Test injection; ordinary execution uses native fetch. */
  fetch?: SiwcModelOptions["fetch"];
  /** Resolve a model returned by official plan-use model discovery. */
  modelId: string;
}

/**
 * Eve 1.0 model integration; no custom Eve fork, new OAuth flow or API key.
 * Existing Rivet credentials Actor owns token storage and rotation.
 * The model uses the publicly documented plan-use Responses API endpoint.
 *
 * Caller MUST select the configured Neon owner before constructing this model.
 * This function does not change Rivet's existing Pi Durable agent or switch
 * the Workflow world used by Eve.
 */
export function createOwnerEveSiwcModel(options: OwnerEveModelOptions) {
  const credentialSource = createRivetSiwcCredentialSource(options);
  return createSiwcModel({
    credentialSource,
    modelId: options.modelId,
    ownerUserId: options.ownerUserId,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}
