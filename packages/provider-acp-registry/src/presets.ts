import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/**
 * Local agent presets: coding-agent CLIs that speak ACP and run on this machine.
 *
 * Data only: a preset prefills the same `{source: "local", commandPath, commandArgs}` instance the
 * "Local ACP command" path creates. No driver, no adapter changes, no installs.
 *
 * Browser- and React-Native-safe: no node imports, no filesystem access.
 */

export const LocalAgentPresetId = Schema.Literals(["hermes", "cline", "kimi", "codebuddy", "kilo"]);
export type LocalAgentPresetId = typeof LocalAgentPresetId.Type;

/**
 * How much of T3 a preset is known to exercise.
 *
 * `limited` is a promise to the user, not a bug marker: the agent answers turns but cannot take
 * part in part of the product, and the capability notes say which part.
 */
export const LocalAgentPresetSupport = Schema.Literals(["full", "limited"]);
export type LocalAgentPresetSupport = typeof LocalAgentPresetSupport.Type;

export const LocalAgentPreset = Schema.Struct({
  id: LocalAgentPresetId,
  /** Display name for the provider instance and the Add provider row. */
  label: Schema.String,
  /** One-line description shown under the label. */
  description: Schema.String,
  /**
   * Executable candidates in preference order. A bare name is resolved through `PATH`; a leading
   * `~` is expanded by the resolver. Never pin a version here: presets degrade to `not-installed`
   * instead of breaking on a CLI upgrade.
   */
  binaryCandidates: Schema.NonEmptyArray(Schema.String),
  /** Literal arguments, in launch order. */
  commandArgs: Schema.Array(Schema.String),
  /** ACP auth method id the agent advertises, when a turn needs sign-in first. */
  authMethodHint: Schema.optional(Schema.String),
  /** How the user signs in when `authMethodHint` is set. */
  authHint: Schema.optional(Schema.String),
  support: LocalAgentPresetSupport,
  /** Measured facts, shown in the provider card and the docs page. */
  capabilityNotes: Schema.Array(Schema.String),
  docsUrl: Schema.String,
});
export type LocalAgentPreset = typeof LocalAgentPreset.Type;

const INSTALL_DOCS = "docs/user/providers-acp-local.md";

/**
 * Order matters: it is the order Add provider lists them, and the order the resolver returns.
 */
export const LOCAL_AGENT_PRESETS: ReadonlyArray<LocalAgentPreset> = [
  {
    id: "hermes",
    label: "Hermes",
    description: "Hermes Agent, configured and signed in on this machine.",
    binaryCandidates: ["hermes", "~/.hermes/hermes-agent/.hermes/bin/hermes"],
    commandArgs: ["acp"],
    authMethodHint: "hermes-setup",
    authHint: "Hermes uses its own provider configuration; sign in from its setup flow if it asks.",
    support: "full",
    capabilityNotes: [
      "Reports its full model catalog over ACP, including the provider each model belongs to.",
      "Exposes an edit-approval policy and a reasoning-effort option in the composer.",
      "Advertises no MCP capability, so T3's own tools are not offered to it.",
    ],
    docsUrl: INSTALL_DOCS,
  },
  {
    id: "cline",
    label: "Cline",
    description: "Cline's CLI in ACP mode.",
    binaryCandidates: ["cline"],
    commandArgs: ["--acp"],
    authMethodHint: "cline",
    authHint: "Sign in from the provider card, or run `cline auth login` on this machine.",
    // Measured on 3.0.74: answers turns, emits no tool-call updates, advertises no MCP capability.
    // It is shipped as a preset because chat works, and labelled limited so nobody expects parity.
    support: "limited",
    capabilityNotes: [
      "Weakest preset: turns answer, but the agent emits no tool-call updates, so edits and commands are invisible in T3.",
      "Advertises no MCP capability, so T3's own tools are not available.",
      "Advertises no session capability; resume relies on `loadSession` alone.",
      "Carries an `auto_approve` option: approvals are the agent's setting, not a T3 prompt.",
    ],
    docsUrl: INSTALL_DOCS,
  },
  {
    id: "kimi",
    label: "Kimi Code",
    description: "Moonshot's Kimi Code CLI.",
    binaryCandidates: ["kimi", "~/.kimi-code/bin/kimi"],
    commandArgs: ["acp"],
    authMethodHint: "login",
    authHint: "Sign in from the provider card, or run `kimi` and complete its login.",
    support: "full",
    capabilityNotes: [
      "Publishes its models through session configuration options rather than a model list.",
      "Advertises MCP and session capabilities, including `loadSession`.",
    ],
    docsUrl: INSTALL_DOCS,
  },
  {
    id: "codebuddy",
    label: "CodeBuddy",
    description: "Tencent's CodeBuddy CLI.",
    binaryCandidates: ["codebuddy"],
    commandArgs: ["--acp"],
    authMethodHint: "external",
    authHint: "Choose an authentication method on the provider card; enterprise hosts may differ.",
    support: "full",
    capabilityNotes: [
      "Reports no agent name over ACP, so the preset supplies the label.",
      "Offers several authentication methods; pick one explicitly instead of relying on a default.",
      "Advertises MCP, session, delegation, and multitask capabilities.",
    ],
    docsUrl: INSTALL_DOCS,
  },
  {
    id: "kilo",
    label: "Kilo Code",
    description: "Kilo Code CLI in ACP mode.",
    binaryCandidates: ["kilo", "kilocode"],
    commandArgs: ["acp"],
    authMethodHint: "kilo-login",
    authHint: "Sign in from the provider card before the first turn; without it a prompt fails.",
    support: "full",
    capabilityNotes: [
      "A turn fails with `You need to sign in to use this model` until the account is signed in.",
      "Publishes its models through session configuration options rather than a model list.",
      "Advertises MCP and session capabilities.",
    ],
    docsUrl: INSTALL_DOCS,
  },
];

export const LocalAgentPresetProbeResult = Schema.Literals([
  "not-run",
  "acp-ok",
  "no-acp",
  "failed",
]);
export type LocalAgentPresetProbeResult = typeof LocalAgentPresetProbeResult.Type;

/** What the server learned about one preset on this machine. */
export const LocalAgentPresetAvailability = Schema.Struct({
  presetId: LocalAgentPresetId,
  /** Absolute path of the first candidate that exists, after symlink resolution. */
  executable: Schema.NullOr(Schema.String),
  probe: LocalAgentPresetProbeResult,
});
export type LocalAgentPresetAvailability = typeof LocalAgentPresetAvailability.Type;

export const LocalAgentPresetStatus = Schema.Literals([
  /** Installed and answered an ACP handshake. */
  "available",
  /** No candidate exists on this machine. */
  "not-installed",
  /** The executable exists but did not answer an ACP handshake. */
  "no-acp",
  /** The executable exists but its last launch failed. */
  "failed",
  /** Installed, not probed yet. Never claimed as available. */
  "unverified",
]);
export type LocalAgentPresetStatus = typeof LocalAgentPresetStatus.Type;

export interface ResolvedLocalAgentPreset {
  readonly preset: LocalAgentPreset;
  readonly status: LocalAgentPresetStatus;
  readonly executable: string | null;
}

const statusFor = (
  executable: string | null,
  probe: LocalAgentPresetProbeResult,
): LocalAgentPresetStatus => {
  if (executable === null) return "not-installed";
  switch (probe) {
    case "acp-ok":
      return "available";
    case "no-acp":
      return "no-acp";
    case "failed":
      return "failed";
    case "not-run":
      return "unverified";
  }
};

/**
 * Join presets with what the server observed. Pure and order-stable: output follows the preset
 * order, and a preset with no availability record is reported as `unverified` rather than guessed
 * at, so a missing probe can never look like an installed agent.
 */
export const resolveLocalAgentPresets = (input: {
  readonly availability: ReadonlyArray<LocalAgentPresetAvailability>;
  readonly presets?: ReadonlyArray<LocalAgentPreset>;
}): ReadonlyArray<ResolvedLocalAgentPreset> => {
  const presets = input.presets ?? LOCAL_AGENT_PRESETS;
  const byId = new Map<LocalAgentPresetId, LocalAgentPresetAvailability>();
  for (const entry of input.availability) {
    byId.set(entry.presetId, entry);
  }
  return presets.map((preset) => {
    const entry = byId.get(preset.id);
    return {
      preset,
      status: statusFor(entry?.executable ?? null, entry?.probe ?? "not-run"),
      executable: entry?.executable ?? null,
    };
  });
};

/**
 * The instance settings a preset produces. This is the whole integration: the same shape the
 * "Local ACP command" dialog writes and `~/.t3/<state>/settings.json` stores.
 */
export const presetProviderInstanceConfig = (
  preset: LocalAgentPreset,
  executable: string,
): { readonly source: "local"; readonly commandPath: string; readonly commandArgs: string[] } => ({
  source: "local",
  commandPath: executable,
  commandArgs: [...preset.commandArgs],
});

/** Provider instance id the preset suggests, e.g. `acpRegistry_hermes`. */
export const presetInstanceId = (preset: LocalAgentPreset): string =>
  `acpRegistry_${preset.id.replaceAll("-", "_")}`;

const decodeLocalAgentPresets = Schema.decodeEffect(Schema.Array(LocalAgentPreset));

/** Fails loudly in development if a preset drifts from the schema. */
export const validateLocalAgentPresets = Effect.fn("LocalAgentPresets.validate")(function* () {
  yield* decodeLocalAgentPresets(LOCAL_AGENT_PRESETS);
});
