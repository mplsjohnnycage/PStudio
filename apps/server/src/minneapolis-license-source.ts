import type { SourceCandidate } from "@prospect-studio/db/admission-queries";

const ENDPOINT =
  "https://services.arcgis.com/afSMGVsC7QlRK1kZ/arcgis/rest/services/Residential_Specialty/FeatureServer/0/query";
const QUERY = /^[A-Za-z0-9][A-Za-z0-9 &.,-]{2,79}$/;
const LICENSE = /^[A-Za-z0-9_-]{2,80}$/;
const PROVIDER = "minneapolis_residential_specialty";
const ADDRESS_SUFFIX = /, ([A-Z]{2}), (\d{5})$/;

interface LicenseAttributes {
  address1?: unknown;
  city?: unknown;
  contractorDesc?: unknown;
  dbaName?: unknown;
  ESRI_OID?: unknown;
  expirationDate?: unknown;
  licenseNumber?: unknown;
  state?: unknown;
  zip?: unknown;
}

function textField(value: unknown, max: number): string | null {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max
    ? value.trim()
    : null;
}

function candidateFromAttributes(
  raw: LicenseAttributes,
  sourceUri: string,
  retrievedAt: Date
): SourceCandidate | null {
  const license = textField(raw.licenseNumber, 80);
  const name = textField(raw.dbaName, 160);
  if (!(license && LICENSE.test(license) && name)) {
    return null;
  }
  const address = [raw.address1, raw.city, raw.state, raw.zip]
    .filter((item) => typeof item === "string" && item.trim().length > 0)
    .map((item) => String(item).trim())
    .join(", ")
    .replace(ADDRESS_SUFFIX, ", $1 $2");
  const safe = {
    address1: textField(raw.address1, 150),
    city: textField(raw.city, 100),
    contractorDesc: textField(raw.contractorDesc, 100),
    dbaName: name,
    ESRI_OID: typeof raw.ESRI_OID === "number" ? raw.ESRI_OID : null,
    expirationDate:
      typeof raw.expirationDate === "number" ? raw.expirationDate : null,
    licenseNumber: license,
    state: textField(raw.state, 2),
    zip: textField(raw.zip, 12),
  };
  const expiration =
    typeof safe.expirationDate === "number" &&
    Number.isFinite(safe.expirationDate)
      ? new Date(safe.expirationDate)
      : null;
  const claims = [{ field: "licenseNumber", value: license }];
  if (expiration && !Number.isNaN(expiration.getTime())) {
    claims.push({
      field: "licenseExpirationDate",
      value: expiration.toISOString().slice(0, 10),
    });
  }
  return {
    externalId: license,
    name,
    provider: PROVIDER,
    ...(address ? { physicalAddress: address } : {}),
    reportedClaims: claims,
    retrievedAt,
    sourceExcerpt: JSON.stringify(safe),
    sourceTitle:
      "City of Minneapolis residential specialty trade license record (legacy)",
    sourceUri,
  };
}

/** Historic municipal public-license records; never confirms current licensure. */
export async function searchMinneapolisLicense(
  input: string,
  fetcher: typeof fetch = fetch
): Promise<SourceCandidate[]> {
  const query = input.trim();
  if (!QUERY.test(query)) {
    throw new Error("Invalid discovery query");
  }
  const url = new URL(ENDPOINT);
  url.searchParams.set("where", `dbaName LIKE '%${query}%'`);
  url.searchParams.set(
    "outFields",
    "licenseNumber,contractorDesc,dbaName,address1,city,state,zip,expirationDate,ESRI_OID"
  );
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("resultRecordCount", "5");
  url.searchParams.set("f", "json");

  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    throw new Error("Public source unavailable", { cause: error });
  }
  if (!response.ok) {
    throw new Error("Public source unavailable");
  }
  let value: unknown;
  try {
    const body = await response.text();
    if (body.length > 250_000) {
      throw new Error("oversized");
    }
    value = JSON.parse(body);
  } catch (error) {
    throw new Error("Invalid source response", { cause: error });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid source response");
  }
  const parsed = value as { features?: unknown; error?: unknown };
  if (
    parsed.error ||
    !Array.isArray(parsed.features) ||
    parsed.features.length > 5
  ) {
    throw new Error("Invalid source response");
  }
  const at = new Date();
  return parsed.features
    .filter(
      (feature): feature is { attributes: LicenseAttributes } =>
        feature !== null &&
        typeof feature === "object" &&
        !Array.isArray(feature) &&
        "attributes" in feature &&
        feature.attributes !== null &&
        typeof feature.attributes === "object" &&
        !Array.isArray(feature.attributes)
    )
    .map((feature) =>
      candidateFromAttributes(feature.attributes, url.toString(), at)
    )
    .filter((candidate): candidate is SourceCandidate => candidate !== null);
}
