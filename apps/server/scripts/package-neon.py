"""Package all tsdown ESM chunks for a Neon Functions nodejs24 deployment."""
from __future__ import annotations

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("dist-neon"))
    parser.add_argument("--output", type=Path, default=Path("dist-neon/function.zip"))
    args = parser.parse_args()

    source = args.source.resolve()
    entry = source / "neon-api.mjs"
    if not entry.is_file() or entry.is_symlink():
        parser.error(f"compiled handler not found: {entry}")

    scripts = sorted(source.glob("*.mjs"))
    if any(not path.is_file() or path.is_symlink() for path in scripts):
        parser.error("compiled bundles must be regular files")

    target = args.output.resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for path in scripts:
            archive.write(path, "index.mjs" if path.name == "neon-api.mjs" else path.name)

    with ZipFile(target) as archive:
        expected = {"index.mjs", *(p.name for p in scripts if p != entry)}
        if set(archive.namelist()) != expected or archive.testzip() is not None:
            raise RuntimeError("Neon Functions bundle integrity check failed")
    print(f"Packaged {len(scripts)} modules into {target}")


if __name__ == "__main__":
    main()
