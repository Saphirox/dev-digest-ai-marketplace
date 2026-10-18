#!/usr/bin/env python3
"""Build the static catalog served by the GitHub Pages site.

Reads marketplace.json and every local plugin, and writes:
  site/public/api/catalog.json   plugins + searchable artifacts (skills, agents, commands, hooks, MCP servers)
  site/public/llms.txt           the same catalog as Markdown for agents

Usage:
  python3 scripts/build_catalog.py [--out site/public] [--repo owner/name]
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARKETPLACE = ROOT / ".claude-plugin" / "marketplace.json"
DEFAULT_REPO = "Saphirox/dev-digest-ai-marketplace"
BODY_LIMIT = 4000  # chars of Markdown body kept for search


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    # A stray non-UTF-8 byte in one plugin file must not fail the whole site build.
    return path.read_text(encoding="utf-8", errors="replace")


def inside(path: Path, root: Path) -> bool:
    path, root = path.resolve(), root.resolve()
    return path == root or root in path.parents


def parse_scalar(value: str):
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        return value[1:-1]
    if value in {"true", "false"}:
        return value == "true"
    return value


def split_frontmatter(text: str) -> tuple[dict, str]:
    """Parse the YAML subset used in SKILL.md / agent / command frontmatter.

    Supports `key: value`, quoted values, `- item` lists
    and `>` / `|` block scalars. Returns (fields, body).
    """
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    lines = text[4:end].splitlines()
    body = text[end + 4:].lstrip("-").lstrip("\n")
    fields: dict = {}
    i = 0
    while i < len(lines):
        m = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", lines[i])
        i += 1
        if not m:
            continue
        key, raw = m.group(1), m.group(2).strip()
        # `key:` followed by an indented block, or by a `- item` list that YAML also allows unindented.
        bare_list = raw == "" and i < len(lines) and lines[i].startswith("- ")
        if raw in {">", "|", ">-", "|-", ">+", "|+"} or bare_list or (raw == "" and i < len(lines) and lines[i].startswith("  ")):
            block = []
            while i < len(lines) and (lines[i].startswith(" ") or (bare_list and lines[i].startswith("- ")) or not lines[i].strip()):
                block.append(lines[i].strip())
                i += 1
            items = [b[2:].strip() for b in block if b.startswith("- ")]
            if items and len(items) == len([b for b in block if b]):
                fields[key] = [parse_scalar(x) for x in items]
            else:
                sep = "\n" if raw.startswith("|") else " "
                fields[key] = sep.join(block).strip()
        else:
            fields[key] = parse_scalar(raw)
    return fields, body


def as_list(value) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    value = str(value).strip()
    if value.startswith("[") and value.endswith("]"):
        value = value[1:-1]
    return [parse_scalar(v) for v in value.split(",") if v.strip()]


def split_trigger(description: str) -> tuple[str, str]:
    """Split 'Does X. Use when Y.' into ('Does X.', 'Y.')."""
    m = re.search(r"\buse (?:this )?when\b[:,]?\s*", description, re.IGNORECASE)
    if not m:
        return description.strip(), ""
    return description[: m.start()].strip(), description[m.end():].strip()


def git_updated(path: Path) -> str | None:
    res = subprocess.run(
        ["git", "log", "-1", "--format=%cI", "--", str(path)],
        cwd=ROOT, capture_output=True, text=True,
    )
    return res.stdout.strip() or None if res.returncode == 0 else None


def parse_changelog(path: Path) -> list[dict]:
    if not path.is_file():
        return []
    entries, current = [], None
    for line in read_text(path).splitlines():
        m = re.match(r"^##\s+\[?([^\]\s]+)\]?(?:\s*[-–—]\s*(\d{4}-\d{2}-\d{2}))?", line)
        if m:
            current = {"version": m.group(1), "date": m.group(2), "body": ""}
            entries.append(current)
        elif current is not None:
            current["body"] += line + "\n"
    for e in entries:
        e["body"] = e["body"].strip()
    return entries


def component_paths(manifest: dict, key: str, plugin_dir: Path, default: str, pattern: str) -> list[Path]:
    """Default component directory plus any extra paths listed in plugin.json."""
    paths = sorted((plugin_dir / default).glob(pattern)) if (plugin_dir / default).is_dir() else []
    for extra in as_list(manifest.get(key)) if isinstance(manifest.get(key), (str, list)) else []:
        p = (plugin_dir / extra).resolve()
        if not inside(p, plugin_dir):
            continue
        paths += sorted(p.glob(pattern)) if p.is_dir() else [p] if p.is_file() else []
    seen, out = set(), []
    for p in paths:
        # Also drops symlinks that point outside the plugin.
        if inside(p, plugin_dir) and p.resolve() not in seen:
            seen.add(p.resolve())
            out.append(p)
    return out


def inline_or_file(manifest: dict, key: str, plugin_dir: Path, default: str) -> tuple[dict, Path | None]:
    """Config given inline in plugin.json, or in a JSON file inside the plugin. Returns (config, source file)."""
    value = manifest.get(key)
    if isinstance(value, dict):
        manifest_path = plugin_dir / ".claude-plugin" / "plugin.json"
        return value, manifest_path if manifest_path.is_file() else None
    path = (plugin_dir / (value if isinstance(value, str) else default)).resolve()
    if not inside(path, plugin_dir) or not path.is_file():
        return {}, None
    try:
        data = load_json(path)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}, path
    return (data if isinstance(data, dict) else {}), path


def build_plugin(entry: dict, repo: str) -> tuple[dict, list[dict]]:
    name = entry["name"]
    source = entry.get("source")
    blob = f"https://github.com/{repo}/blob/main"
    plugin = {
        "name": name,
        "displayName": entry.get("displayName"),
        "description": entry.get("description", ""),
        "category": entry.get("category"),
        "tags": entry.get("tags", []),
        "keywords": [],
        "version": None,
        "author": None,
        "license": None,
        "homepage": None,
        "external": not isinstance(source, str),
        "path": None,
        "updatedAt": None,
        "readme": "",
        "changelog": [],
        "counts": {},
        "touches": {"hooks": [], "mcpServers": [], "scripts": [], "allowedTools": []},
    }
    artifacts: list[dict] = []

    def add(kind: str, art_name: str, description: str, path: Path | None, **extra):
        rel = path.relative_to(ROOT).as_posix() if path else None
        # Ids must be unique: the search index rejects duplicates (e.g. two skills with the same `name`).
        art_id, n = f"{name}/{kind}/{art_name}", 2
        while any(a["id"] == art_id for a in artifacts):
            art_id, n = f"{name}/{kind}/{art_name}~{n}", n + 1
        artifacts.append({
            "id": art_id,
            "type": kind,
            "name": art_name,
            "plugin": name,
            "description": description,
            "trigger": extra.pop("trigger", ""),
            "invoke": extra.pop("invoke", ""),
            "url": f"{blob}/{rel}" if rel else None,
            "body": extra.pop("body", "")[:BODY_LIMIT],
            "allowedTools": extra.pop("allowedTools", []),
            **extra,
        })

    if plugin["external"]:
        add("plugin", name, plugin["description"], None, invoke=f"/plugin install {name}@dev-digest")
        return plugin, artifacts

    plugin_dir = (ROOT / source).resolve()
    manifest_path = plugin_dir / ".claude-plugin" / "plugin.json"
    manifest = load_json(manifest_path) if manifest_path.is_file() else {}  # plugin.json is optional
    author = manifest.get("author")
    plugin.update({
        "displayName": entry.get("displayName") or manifest.get("displayName"),
        "description": entry.get("description") or manifest.get("description", ""),
        "keywords": manifest.get("keywords", []),
        "version": manifest.get("version"),
        "author": author if isinstance(author, dict) else ({"name": author} if author else None),
        "license": manifest.get("license"),
        "homepage": manifest.get("homepage"),
        "path": plugin_dir.relative_to(ROOT).as_posix(),
        "updatedAt": git_updated(plugin_dir),
        "readme": read_text(plugin_dir / "README.md") if (plugin_dir / "README.md").is_file() else "",
        "changelog": parse_changelog(plugin_dir / "CHANGELOG.md"),
    })

    for skill_md in component_paths(manifest, "skills", plugin_dir, "skills", "*/SKILL.md"):
        fm, body = split_frontmatter(read_text(skill_md))
        skill = str(fm.get("name") or skill_md.parent.name)
        summary, trigger = split_trigger(str(fm.get("description", "")))
        tools = as_list(fm.get("allowed-tools"))
        plugin["touches"]["allowedTools"] += tools
        add("skill", skill, summary, skill_md, trigger=trigger, invoke=f"/{name}:{skill}", body=body, allowedTools=tools)

    for agent_md in component_paths(manifest, "agents", plugin_dir, "agents", "*.md"):
        fm, body = split_frontmatter(read_text(agent_md))
        agent = str(fm.get("name") or agent_md.stem)
        summary, trigger = split_trigger(str(fm.get("description", "")))
        tools = as_list(fm.get("tools"))
        plugin["touches"]["allowedTools"] += tools
        add("agent", agent, summary, agent_md, trigger=trigger, invoke=f"{name}:{agent}", body=body, allowedTools=tools)

    for cmd_md in component_paths(manifest, "commands", plugin_dir, "commands", "*.md"):
        fm, body = split_frontmatter(read_text(cmd_md))
        cmd = cmd_md.stem
        hint = fm.get("argument-hint")
        tools = as_list(fm.get("allowed-tools"))
        plugin["touches"]["allowedTools"] += tools
        add("command", cmd, str(fm.get("description", "")), cmd_md,
            invoke=f"/{name}:{cmd}" + (f" {hint}" if hint else ""), body=body, allowedTools=tools)

    hooks_cfg, hooks_path = inline_or_file(manifest, "hooks", plugin_dir, "hooks/hooks.json")
    # hooks.json wraps events in {"hooks": {...}}; accept the bare event map too (common when inline).
    hooks_cfg = hooks_cfg["hooks"] if isinstance(hooks_cfg.get("hooks"), dict) else hooks_cfg
    for event, groups in hooks_cfg.items():
        if not isinstance(groups, list):
            continue
        commands = []
        for group in groups:
            if not isinstance(group, dict):
                continue
            matcher = str(group.get("matcher") or "*")
            for hook in group.get("hooks") if isinstance(group.get("hooks"), list) else []:
                if not isinstance(hook, dict):
                    continue
                cmd = str(hook.get("command") or hook.get("prompt") or hook.get("type") or "")
                commands.append(cmd)
                plugin["touches"]["hooks"].append({"event": event, "matcher": matcher, "command": cmd})
        add("hook", event, f"Runs on {event}: " + "; ".join(commands), hooks_path,
            invoke=f"Runs automatically on {event}")

    mcp_cfg, mcp_path = inline_or_file(manifest, "mcpServers", plugin_dir, ".mcp.json")
    servers = mcp_cfg["mcpServers"] if isinstance(mcp_cfg.get("mcpServers"), dict) else mcp_cfg
    for server, cfg in servers.items():
        if not isinstance(cfg, dict):
            continue
        args = cfg.get("args") if isinstance(cfg.get("args"), list) else []
        launch = str(cfg.get("url") or " ".join([str(cfg.get("command", ""))] + [str(a) for a in args]).strip())
        plugin["touches"]["mcpServers"].append({"name": server, "launch": launch})
        add("mcp", server, f"MCP server: {launch}", mcp_path, invoke=f"MCP server {server}")

    scripts_dir = plugin_dir / "scripts"
    if scripts_dir.is_dir():
        plugin["touches"]["scripts"] = sorted(
            p.relative_to(plugin_dir).as_posix() for p in scripts_dir.rglob("*") if p.is_file()
        )
    plugin["touches"]["allowedTools"] = sorted(set(plugin["touches"]["allowedTools"]))

    counts: dict[str, int] = {}
    for a in artifacts:
        counts[a["type"]] = counts.get(a["type"], 0) + 1
    plugin["counts"] = counts

    add("plugin", name, plugin["description"], manifest_path if manifest_path.is_file() else None,
        invoke=f"/plugin install {name}@dev-digest", body=plugin["readme"])
    return plugin, artifacts


def render_llms_txt(catalog: dict) -> str:
    m = catalog["marketplace"]
    lines = [
        f"# {m['name']}",
        "",
        f"> {m['description']}",
        "",
        f"Add the marketplace: `/plugin marketplace add {m['repo']}`",
        f"Install a plugin: `/plugin install <plugin>@{m['name']}`",
        "Machine-readable catalog: ./api/catalog.json",
        "",
        "## Plugins",
        "",
    ]
    for p in catalog["plugins"]:
        version = f" v{p['version']}" if p["version"] else ""
        lines.append(f"### {p['name']}{version}")
        lines.append("")
        lines.append(p["description"])
        lines.append("")
        for a in catalog["artifacts"]:
            if a["plugin"] == p["name"] and a["type"] != "plugin":
                trigger = f" Use when {a['trigger']}" if a["trigger"] else ""
                lines.append(f"- {a['type']} `{a['name']}`: {a['description']}{trigger}")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(ROOT / "site" / "public"))
    ap.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY") or DEFAULT_REPO)
    args = ap.parse_args()

    market = load_json(MARKETPLACE)
    plugins, artifacts = [], []
    for entry in market.get("plugins", []):
        plugin, arts = build_plugin(entry, args.repo)
        plugins.append(plugin)
        artifacts += arts

    catalog = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "marketplace": {
            "name": market["name"],
            "description": market.get("description", ""),
            "owner": market.get("owner"),
            "repo": args.repo,
        },
        "plugins": plugins,
        "artifacts": artifacts,
    }

    out = Path(args.out)
    (out / "api").mkdir(parents=True, exist_ok=True)
    (out / "api" / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (out / "llms.txt").write_text(render_llms_txt(catalog), encoding="utf-8")
    print(f"Catalog: {len(plugins)} plugins, {len(artifacts)} artifacts -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
