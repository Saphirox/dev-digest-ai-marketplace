#!/usr/bin/env python3
"""Repo invariants that `claude plugin validate` does not check.

Usage:
  python3 scripts/check_invariants.py                 # structural checks
  python3 scripts/check_invariants.py --base origin/main
                                                      # + require a version increase for changed plugins
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from plugin_lib import SEMVER_RE, has_changelog_entry, tag_name, version_key

ROOT = Path(__file__).resolve().parent.parent
MARKETPLACE = ROOT / ".claude-plugin" / "marketplace.json"
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")
RESERVED_PREFIXES = ("claude-", "anthropic-", "anthropics-", "cc-plugin-")
SKILL_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
SKIP_DIRS = {".git", "node_modules", ".model-cache"}  # VCS and site dependency output (site/dist is gitignored)
# Bidi controls and zero-width characters (trojan-source). BOM is allowed only at file start.
HIDDEN_RE = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]")

errors: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        err(f"{path.relative_to(ROOT)}: invalid JSON ({e})")
        return None


def git_lines(*args: str) -> list[str]:
    res = subprocess.run(["git", *args, "-z"], cwd=ROOT, capture_output=True, text=True, check=True)
    return [p for p in res.stdout.split("\0") if p]


def check_hidden_unicode() -> None:
    # Tracked files plus new, non-ignored ones: exactly what would be committed.
    for name in git_lines("ls-files", "--cached", "--others", "--exclude-standard"):
        path = ROOT / name
        if SKIP_DIRS.intersection(Path(name).parts) or not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue  # binary
        text = text.removeprefix("\ufeff")
        for lineno, line in enumerate(text.splitlines(), 1):
            if HIDDEN_RE.search(line):
                err(f"{name}:{lineno}: hidden/bidi Unicode character")


def parse_frontmatter(text: str) -> dict[str, str] | None:
    """Top-level scalar fields of YAML frontmatter, including quoted values and > / | block scalars."""
    text = text.replace("\r\n", "\n").removeprefix("\ufeff")
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---", 4)
    if end == -1:
        return None
    lines = text[4:end].splitlines()
    fields, i = {}, 0
    while i < len(lines):
        m = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", lines[i])
        i += 1
        if not m:
            continue
        key, raw = m.group(1), m.group(2).strip()
        if raw[:1] in {">", "|"}:
            block = []
            while i < len(lines) and (lines[i].startswith((" ", "\t")) or not lines[i].strip()):
                block.append(lines[i].strip())
                i += 1
            fields[key] = ("\n" if raw[0] == "|" else " ").join(block).strip()
        elif len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "\"'":
            fields[key] = raw[1:-1]
        else:
            fields[key] = raw
    return fields


def check_skills(plugin_dir: Path) -> None:
    for skill_md in sorted(plugin_dir.glob("skills/*/SKILL.md")):
        rel = skill_md.relative_to(ROOT).as_posix()
        fm = parse_frontmatter(skill_md.read_text(encoding="utf-8"))
        if fm is None:
            err(f"{rel}: missing or malformed YAML frontmatter")
            continue
        name, desc = fm.get("name", ""), fm.get("description", "")
        if not SKILL_NAME_RE.match(name):
            err(f"{rel}: invalid skill name '{name}'")
        elif name != skill_md.parent.name:
            err(f"{rel}: skill name '{name}' != directory '{skill_md.parent.name}'")
        if not desc:
            err(f"{rel}: missing description")
        elif len(desc) > 1024:
            err(f"{rel}: description is {len(desc)} chars (max 1024)")
        elif "use when" not in desc.lower():
            err(f"{rel}: description should contain a 'Use when ...' trigger")


AGENT_IGNORED_FIELDS = ("hooks", "mcpServers", "permissionMode")  # ignored for plugin agents


def check_agents(plugin_dir: Path, skills_by_plugin: dict[str, set[str]]) -> None:
    for agent_md in sorted(plugin_dir.glob("agents/*.md")):
        rel = agent_md.relative_to(ROOT).as_posix()
        text = agent_md.read_text(encoding="utf-8")
        fm = parse_frontmatter(text)
        if fm is None:
            err(f"{rel}: missing or malformed YAML frontmatter")
            continue
        if fm.get("name") != agent_md.stem:
            err(f"{rel}: agent name '{fm.get('name', '')}' != file name '{agent_md.stem}'")
        if not fm.get("description"):
            err(f"{rel}: missing description")
        for field in AGENT_IGNORED_FIELDS:
            if field in fm:
                err(f"{rel}: '{field}' is ignored for plugin agents; use the plugin's hooks/hooks.json")
        header = text.replace("\r\n", "\n").split("\n---", 1)[0]
        for skill in re.findall(r"(?m)^skills:\n((?:\s+- .*\n?)+)", header + "\n"):
            for ref in re.findall(r"- (\S+)", skill):
                plugin, _, name = ref.rpartition(":")
                plugin = plugin or plugin_dir.name
                if name not in skills_by_plugin.get(plugin, set()):
                    err(f"{rel}: preloaded skill '{ref}' not found in plugin '{plugin}'")


def check_dependencies(where: str, manifest: dict, names: list[str]) -> None:
    for dep in manifest.get("dependencies", []):
        dep_name = dep.get("name") if isinstance(dep, dict) else str(dep).split("@")[0]
        if isinstance(dep, str) and "@" in dep or isinstance(dep, dict) and dep.get("marketplace"):
            continue  # another marketplace; not checked here
        if dep_name not in names:
            err(f"{where}: dependency '{dep_name}' is not a plugin in this marketplace")


def check_name(where: str, name: str) -> None:
    if not NAME_RE.match(name):
        err(f"{where}: name must match {NAME_RE.pattern}")
    elif name.startswith(RESERVED_PREFIXES):
        err(f"{where}: names starting with {', '.join(RESERVED_PREFIXES)} are reserved")


def plugin_version_at(ref: str, plugin_json: Path) -> str | None:
    rel = plugin_json.relative_to(ROOT).as_posix()
    res = subprocess.run(["git", "show", f"{ref}:{rel}"], cwd=ROOT, capture_output=True, text=True)
    if res.returncode != 0:
        return None  # new plugin
    try:
        return json.loads(res.stdout).get("version")
    except json.JSONDecodeError:
        return None


def tag_exists(tag: str) -> bool:
    return subprocess.run(
        ["git", "rev-parse", "-q", "--verify", f"refs/tags/{tag}"], cwd=ROOT, capture_output=True
    ).returncode == 0


def check_version_bumps(base: str, entries: list[dict]) -> None:
    changed = git_lines("diff", "--name-only", f"{base}...HEAD")
    for entry in entries:
        source = entry.get("source")
        if not isinstance(source, str):
            continue
        prefix = source.removeprefix("./").rstrip("/") + "/"
        if not any(p.startswith(prefix) for p in changed):
            continue
        name = entry["name"]
        manifest_path = ROOT / source / ".claude-plugin" / "plugin.json"
        old = plugin_version_at(base, manifest_path)
        new = (load_json(manifest_path) or {}).get("version")
        if not isinstance(new, str) or not SEMVER_RE.match(new):
            continue  # reported by the structural checks
        if old is not None and SEMVER_RE.match(str(old)) and version_key(new) <= version_key(old):
            err(f"{name}: files changed but version {new} is not greater than {old}; "
                f"run scripts/release.py {name} patch|minor|major")
        if tag_exists(tag_name(name, new)) and old != new:
            err(f"{name}: tag {tag_name(name, new)} already exists; pick a new version")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", help="git ref to compare against for the version-increase check")
    args = ap.parse_args()

    market = load_json(MARKETPLACE)
    if market is None:
        return report()

    check_name("marketplace.json", market.get("name", ""))
    entries = market.get("plugins", [])
    names = [e.get("name", "") for e in entries]

    if len(names) != len(set(names)):
        err("marketplace.json: duplicate plugin names")
    if names != sorted(names):
        err("marketplace.json: plugins must be sorted by name")

    skills_by_plugin = {
        e.get("name", ""): {p.parent.name for p in (ROOT / e["source"]).glob("skills/*/SKILL.md")}
        for e in entries if isinstance(e.get("source"), str)
    }
    listed_dirs = set()
    for entry in entries:
        name = entry.get("name", "")
        where = f"marketplace.json[{name}]"
        check_name(where, name)
        if "version" in entry:
            err(f"{where}: set version only in plugin.json, not in the marketplace entry")
        desc = entry.get("description", "")
        if not 10 <= len(desc) <= 2000:
            err(f"{where}: description must be 10-2000 chars")

        source = entry.get("source")
        if not isinstance(source, str):
            src = source or {}
            if src.get("source") in {"github", "url", "git-subdir"} and not re.fullmatch(
                r"[0-9a-f]{40}", src.get("sha", "")
            ):
                err(f"{where}: external source must pin a full 40-char 'sha'")
            continue
        if not source.startswith("./") or ".." in source:
            err(f"{where}: relative source must start with './' and not contain '..'")
            continue

        plugin_dir = (ROOT / source).resolve()
        listed_dirs.add(plugin_dir)
        manifest_path = plugin_dir / ".claude-plugin" / "plugin.json"
        if not manifest_path.is_file():
            err(f"{where}: {source}/.claude-plugin/plugin.json not found")
            continue
        manifest = load_json(manifest_path)
        if manifest is None:
            continue
        if manifest.get("name") != name:
            err(f"{where}: plugin.json name '{manifest.get('name')}' != entry name")
        version = manifest.get("version")
        if not isinstance(version, str) or not SEMVER_RE.match(version):
            err(f"{where}: plugin.json needs a plain X.Y.Z 'version' (prereleases are not supported)")
        elif not has_changelog_entry(plugin_dir, version):
            err(f"{where}: CHANGELOG.md has no '## {version}' section")
        for required in ("description", "license"):
            if not manifest.get(required):
                err(f"{where}: plugin.json missing '{required}'")
        for required in ("README.md", "LICENSE", "CHANGELOG.md"):
            if not (plugin_dir / required).is_file():
                err(f"{where}: missing {required}")
        if (plugin_dir / "bin").exists():
            err(f"{where}: top-level bin/ is rejected by claude.ai; use scripts/")
        check_skills(plugin_dir)
        check_agents(plugin_dir, skills_by_plugin)
        check_dependencies(where, manifest, names)

    for d in sorted((ROOT / "plugins").iterdir()) if (ROOT / "plugins").is_dir() else []:
        if d.is_dir() and d.resolve() not in listed_dirs:
            err(f"plugins/{d.name}: directory not listed in marketplace.json")

    if args.base:
        check_version_bumps(args.base, entries)

    check_hidden_unicode()
    return report()


def report() -> int:
    if errors:
        print("Invariant check failed:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("All invariants hold.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
