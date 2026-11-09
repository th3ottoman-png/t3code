# ACP capability matrix — T3 Code fork

Measured 2026-11-08/09 on Mario's MacBook (macOS, Node 26.13). Method: real stdio ACP against
each installed CLI — `initialize` → `session/new` → one `session/prompt` — plus one full
UI-driven turn through T3 Code (`vp run dev`, provider added as a Local ACP command).
No hand-written frames: every row is a live exchange with the installed binary.

Scripts used: `~/.hermes/skills/acp-agent-integration/scripts/acp_probe.py --session`,
`~/.hermes/cache/scratch/acp_caps_probe.py`, `~/.hermes/cache/scratch/acp_approval_probe.py`.

## Results

| Agent                             | Launcher                    | Turn                                                                                               | Models advertised                                                                     | MCP caps                                      | Session caps                                                     | Approval asked by default            | Verdict                                                      |
| --------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| **Hermes** `0.23.0`               | `hermes acp`                | ✅ pong (also ✅ through T3 UI)                                                                    | 586 via `models` + config options `model`, `reasoning_effort`, `edit_approval_policy` | — (not advertised; `promptCapabilities` only) | `sessionCapabilities` ✓, `loadSession` ✓                         | ❌ no (ran the tool directly)        | **Preset**                                                   |
| **Cline** `3.0.74`                | `cline --acp`               | ✅                                                                                                 | 307 via `models`; config `provider`, `model`, `mode`, `auto_approve`                  | ❌ **absent**                                 | ❌ absent, `loadSession` ✓                                       | ❌ no (no tool calls emitted at all) | **Preset, with MCP note**                                    |
| **Kimi Code** `2.4.0`             | `kimi acp`                  | ✅                                                                                                 | 6 via `configOptions.model` (`kimi-code/k3.1-pro`, `k3`, `k3-256k`, …)                | ✓                                             | ✓, `loadSession` ✓                                               | not probed                           | **Preset**                                                   |
| **CodeBuddy** `2.162.0`           | `codebuddy --acp`           | ✅                                                                                                 | 29 via `models`; config `mode`, `model`, `thought_level`, `sandbox`, `multitask`      | ✓                                             | ✓**`delegateToolsSupport`, `mainAgentSupport`**, `loadSession` ✓ | not probed                           | **Preset, label from preset** (`agentInfo.name` is `null`)   |
| **Kilo Code** `7.5.5`             | `kilo acp`                  | ⚠️ fails until sign-in: `You need to sign in to use this model` (`kilo auth list` → 0 credentials) | model list present (`orcarouter/*`, `kilo/*`) but gated                               | ✓                                             | ✓, `loadSession` ✓                                               | n/a                                  | **Preset + "sign in" note**; T3 offers the `kilo-login` flow |
| **DeepSeek Harness** `0.1.1-rc.2` | `dsh --profile acp`         | ❌ no ACP server                                                                                   | —                                                                                     | —                                             | —                                                                | —                                    | **Excluded**                                                 |
| Gemini CLI `0.60.0`               | `gemini --experimental-acp` | ❌ refuses: "This client is no longer supported for Gemini Code Assist for individuals"            | —                                                                                     | —                                             | —                                                                | —                                    | **Excluded**                                                 |
| OpenCode `1.18.32` (control)      | `opencode acp`              | ✅                                                                                                 | —                                                                                     | ✓                                             | ✓                                                                | —                                    | already first-class upstream                                 |

## Why DeepSeek Harness is out

`dsh --profile acp` fails until the profile exists; `dsh plugin --profile acp add
@deepseek-ai/dsh-acp` creates it, but the launcher then warns that the package **declares no
`dsh.bundle`**, so it installs as a plain dependency and nothing boots. Even if a composition is
wired by hand, that package describes itself as an _automation-only transport adapter_: it
advertises no session, terminal, filesystem, or MCP capability, exposes no models, commands,
modes, plans, reasoning, or tool presentation, and requires `provider` + `model` in its plugin
config. There is nothing for T3 to render. Revisit only if DeepSeek ships a real ACP profile.

## What this changes in the plan

- Preset catalog targets: **Hermes, Cline, Kimi Code, CodeBuddy, Kilo Code** (5), not 7.
- Cline: surface a capability note (no MCP capability, so no T3 tools); do not claim tool parity.
- CodeBuddy: display label must come from the preset — the agent reports no name.
- Kilo: preset links to sign-in; a turn fails until `kilo-login` completes in T3 or `kilo auth login`.
- Approval: neither probed agent asked for permission under its default config, and Hermes exposes
  `edit_approval_policy` while Cline exposes `auto_approve`. So "T3 shows approvals" is a property
  of the agent's own mode, not of the preset. Presets must not promise an approval UI; the
  `docs/user` note should say which config option controls it.

## Not measured in this pass

- T3-side resume/`session/load` through the UI, and checkpoint rollback on these agents.
- T3 MCP tool invocation against the agents that do advertise `mcpCapabilities` (Hermes advertises
  only `promptCapabilities`, so T3's own MCP tools are not on offer there either).
- Kilo after sign-in (blocked on credentials, not on protocol).
  Each is a checkbox to fill before the preset ships, not a design question.
