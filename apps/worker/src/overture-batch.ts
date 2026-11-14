/** Private, bounded Overture market intake. Authenticated workspace admission and
 * transactional Neon outbox enqueue are reused; Rivet dispatcher delivers jobs. */
import { spawn } from "node:child_process";
import { userInfo } from "node:os";
import { resolve } from "node:path";
import { createDb } from "@prospect-studio/db";
import {
  admitSourcedProspect,
  type SourceCandidate,
} from "@prospect-studio/db/admission-queries";
import { enqueueWorkspaceJob } from "@prospect-studio/db/job-enqueue";
import { createNeonTokenVerifier } from "../../server/src/auth";
import { resolveVerifiedDiscoveryOperator } from "./overture-operator";

interface Place {
  address?: string;
  category?: string;
  name: string;
  pilot?: {
    gate_a: unknown;
    gate_b: unknown;
    website_check: unknown;
    bdna: unknown;
    stage: string;
  };
  provenance: { release: string; source_record_sha256: string };
  source_id: string;
  source_observation: Record<string, unknown>;
  website?: string;
  website_verification: string;
}
const SOURCE_ID = /^[a-zA-Z0-9-]{10,100}$/;
const RELEASE = /^\d{4}-\d{2}-\d{2}\.\d+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BBOX = /^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/;

export function asSource(place: Place): SourceCandidate {
  if (
    !(
      SOURCE_ID.test(place.source_id) &&
      RELEASE.test(place.provenance.release) &&
      SHA256.test(place.provenance.source_record_sha256) &&
      place.name
    ) ||
    place.name.length > 160
  ) {
    throw new Error("Invalid Overture source");
  }
  const excerpt = JSON.stringify({
    observation: place.source_observation,
    pilot: place.pilot ?? null,
    source_sha256: place.provenance.source_record_sha256,
    website_verification: place.website_verification,
  });
  if (excerpt.length > 19_000) {
    throw new Error("Oversized source evidence");
  }
  return {
    externalId: place.source_id,
    name: place.name,
    provider: "overture_places",
    ...(place.address ? { physicalAddress: place.address } : {}),
    reportedClaims: [
      {
        field: "sourceCategory",
        value: String(place.category ?? "unknown").slice(0, 2000),
      },
      { field: "websiteVerification", value: place.website_verification },
      ...(place.website
        ? [{ field: "unverifiedWebsiteCandidate", value: place.website }]
        : []),
      { field: "overtureRelease", value: place.provenance.release },
      ...(place.pilot
        ? [
            { field: "discoveryStage", value: place.pilot.stage },
            {
              field: "gateAScorecard",
              value: JSON.stringify(place.pilot.gate_a).slice(0, 2000),
            },
            {
              field: "gateBScorecard",
              value: JSON.stringify(place.pilot.gate_b).slice(0, 2000),
            },
            {
              field: "websiteCheck",
              value: JSON.stringify(place.pilot.website_check).slice(0, 2000),
            },
          ]
        : []),
    ],
    retrievedAt: new Date(),
    sourceExcerpt: excerpt,
    sourceTitle: "Overture Maps Places — source-reported business record",
    sourceUri: "https://docs.overturemaps.org/gers/registry/",
  };
}
export function queryPlaces(
  bbox: string,
  category: string,
  limit: number,
  python = "python3"
): Promise<Place[]> {
  if (
    !(BBOX.test(bbox) && Number.isInteger(limit)) ||
    limit < 1 ||
    limit > 50 ||
    !category ||
    category.length > 100
  ) {
    throw new Error("Invalid market bounds");
  }
  const root = resolve(import.meta.dirname, "../../..");
  const program = [
    "import json,sys",
    "sys.path.insert(0," +
      JSON.stringify(resolve(root, "tools/discovery")) +
      ")",
    "from overture import fetch_places,resolve_exact_locations",
    "from run import inspect_candidate",
    "bbox=tuple(map(float,sys.argv[1].split(',')))",
    "rows=resolve_exact_locations(fetch_places(bbox,category=sys.argv[2],limit=int(sys.argv[3])))",
    "for idx, row in enumerate(rows):",
    "  result=inspect_candidate(row,audit=idx<min(len(rows),2))",
    "  row['pilot']={k:result[k] for k in ('gate_a','gate_b','website_check','bdna','stage')}",
    "print(json.dumps(rows,default=str))",
  ].join("\n");
  return new Promise((done, reject) => {
    const proc = spawn(python, ["-c", program, bbox, category, String(limit)], {
      cwd: root,
      env: {
        // Rivet uses an isolated HOME for native actor locks, but the Python
        // discovery interpreter requires its own installed site packages and
        // DuckDB httpfs extension cache. Do not inherit worker credentials.
        HOME: userInfo().homedir,
        PATH: process.env.PATH ?? "/usr/bin:/bin",
      },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), 120_000);
    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString();
      if (output.length > 2_000_000) {
        proc.kill("SIGKILL");
      }
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error("Overture source unavailable"));
      }
      try {
        const rows: unknown = JSON.parse(output);
        if (!Array.isArray(rows) || rows.length > limit) {
          throw new Error("Invalid result");
        }
        done(rows as Place[]);
      } catch {
        reject(new Error("Invalid Overture result"));
      }
    });
  });
}
export async function admitPlaces(
  config: {
    db: ReturnType<typeof createDb>;
    userId: string;
    workspaceId: string;
  },
  rows: Place[]
) {
  const totals = {
    created: 0,
    discovered: rows.length,
    duplicate: 0,
    queued: 0,
  };
  for (const row of rows) {
    const source = asSource(row);
    // biome-ignore lint/performance/noAwaitInLoops: serialize admission by workspace
    const admitted = await admitSourcedProspect(
      config.db,
      config.userId,
      config.workspaceId,
      source
    );
    if (admitted.kind === "not_found") {
      throw new Error("Workspace operator not authorized");
    }
    if (admitted.kind === "duplicate") {
      // Replaying an existing identity is not a new queued job; evidence
      // updates across Overture releases require a separate verified path.
      totals.duplicate += 1;
      continue;
    }
    totals.created += 1;
    const idempotency =
      "overture_" +
      source.externalId.replaceAll("-", "").slice(0, 32) +
      "_" +
      row.provenance.release.replaceAll("-", "_").replaceAll(".", "_");
    const queued = await enqueueWorkspaceJob(
      config.db,
      config.userId,
      config.workspaceId,
      admitted.prospectId,
      idempotency.slice(0, 63)
    );
    if (queued.kind !== "created") {
      throw new Error("Neon outbox admission conflict");
    }
    totals.queued += 1;
  }
  return totals;
}
export async function runBatch(config: {
  db: ReturnType<typeof createDb>;
  userId: string;
  workspaceId: string;
  bbox: string;
  category: string;
  limit: number;
  python?: string;
}) {
  const rows = await queryPlaces(
    config.bbox,
    config.category,
    config.limit,
    config.python
  );
  return admitPlaces(config, rows);
}

if (process.argv[1]?.endsWith("/overture-batch.ts")) {
  const { env } = process;
  if (
    env.OVERTURE_DISCOVERY_ENABLED !== "1" ||
    env.PSTUDIO_STAGING_ONLY !== "1" ||
    !env.DATABASE_URL?.includes("pstudio_staging_worker_20261113") ||
    !env.DISCOVERY_WORKSPACE_ID ||
    !env.DISCOVERY_OPERATOR_TOKEN_FILE ||
    env.DISCOVERY_OPERATOR_USER_ID
  ) {
    throw new Error("Private verified staging discovery is not configured");
  }
  const verify = createNeonTokenVerifier({
    issuer: env.NEON_AUTH_BASE_URL,
    jwksUrl: env.NEON_AUTH_JWKS_URL,
  });
  resolveVerifiedDiscoveryOperator({
    stagingOnly: true,
    tokenFile: env.DISCOVERY_OPERATOR_TOKEN_FILE,
    verify,
  })
    .then((userId) =>
      runBatch({
        bbox: env.DISCOVERY_BBOX ?? "",
        category: env.DISCOVERY_CATEGORY ?? "%plumb%",
        db: createDb({ DATABASE_URL: env.DATABASE_URL as string }),
        limit: Number(env.DISCOVERY_LIMIT ?? "25"),
        python: env.DISCOVERY_PYTHON,
        userId,
        workspaceId: env.DISCOVERY_WORKSPACE_ID as string,
      })
    )
    .then((x) =>
      console.log(JSON.stringify({ event: "neon_discovery_outbox", ...x }))
    )
    .catch(() => {
      console.error("Verified staging discovery batch failed");
      process.exitCode = 1;
    });
}
