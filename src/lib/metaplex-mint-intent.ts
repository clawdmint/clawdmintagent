export interface ParsedMintIntentAssetPayload {
  assetAddresses: string[];
  assetSignerSecretKeysBase64: string[];
}

interface MintIntentAssetPayloadV2 {
  version: 2;
  asset_addresses: string[];
  asset_signer_secret_keys_base64: string[];
}

export function serializeMintIntentAssetPayload(input: ParsedMintIntentAssetPayload): string {
  const payload: MintIntentAssetPayloadV2 = {
    version: 2,
    asset_addresses: input.assetAddresses,
    asset_signer_secret_keys_base64: input.assetSignerSecretKeysBase64,
  };

  return JSON.stringify(payload);
}

export function parseMintIntentAssetPayload(raw: string): ParsedMintIntentAssetPayload {
  const parsed = JSON.parse(raw) as unknown;

  if (Array.isArray(parsed)) {
    return {
      assetAddresses: parsed.filter((value): value is string => typeof value === "string"),
      assetSignerSecretKeysBase64: [],
    };
  }

  if (parsed && typeof parsed === "object") {
    const candidate = parsed as Partial<MintIntentAssetPayloadV2>;
    return {
      assetAddresses: Array.isArray(candidate.asset_addresses)
        ? candidate.asset_addresses.filter((value): value is string => typeof value === "string")
        : [],
      assetSignerSecretKeysBase64: Array.isArray(candidate.asset_signer_secret_keys_base64)
        ? candidate.asset_signer_secret_keys_base64.filter(
            (value): value is string => typeof value === "string"
          )
        : [],
    };
  }

  return {
    assetAddresses: [],
    assetSignerSecretKeysBase64: [],
  };
}
