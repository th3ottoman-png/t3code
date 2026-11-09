# T3 Code fork — local agent presets

Handover, 2026-11-09. Fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code) at upstream
`0.1.7`, plus one feature: **Agent CLIs you already installed appear in Add provider by name.**

Repo: https://github.com/th3ottoman-png/t3code · branch `feat/local-agent-presets` · 4 commits on
`upstream/main` · `main` on the fork mirrors upstream.

---

## 1. What the feature does

Upstream T3 Code ships first-class providers for Codex, Claude, Cursor, Grok, OpenCode,
Antigravity, Kiro, Pi, Muse and fx, and an ACP path where you add any other agent by hand
(**Add provider → Show more → Local ACP command**, executable + one argument per row).

That manual form is error-prone — an empty argument row saves silently and the provider dies with
`ACP process exited with code 2 — hermes: '' is not a 'hermes' command`, surfacing only as
"Needs attention · The ACP agent could not create a test session".

The fork adds **"Agents on this machine"** above the ACP Registry list: one row per known CLI with
its exact launcher, a `Limited` badge where the agent can't take part in part of the product, and
capability notes in a tooltip. One click prefills the executable, the literal arguments and the
display name, then jumps straight to the Identity step.

Presets shipped: **Hermes, Cline, Kimi Code, CodeBuddy, Kilo Code.**

The whole integration is `{source: "local", commandPath, commandArgs}` — the same instance the
manual form writes. No new driver, no agent-id checks in the shared ACP adapter, nothing vendored.

## 2. What was measured (why those five)

Live `initialize` + `session/new` + one `session/prompt` against each installed binary:

| Agent                       | Launcher                       | Turn                      | Models            | MCP caps | Verdict                  |
| --------------------------- | ------------------------------ | ------------------------- | ----------------- | -------- | ------------------------ |
| Hermes 0.23.0               | `hermes acp`                   | ✅                        | 586               | —        | preset                   |
| Cline 3.0.74                | `cline --acp`                  | ✅ (no tool-call updates) | 307               | ❌       | preset, **limited**      |
| Kimi Code 2.4.0             | `kimi acp`                     | ✅                        | 6 (configOptions) | ✓        | preset                   |
| CodeBuddy 2.162.0           | `codebuddy --acp`              | ✅                        | 29                | ✓        | preset (reports no name) |
| Kilo Code 7.5.5             | `kilo acp`                     | ⚠️ needs sign-in          | gated             | ✓        | preset + sign-in note    |
| DeepSeek Harness 0.1.1-rc.2 | `dsh --profile acp`            | ❌                        | —                 | —        | excluded                 |
| Gemini CLI 0.60.0           | `gemini --experimental-acp`    | ❌ refuses                | —                 | —        | excluded                 |
| ZCode 0.17.0                | bundled `zcode.cjs app-server` | —                         | —                 | —        | no ACP, excluded         |
| WorkBuddy AI                | —                              | —                         | —                 | —        | GUI only, no CLI         |

- **DeepSeek Harness**: `dsh plugin --profile acp add @deepseek-ai/dsh-acp` creates the profile but
  the package declares no `dsh.bundle`; it is an automation-only transport with no session, terminal,
  filesystem or MCP capability and no model/mode output. Nothing for T3 to render.
- **Cline** answers turns but emits no tool-call updates and advertises no MCP capability, so it is
  labelled `support: "limited"` — that label and its wording are asserted by a test.
- **ZCode**: the desktop app ships its own CLI (`/Applications/ZCode.app/Contents/Resources/glm/
  zcode.cjs`, `app-server` over ZCode Protocol) but no ACP. Using it in T3 would need a native
  adapter like the ones for OpenCode/Pi/Muse. The npm package `zcode-app-cli` is unofficial
  third-party — not adopted.
- **Approvals**: neither Hermes nor Cline asked permission under defaults (Hermes exposes
  `edit_approval_policy`, Cline `auto_approve`). A Supervised thread can therefore show no prompt.

## 3. Code map (the entire diff)

```
packages/provider-acp-registry/src/presets.ts                      NEW  catalog + schema + resolver
packages/provider-acp-registry/src/presets.test.ts                 NEW  13 tests
packages/provider-acp-registry/src/server/presetDiscovery.ts       NEW  stats-only discovery (unused in UI)
packages/provider-acp-registry/src/server/presetDiscovery.test.ts  NEW  5 tests
packages/provider-acp-registry/package.json                        + "./presets" export
apps/web/package.json                                              + workspace dep on the provider pkg
pnpm-lock.yaml                                                     lockfile
apps/web/src/components/settings/AcpRegistrySearchStep.tsx         + section + LocalAgentRow
apps/web/src/components/settings/AddProviderInstanceDialog.tsx     + handleLocalAgentPreset + prop
apps/web/src/components/settings/AddProviderInstanceDialog.logic.ts + isConfiguredLocalAgent
apps/web/src/components/settings/AddProviderInstanceDialog.test.ts + 3 tests
apps/web/src/components/settings/AddProviderInstanceDialog.environment.browser.test.tsx + 1 test
docs/user/providers-acp.md                                         "Presets for installed agents"
docs/user/install.md                                               pointer to the ACP path
docs/user/permission-modes.md                                      local ACP approval caveat
docs/internals/adding-a-provider.md                                "presets are data, not a driver"
scripts/sync-upstream.sh                                           rebase + verify + audit
```

Key exports in `presets.ts`:

- `LOCAL_AGENT_PRESETS` — the catalog. Order is the UI order.
- `LocalAgentPreset` — effect schema: `id, label, description, binaryCandidates[], commandArgs[],
  authMethodHint?, authHint?, support ("full" | "limited"), capabilityNotes[], docsUrl`.
- `resolveLocalAgentPresets({availability})` — pure, order-stable, never guesses: no record ⇒
  `not-installed`, installed but unprobed ⇒ `unverified`, and `acp-ok` is the only path to
  `available`.
- `presetProviderInstanceConfig(preset, executable)` — the exact settings payload.
- `presetInstanceId(preset)` — `acpRegistry_<id>`.

`isConfiguredLocalAgent(instances, binaryCandidates)` matches on the executable's **basename**, so an
instance added with an absolute path still reads as the same preset.

## 4. How it behaves at runtime

1. Preset row click → `handleLocalAgentPreset` seeds `configByDriver` with
   `{source: "local", commandPath: "<bare name>", commandArgs: [...]}`, sets the label, goes to Identity.
2. Saving writes `providerInstances.<id>` into the server's `settings.json`.
3. T3 resolves the bare name through `PATH` at launch (the service plist carries the user's full PATH).
4. Status comes from a real ACP probe: `Available`, or `Needs attention` with the real stderr.

Deliberate omission: there is **no** server-side "installed / not found" badge. `presetDiscovery.ts`
exists and is tested but unwired — wiring it needs contracts + `ws.ts` + a client atom for a badge
that can still be wrong on a remote environment. The bare-name prefill lets T3's own probe answer
truthfully instead.

## 5. Verification done

- 18 unit tests (`presets.test.ts`, `presetDiscovery.test.ts`) incl. schema round-trip, status
  mapping, order stability, tilde expansion, symlink → real path, and a test that a fake binary is
  never executed.
- 397 tests in `apps/web/src/components/settings`, including a browser test that drives the dialog
  through a preset and asserts the saved config, plus 3 `isConfiguredLocalAgent` cases.
- Live: Hermes completed a real turn through the UI (`pong` on Kilo Code · minimax-m3.1-flash).
- Live: preset click created `acpRegistry_kimi_code` with `{commandPath:"kimi", commandArgs:["acp"]}`
  and T3 flipped it to `Available`.
- Production build + service ran the fork; the desktop dmg was built from the tree and its `app.asar`
  contains the preset section.
- Repo hooks (`vp fmt`, `vp lint`, `knip`) pass on every commit.

## 6. Working on it

```bash
cd ~/Developer/t3code-fork
vp i                      # deps (Vite+ toolchain: vp, not pnpm/npm directly)
vp run dev                # dev server + web on :5733, state in ~/.t3/dev
vpr test                  # per package: cd packages/provider-acp-registry && vpr test
vpr typecheck             # per package
vp lint                   # oxlint + the repo's own t3code rules
```

Rules the repo enforces that bit during this work: `knip` rejects duplicate exports and unused
exported decoders; `t3code/prefer-effect-fn` wants `Effect.fn("X.y")` for reusable effect functions;
`t3code/no-global-process-runtime` forbids `process.platform` (use `HostProcess.Platform`);
`eslint/no-unused-vars` on stray constants; `AGENTS.md` forbids committing plans or research notes.

Browser tests need Playwright's headless shell: `node node_modules/.pnpm/playwright@<ver>/node_modules/
playwright/cli.js install chromium-headless-shell` (installed here under `~/.hermes/tools`).

## 7. Updating from upstream

```bash
git fetch upstream
./scripts/sync-upstream.sh          # rebase → vp i → typecheck both packages → tests → audit
./scripts/sync-upstream.sh --check-only   # audit the diff without touching history
```

The script fails if the patch reaches outside its 17-file allowlist — that is the guard against the
fork quietly growing. Upstream moved 9 commits in one hour during this work; expect to run it often.
The only file upstream also edits is `docs/user/providers-acp.md`; the rebase was clean.

**Never** rely on `t3 update` or the desktop app's auto-updater: both fetch official releases and
would overwrite this build.

## 8. This machine's setup

- Desktop app: `/Applications/T3 Code (Beta).app` — built from this tree, **ad-hoc signed** (Gatekeeper
  needs right-click → Open, or `xattr -dr com.apple.quarantine`). It is the only T3 install: it embeds
  its own server on `:3773`, state in `~/.t3/userdata`, and is a Login Item.
- Rebuild the app: `vp run dist:desktop:dmg:arm64` → `release/T3-Code-<ver>-arm64.dmg`. Needs Rust
  (`rustup`, `aarch64-apple-darwin`), clang, make, sips, iconutil. Takes ~60 s; artifacts were moved to
  Trash to save space and are regenerated on demand.
- The background service was uninstalled at the user's request. `~/.local/bin/t3` is a local shim into
  `apps/server/dist/bin.mjs`; `~/.local/bin/t3-build` rebuilds web+server and re-points the service
  runtime (both are machine-local, not in the repo).
- Installed agent CLIs: `hermes` (0.23.0), `kilo`/`kilocode` (7.5.5), `cline` (3.0.74), `kimi`
  (~/.kimi-code, 2.4.0), `codebuddy` (2.162.0), `opencode` (1.18.32), `claude` (2.1.310),
  `codex` (0.164.0), `dsh` (0.1.1-rc.2).
- Kilo Code has **no credentials** on this machine — its first turn fails until sign-in.

## 9. Open work / next steps

1. **Kilo Code sign-in** — needed before its preset is useful.
2. **ZCode** — would need a native adapter for ZCode Protocol (`app-server`), not a config row. Its
   bundled CLI works standalone in a terminal meanwhile.
3. **DeepSeek Harness** — revisit only if DeepSeek ships a real ACP profile bundle.
4. **Availability badge** — wire `discoverLocalAgentPresets` through a new RPC if a "not installed"
   state is worth the extra surface.
5. **Icons** — presets use the client's letter monogram; brand marks were deliberately not invented.
6. **Upstream PR** — upstream says big features are not accepted; small fixes may be. The patch is
   deliberately shaped so it could be offered as a discussion.

## 10. Where the long-form notes live

Outside the repo, because `AGENTS.md` forbids committing plans and research notes:

- `~/.hermes/plans/t3code-local-agent-presets.md` — full plan, all five phases with results.
- `~/.hermes/plans/t3code-acp-matrix.md` — the measured capability matrix and exclusion reasons.
- Hermes skill `acp-agent-integration` (`~/.hermes/skills/`) — reusable ACP-integration procedure and
  T3-Code-specific traps (pairing, service runtime shim, dev-server restarts, dialog automation).
