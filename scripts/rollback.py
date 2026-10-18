#!/usr/bin/env python3
"""Roll a plugin back to the contents of an earlier release.

Usage:
  python3 scripts/rollback.py <plugin> [--to X.Y.Z] [--dry-run]

Users only receive an update when the version string changes, so a rollback
rolls *forward*: the plugin directory is restored from tag <plugin>--v<to>,
and the version becomes a patch bump of the current one. Example: 1.2.0 is
broken -> 1.2.1 ships the files of 1.1.0. CHANGELOG history is kept, and the
rollback is recorded there so later rollbacks skip reverted versions.

--to defaults to the newest good release older than what is currently shipped.
If anything fails, the plugin directory is restored to HEAD.
"""
import argparse
import sys

from plugin_lib import (
    ROLLBACK_NOTE, bump, commit, die, fetch_tags, git, plugin_dir, prepend_changelog,
    read_version, rel, released_versions, require_clean_tree, restore_on_failure,
    rollback_history, tag_name, validate, version_key, write_version,
)


def default_target(versions: list[str], current: str, history: dict[str, str]) -> str:
    # If the current release is itself a rollback, "what is shipped" is the version it restored.
    shipped = history.get(current) or current
    candidates = [
        v for v in versions
        if version_key(v) < version_key(shipped) and v not in history  # skip reverted and rollback releases
    ]
    if not candidates:
        die(f"no good release older than {shipped} to roll back to; pass --to")
    return candidates[-1]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("plugin")
    ap.add_argument("--to", help="released version to restore (default: previous good release)")
    ap.add_argument("--dry-run", action="store_true", help="print the plan without changing anything")
    args = ap.parse_args()

    fetch_tags()
    pdir = plugin_dir(args.plugin)
    path = rel(pdir)
    current = read_version(pdir)
    versions = released_versions(args.plugin)
    history = rollback_history(pdir)

    if args.to:
        target = args.to
        if target not in versions:
            die(f"no tag {tag_name(args.plugin, target)}; released: {', '.join(versions) or 'none'}")
        if version_key(target) >= version_key(current):
            die(f"--to {target} must be older than the current version {current}")
        if target in history and not history[target]:
            print(f"warning: {target} was rolled back earlier; restoring it anyway", file=sys.stderr)
    else:
        target = default_target(versions, current, history)

    new = bump(current, "patch")
    if new in versions:
        die(f"tag {tag_name(args.plugin, new)} already exists; release a higher version manually")
    print(f"{args.plugin}: {current} -> {new} (contents of {target})")
    if args.dry_run:
        return

    require_clean_tree()
    changelog = (pdir / "CHANGELOG.md").read_text(encoding="utf-8")
    with restore_on_failure(pdir):
        # Replace the directory with the tagged snapshot, dropping files added since.
        git("rm", "-r", "-q", "--", path)
        git("checkout", tag_name(args.plugin, target), "--", path)
        (pdir / "CHANGELOG.md").write_text(changelog, encoding="utf-8", newline="\n")
        write_version(pdir, new)
        prepend_changelog(pdir, new, [ROLLBACK_NOTE.format(target=target, reverted=current)])
        validate(pdir)
        commit(pdir, f"rollback({args.plugin}): v{new} restores v{target}\n\nRollback-Of: {current}")
    print(f"\nCommitted. Push to main; CI tags {tag_name(args.plugin, new)}.")
    print("Users pick it up on the next marketplace update (or /plugin marketplace update dev-digest).")


if __name__ == "__main__":
    main()
