"""Shared helpers for release.py, rollback.py and check_invariants.py."""
import contextlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKETPLACE = ROOT / ".claude-plugin" / "marketplace.json"
# Plain X.Y.Z only: this marketplace has no prerelease channel.
SEMVER_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")
VERSION_HEADING_RE = re.compile(r"^## \[?(\d+\.\d+\.\d+)\]?")
ROLLBACK_NOTE = "Rollback: restores the contents of {target} (reverts {reverted})."
ROLLBACK_NOTE_RE = re.compile(r"Rollback: restores the contents of (\S+) \(reverts (\S+)\)\.")


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def run(*cmd: str, capture: bool = False) -> str:
    exe = shutil.which(cmd[0]) or cmd[0]  # resolves claude.cmd / git.exe on Windows
    res = subprocess.run((exe, *cmd[1:]), cwd=ROOT, text=True, capture_output=capture)
    if res.returncode != 0:
        if capture:
            sys.stderr.write(res.stdout + res.stderr)
        die(f"command failed: {' '.join(cmd)}")
    return res.stdout.strip() if capture else ""


def git(*args: str) -> str:
    return run("git", *args, capture=True)


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def require_clean_tree() -> None:
    if git("status", "--porcelain"):
        die("working tree is not clean; commit or stash your changes first")


def fetch_tags() -> None:
    # Release tags are created by CI, so a local clone may not have them yet.
    if "origin" not in git("remote").split():
        return
    res = subprocess.run(["git", "fetch", "--tags", "--quiet", "origin"], cwd=ROOT, capture_output=True, text=True)
    if res.returncode != 0:
        print("warning: could not fetch tags from origin; using local tags only", file=sys.stderr)


def plugin_dir(name: str) -> Path:
    market = json.loads(MARKETPLACE.read_text(encoding="utf-8"))
    for entry in market.get("plugins", []):
        if entry.get("name") == name:
            source = entry.get("source")
            if not isinstance(source, str):
                die(f"'{name}' is an external plugin; release it in its own repo")
            return (ROOT / source).resolve()
    die(f"plugin '{name}' is not listed in marketplace.json")


def manifest_path(pdir: Path) -> Path:
    return pdir / ".claude-plugin" / "plugin.json"


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8", newline="\n")


def read_version(pdir: Path) -> str:
    version = json.loads(manifest_path(pdir).read_text(encoding="utf-8")).get("version")
    if not isinstance(version, str) or not SEMVER_RE.match(version):
        die(f"{rel(manifest_path(pdir))}: top-level \"version\" must be X.Y.Z, got {version!r}")
    return version


def write_version(pdir: Path, version: str) -> None:
    path = manifest_path(pdir)
    data = json.loads(path.read_text(encoding="utf-8"))
    data["version"] = version
    write_text(path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    if read_version(pdir) != version:
        die(f"failed to write version to {rel(path)}")


def bump(version: str, part: str) -> str:
    major, minor, patch = version_key(version)
    if part == "major":
        return f"{major + 1}.0.0"
    if part == "minor":
        return f"{major}.{minor + 1}.0"
    if part == "patch":
        return f"{major}.{minor}.{patch + 1}"
    if SEMVER_RE.match(part):
        return part
    die(f"expected patch|minor|major|X.Y.Z, got '{part}'")


def version_key(version: str) -> tuple[int, int, int]:
    m = SEMVER_RE.match(version)
    if not m:
        die(f"'{version}' is not a plain X.Y.Z version")
    return tuple(int(x) for x in m.groups())


def tag_name(name: str, version: str) -> str:
    # Same format `claude plugin tag` creates.
    return f"{name}--v{version}"


def released_versions(name: str) -> list[str]:
    tags = git("tag", "--list", f"{name}--v*").split()
    versions = [t.removeprefix(f"{name}--v") for t in tags]
    return sorted((v for v in versions if SEMVER_RE.match(v)), key=version_key)


def rollback_history(pdir: Path) -> dict[str, str]:
    """Map of rollback release -> version whose contents it restored, plus reverted versions -> ''."""
    path = pdir / "CHANGELOG.md"
    history: dict[str, str] = {}
    if not path.is_file():
        return history
    current = None
    for line in path.read_text(encoding="utf-8").splitlines():
        if m := VERSION_HEADING_RE.match(line):
            current = m.group(1)
        elif current and (m := ROLLBACK_NOTE_RE.search(line)):
            history[current] = m.group(1)
            history.setdefault(m.group(2), "")
    return history


def prepend_changelog(pdir: Path, version: str, notes: list[str]) -> None:
    """Insert a section above the newest version heading (below the title and any 'Unreleased')."""
    path = pdir / "CHANGELOG.md"
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else ["# Changelog"]
    section = [f"## {version}", ""] + [f"- {n}" for n in notes] + [""]

    insert_at, in_fence = len(lines), False
    for i, line in enumerate(lines):
        if line.lstrip().startswith(("```", "~~~")):
            in_fence = not in_fence
        elif not in_fence and VERSION_HEADING_RE.match(line):
            insert_at = i
            break
    head = lines[:insert_at]
    while head and not head[-1].strip():
        head.pop()
    out = head + ([""] if head else []) + section + lines[insert_at:]
    write_text(path, "\n".join(out).rstrip("\n") + "\n")


def has_changelog_entry(pdir: Path, version: str) -> bool:
    path = pdir / "CHANGELOG.md"
    if not path.is_file():
        return False
    return any(
        (m := VERSION_HEADING_RE.match(line)) and m.group(1) == version
        for line in path.read_text(encoding="utf-8").splitlines()
    )


def validate(pdir: Path) -> None:
    run("claude", "plugin", "validate", ".", "--strict")
    run("claude", "plugin", "validate", rel(pdir), "--strict")
    run(sys.executable, "scripts/check_invariants.py")


@contextlib.contextmanager
def restore_on_failure(pdir: Path):
    """Undo every change under pdir if anything inside the block fails."""
    try:
        yield
    except BaseException:
        path = rel(pdir)
        subprocess.run(["git", "reset", "-q", "HEAD", "--", path], cwd=ROOT)
        subprocess.run(["git", "checkout", "-q", "HEAD", "--", path], cwd=ROOT)
        subprocess.run(["git", "clean", "-fdq", "--", path], cwd=ROOT)
        print(f"Aborted; restored {path} to HEAD.", file=sys.stderr)
        raise


def commit(pdir: Path, message: str) -> None:
    git("add", "-A", "--", rel(pdir))
    run("git", "commit", "-q", "-m", message)
