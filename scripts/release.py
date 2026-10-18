#!/usr/bin/env python3
"""Prepare a plugin release: bump version, update CHANGELOG, validate, commit.

Usage:
  python3 scripts/release.py <plugin> <patch|minor|major|X.Y.Z> [-m NOTE ...] [--dry-run]

Without -m, changelog notes are taken from commit subjects that touched the
plugin since its last release tag (merge, wip and fixup commits are skipped);
review them, since they are user-facing. The git tag (<plugin>--v<version>)
is created by CI once the commit is on main (.github/workflows/tag-releases.yml).
If anything fails, the plugin directory is restored to HEAD.
"""
import argparse
import re

from plugin_lib import (
    bump, commit, die, fetch_tags, git, plugin_dir, prepend_changelog, read_version,
    rel, released_versions, require_clean_tree, restore_on_failure, tag_name,
    validate, version_key, write_version,
)

SKIP_SUBJECT_RE = re.compile(r"^(wip\b|fixup!|squash!|amend!|release\(|rollback\()", re.IGNORECASE)


def notes_since_last_release(name: str, pdir) -> list[str]:
    versions = released_versions(name)
    rng = [f"{tag_name(name, versions[-1])}..HEAD"] if versions else []
    subjects = git("log", "--no-merges", "--format=%s", *rng, "--", rel(pdir))
    return [s for s in subjects.splitlines() if s.strip() and not SKIP_SUBJECT_RE.match(s)]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("plugin")
    ap.add_argument("bump", help="patch | minor | major | X.Y.Z")
    ap.add_argument("-m", "--message", action="append", default=[], help="changelog note (repeatable)")
    ap.add_argument("--dry-run", action="store_true", help="print the plan without changing anything")
    args = ap.parse_args()

    fetch_tags()
    pdir = plugin_dir(args.plugin)
    current = read_version(pdir)
    new = bump(current, args.bump)
    if version_key(new) <= version_key(current):
        die(f"new version {new} must be greater than current {current}")
    if new in released_versions(args.plugin):
        die(f"tag {tag_name(args.plugin, new)} already exists")

    notes = [" ".join(m.split()) for m in args.message if m.strip()] or notes_since_last_release(args.plugin, pdir)
    if not notes:
        die("no changelog notes: pass -m or commit changes to the plugin first")

    print(f"{args.plugin}: {current} -> {new}")
    for n in notes:
        print(f"  - {n}")
    if args.dry_run:
        return

    require_clean_tree()
    with restore_on_failure(pdir):
        write_version(pdir, new)
        prepend_changelog(pdir, new, notes)
        validate(pdir)
        commit(pdir, f"release({args.plugin}): v{new}")
    print(f"\nCommitted. Push or open a PR; CI tags {tag_name(args.plugin, new)} once it is on main.")


if __name__ == "__main__":
    main()
