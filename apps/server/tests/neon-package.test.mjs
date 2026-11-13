import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const script = resolve("apps/server/scripts/package-neon.py");

test("Neon ZIP includes every linked ESM chunk and no secret files", () => {
  const root = mkdtempSync(join(tmpdir(), "pstudio-neon-package-"));
  try {
    const source = join(root, "dist-neon");
    mkdirSync(source);
    writeFileSync(
      join(source, "neon-api.mjs"),
      'import "./shared-TEST.mjs"; export default { fetch: () => new Response("ok") };'
    );
    writeFileSync(join(source, "shared-TEST.mjs"), "export const answer = 42;");
    writeFileSync(join(source, ".env"), "NEVER_INCLUDE_SECRET=1");
    const archive = join(root, "function.zip");
    const result = spawnSync(
      "python3",
      [script, "--source", source, "--output", archive],
      { encoding: "utf8" }
    );
    assert.equal(result.status, 0, result.stderr);
    const inspect = spawnSync(
      "python3",
      [
        "-c",
        `import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(','.join(sorted(z.namelist()))); print(z.read('index.mjs').decode())`,
        archive,
      ],
      { encoding: "utf8" }
    );
    assert.equal(inspect.status, 0, inspect.stderr);
    assert.ok(inspect.stdout.includes("index.mjs,shared-TEST.mjs"));
    assert.ok(!inspect.stdout.includes(".env"));
    assert.ok(inspect.stdout.includes('import "./shared-TEST.mjs"'));
    assert.ok(readFileSync(archive).length > 0);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("Neon packaging fails closed if the compiled handler is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "pstudio-neon-package-missing-"));
  try {
    writeFileSync(join(root, "unrelated.mjs"), "console.log('not an entry')");
    const result = spawnSync(
      "python3",
      [script, "--source", root, "--output", join(root, "bundle.zip")],
      { encoding: "utf8" }
    );
    assert.notEqual(result.status, 0);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
