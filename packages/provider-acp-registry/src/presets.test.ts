import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  LOCAL_AGENT_PRESETS,
  presetInstanceId,
  presetProviderInstanceConfig,
  resolveLocalAgentPresets,
  validateLocalAgentPresets,
  type LocalAgentPresetAvailability,
} from "./presets.ts";

const preset = (id: string) => {
  const found = LOCAL_AGENT_PRESETS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`missing preset ${id}`);
  return found;
};

describe("local agent presets", () => {
  it.effect("every preset matches the schema", () =>
    Effect.gen(function* () {
      yield* validateLocalAgentPresets();
      expect(LOCAL_AGENT_PRESETS.length).toBeGreaterThan(0);
    }),
  );

  it("uses each id once", () => {
    const ids = LOCAL_AGENT_PRESETS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never pins a version in a binary candidate", () => {
    for (const entry of LOCAL_AGENT_PRESETS) {
      for (const candidate of entry.binaryCandidates) {
        expect(candidate).not.toMatch(/\d+\.\d+\.\d+/);
      }
    }
  });

  it("labels Cline limited and says why", () => {
    const cline = preset("cline");
    expect(cline.support).toBe("limited");
    expect(cline.capabilityNotes.some((note) => note.includes("no tool-call updates"))).toBe(true);
    expect(cline.capabilityNotes.some((note) => note.includes("Weakest preset"))).toBe(true);
  });

  it("marks every other preset full", () => {
    for (const entry of LOCAL_AGENT_PRESETS.filter((candidate) => candidate.id !== "cline")) {
      expect(entry.support).toBe("full");
    }
  });
});

describe("resolveLocalAgentPresets", () => {
  const availability: ReadonlyArray<LocalAgentPresetAvailability> = [
    { presetId: "hermes", executable: "/opt/homebrew/bin/hermes", probe: "acp-ok" },
    { presetId: "cline", executable: "/opt/homebrew/bin/cline", probe: "no-acp" },
    { presetId: "kilo", executable: "/opt/homebrew/bin/kilo", probe: "failed" },
    { presetId: "kimi", executable: null, probe: "not-run" },
  ];

  it("maps each probe result to one status", () => {
    const resolved = resolveLocalAgentPresets({ availability });
    const byId = new Map(resolved.map((entry) => [entry.preset.id, entry]));

    expect(byId.get("hermes")?.status).toBe("available");
    expect(byId.get("cline")?.status).toBe("no-acp");
    expect(byId.get("kilo")?.status).toBe("failed");
    expect(byId.get("kimi")?.status).toBe("not-installed");
    // No availability record at all: never guessed as installed.
    expect(byId.get("codebuddy")?.status).toBe("not-installed");
  });

  it("keeps preset order regardless of availability order", () => {
    const resolved = resolveLocalAgentPresets({ availability: [...availability].reverse() });
    expect(resolved.map((entry) => entry.preset.id)).toEqual(
      LOCAL_AGENT_PRESETS.map((entry) => entry.id),
    );
  });

  it("keeps an installed but unprobed preset unverified", () => {
    const resolved = resolveLocalAgentPresets({
      availability: [{ presetId: "kimi", executable: "/tmp/kimi", probe: "not-run" }],
    });
    const kimi = resolved.find((entry) => entry.preset.id === "kimi");
    expect(kimi?.status).toBe("unverified");
    expect(kimi?.executable).toBe("/tmp/kimi");
  });

  it("reports the resolved executable verbatim, symlinked path included", () => {
    // macOS puts /tmp behind /private/tmp; the resolver must not rewrite what it was given.
    const resolved = resolveLocalAgentPresets({
      availability: [{ presetId: "cline", executable: "/tmp/t3-link/cline", probe: "acp-ok" }],
    });
    expect(resolved.find((entry) => entry.preset.id === "cline")?.executable).toBe(
      "/tmp/t3-link/cline",
    );
  });

  it("treats a missing executable as not installed even when a probe says ok", () => {
    const resolved = resolveLocalAgentPresets({
      availability: [{ presetId: "hermes", executable: null, probe: "acp-ok" }],
    });
    expect(resolved.find((entry) => entry.preset.id === "hermes")?.status).toBe("not-installed");
  });
});

describe("preset instance config", () => {
  it("emits the local ACP instance shape", () => {
    expect(presetProviderInstanceConfig(preset("hermes"), "/opt/homebrew/bin/hermes")).toEqual({
      source: "local",
      commandPath: "/opt/homebrew/bin/hermes",
      commandArgs: ["acp"],
    });
    expect(
      presetProviderInstanceConfig(preset("cline"), "/opt/homebrew/bin/cline").commandArgs,
    ).toEqual(["--acp"]);
  });

  it("copies the argument list instead of sharing it", () => {
    const config = presetProviderInstanceConfig(preset("kilo"), "/opt/homebrew/bin/kilo");
    config.commandArgs.push("--mutated");
    expect(preset("kilo").commandArgs).toEqual(["acp"]);
  });

  it("derives a stable instance id", () => {
    expect(presetInstanceId(preset("codebuddy"))).toBe("acpRegistry_codebuddy");
  });
});
