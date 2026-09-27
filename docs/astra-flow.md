# Astra flow: setup on a new machine

A multi-model loop inside one Claude Code session:

- **Fable** (main session) orchestrates: intent, routing, visual/taste calls, fixes after review.
- **Astra** (`gpt-6-astra`, OpenAI via a Codex/ChatGPT login) structures the task into numbered
  points once, then reviews finished blocks. Read-only subagent.
- **Opus** subagents implement well-specified points and run every test.

Claude Code can only name a non-Claude model for a subagent if the **whole session** goes through
[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) (`cli-proxy-api`), which routes by model
name: `claude-*` → the proxy's Claude OAuth, `gpt-6-*` → its Codex OAuth.

## What comes with the repo vs. what you install

| In git (nothing to do)                 | Per machine                                   |
|----------------------------------------|-----------------------------------------------|
| `.claude/agents/astra.md` (`model: gpt-6-astra`, tools Read/Grep/Glob/Bash) | `~/cli-proxy/` — binary, config, auth files |
| `.claude/skills/astra-loop/SKILL.md` (the protocol) | `~/.local/bin/claude-proxy` — launcher |

## Setup

1. **Claude Code** installed and logged in; a ChatGPT plan with Codex access (Plus/Team).

2. **Proxy binary.** Download the Linux release of CLIProxyAPI (this machine runs 7.3.16):
   ```bash
   mkdir -p ~/cli-proxy/{bin,config,auths,logs}
   # unpack the release tarball into ~/cli-proxy/bin so that ~/cli-proxy/bin/cli-proxy-api exists
   ```

3. **Config.** Start from the release's `config.example.yaml`:
   ```bash
   cp ~/cli-proxy/bin/config.example.yaml ~/cli-proxy/config/config.yaml
   openssl rand -hex 16   # use as the api key below
   ```
   Set in `config.yaml` (everything else can stay default):
   ```yaml
   port: 8317
   auth-dir: "~/cli-proxy/auths"
   api-keys:
     - "<the hex key>"
   ```
   The launcher reads the first quoted value on the line after `api-keys:`, so keep that format.

4. **Logins — the proxy needs its own**, run as your user (not root):
   ```bash
   cd ~/cli-proxy
   ./bin/cli-proxy-api -config config/config.yaml -claude-login
   ./bin/cli-proxy-api -config config/config.yaml -codex-login      # or -codex-device-login on a headless box
   ```
   Add `-no-browser` if the browser can't open (WSL). Tokens land in `~/cli-proxy/auths/`.
   Do **not** copy the Codex CLI's own auth file in: both would rotate the same refresh token and
   OpenAI rejects it as reused (`503 auth_unavailable` when the astra agent spawns).

5. **Launcher** `~/.local/bin/claude-proxy` (`chmod +x`, `~/.local/bin` on PATH):
   ```bash
   #!/usr/bin/env bash
   # Launch Claude Code through cli-proxy-api so subagents can name non-Claude models.
   set -euo pipefail
   PROXY_DIR=$HOME/cli-proxy
   PORT=8317

   if ! pgrep -x cli-proxy-api >/dev/null; then
     (cd "$PROXY_DIR" && setsid nohup ./bin/cli-proxy-api -config config/config.yaml \
        >logs/stdout.log 2>&1 </dev/null & disown)
     for _ in $(seq 1 40); do
       curl -s -o /dev/null -m 1 "http://localhost:$PORT/" && break
       sleep 0.25
     done
   fi
   curl -s -o /dev/null -m 2 "http://localhost:$PORT/" || { echo "cli-proxy-api not answering on :$PORT" >&2; exit 1; }

   KEY=$(grep -A1 '^api-keys:' "$PROXY_DIR/config/config.yaml" | grep -oE '"[^"]+"' | tr -d '"' | head -1)
   [ -n "$KEY" ] || { echo "no api key in $PROXY_DIR/config/config.yaml" >&2; exit 1; }

   export ANTHROPIC_BASE_URL="http://localhost:$PORT"
   export ANTHROPIC_AUTH_TOKEN="$KEY"
   exec claude "$@"
   ```

6. **Verify.**
   ```bash
   KEY=...   # the api key
   curl -s localhost:8317/v1/models -H "Authorization: Bearer $KEY" | grep -o '"gpt-6-astra"'
   ```
   Then `claude-proxy` in the repo and ask: *"spawn the astra agent and have it read CLAUDE.md"*.
   A reply with the file's content means both lanes work.

## Using it

Start the session with `claude-proxy` (not `claude`) in the repo, then hand over a task with
`/astra-loop <task>` or "drive this through the astra loop". The skill does:

1. Brief → `<scratchpad>/brief.md` (goal, constraints, relevant memory facts).
2. Astra structures it into numbered points → `plan.md` with statuses.
3. Points routed: `fable` (visual, ambiguous, tuned constants) or `opus` (well-specified); grouped
   into blocks of 2–5.
4. Implement a block; an Opus agent runs its checks.
5. The **same** astra agent (continued via SendMessage) reviews the block's diff: settled / issue.
6. Fix, re-test; max two review rounds per block, then the user decides.
7. Stop when every point is settled. Side ideas go to `KAIZEN.md`.

## Caveats

- **Claude OAuth expiry breaks the whole session**, not just Astra — every request goes through the
  proxy. Re-run `-claude-login`.
- Claude.ai connectors (Claude Docs, Gmail, …) are off in proxied sessions (`ANTHROPIC_AUTH_TOKEN`).
- `unrecognized_model` warning for `gpt-6-astra` is harmless (Claude Code assumes a 200k window).
- No prompt caching through the proxy; Codex quota burns per token → send Astra diffs and the
  plan, never repo dumps.
- Fallback when not proxied or Codex auth is broken: `pigeon_drop/tools/codex-run.sh -m gpt-6-astra`
  (`-r <session>` resumes so Astra keeps the plan). Needs the `pigeon_drop` repo and the Codex CLI.
