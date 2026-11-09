import * as HostProcess from "@t3tools/shared/HostProcess";
import { SpawnExecutableResolution } from "@t3tools/shared/shell";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  LOCAL_AGENT_PRESETS,
  type LocalAgentPreset,
  type LocalAgentPresetAvailability,
} from "../presets.ts";

export interface LocalAgentPresetDiscoveryOptions {
  /** The server's home directory, used to expand a leading `~` in a candidate. */
  readonly homeDirectory: string;
  /** The environment a launched agent would inherit, so `PATH` lookups match. */
  readonly environment: NodeJS.ProcessEnv;
  readonly presets?: ReadonlyArray<LocalAgentPreset>;
}

const expandCandidate = (candidate: string, homeDirectory: string): string => {
  if (candidate === "~") return homeDirectory;
  if (candidate.startsWith("~/")) return `${homeDirectory}/${candidate.slice(2)}`;
  return candidate;
};

const containsPathSeparator = (candidate: string): boolean =>
  candidate.includes("/") || candidate.includes("\\");

/**
 * Where each preset's executable is on this machine, for the Add provider list.
 *
 * Discovery only stats and resolves paths: it never spawns the agent, so a status refresh cannot
 * start MCP servers, run hooks, or open a login browser. Every result is `not-run`; a real ACP
 * handshake is a separate, explicit step (`resolveLocalAgentPresets` folds the two together).
 */
export const discoverLocalAgentPresets = Effect.fn("LocalAgentPresets.discover")(function* (
  options: LocalAgentPresetDiscoveryOptions,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const platform = yield* HostProcess.Platform;
  const resolveExecutable = yield* SpawnExecutableResolution;
  const presets = options.presets ?? LOCAL_AGENT_PRESETS;

  const findCandidate = Effect.fn("LocalAgentPresets.findCandidate")(function* (candidate: string) {
    const expanded = expandCandidate(candidate, options.homeDirectory);
    if (!containsPathSeparator(expanded)) {
      // A bare name goes through the same resolver a launch would use, so the reported path is
      // the one the agent would actually run.
      const resolved = resolveExecutable(expanded, platform, options.environment);
      return resolved ?? null;
    }
    const absolute = path.isAbsolute(expanded)
      ? expanded
      : path.join(options.homeDirectory, expanded);
    const exists = yield* fs.exists(absolute).pipe(Effect.orElseSucceed(() => false));
    return exists ? absolute : null;
  });

  const resolved: LocalAgentPresetAvailability[] = [];
  for (const preset of presets) {
    let executable: string | null = null;
    for (const candidate of preset.binaryCandidates) {
      const found = yield* findCandidate(candidate);
      if (found !== null) {
        executable = found;
        break;
      }
    }
    if (executable !== null) {
      // macOS puts /tmp behind /private/tmp; comparing paths without resolving symlinks makes
      // every launch look like a different executable.
      executable = yield* fs.realPath(executable).pipe(Effect.orElseSucceed(() => executable));
    }
    resolved.push({ presetId: preset.id, executable, probe: "not-run" });
  }
  return resolved as ReadonlyArray<LocalAgentPresetAvailability>;
});
