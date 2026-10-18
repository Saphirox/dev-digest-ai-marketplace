# Bash allowlist (`architecture` profile)

Enforced by the `engineering-foundations` hook (`readonly-allowlist.mjs architecture`). Every
segment of a command must match a row, or the whole command is denied; a denial is final.

| Purpose | Commands |
|---|---|
| The diff under review — staged only | `git diff --cached` (with `--stat`, `--name-status`, `--name-only`, `--quiet`, `-- <path>`), `git status --short` |
| History of a file, for context only (never as the thing reviewed) | `git log -- <path>`, `git show <sha>:<path>`, `git blame`, `git ls-files` |
| Reading files | `cat`, `head`, `tail`, `sed -n '<a>,<b>p'`, `wc -l` |
| Finding code | `rg` (no `--pre`), `ls`, `find` (no `-exec`/`-delete`/`-ok`) |
| Comparing the two `vendor/shared` copies | `diff -r server/src/vendor/shared client/src/vendor/shared` |
| JSON (`package.json`, depcruise output) | `jq` |
| The boundary check | `pnpm arch:check` in `server/`, or `./node_modules/.bin/depcruise src ../reviewer-core/src --config .dependency-cruiser.cjs --output-type err` |

Pipes only between commands on this list (`git diff … | rg …`, `… | head`). No redirection
(`>`, `>>`, `tee`), no `sed -i`, no `xargs`, no shell wrapper (`bash -c`, `sh`, `eval`), no
inline interpreter (`node -e`, `python3 -c`), no install/exec runner (`npm`/`pnpm` other than
`arch:check`, `npx`, `dlx`), no network, and never read `~/.devdigest/**` or any `.env` other
than `.env.example`.
