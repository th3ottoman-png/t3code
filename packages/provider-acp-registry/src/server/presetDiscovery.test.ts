import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import { SpawnExecutableResolution } from "@t3tools/shared/shell";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import type { LocalAgentPreset } from "../presets.ts";
import { discoverLocalAgentPresets } from "./presetDiscovery.ts";

const preset = (
  overrides: Partial<LocalAgentPreset> & Pick<LocalAgentPreset, "id">,
): LocalAgentPreset => ({
  label: overrides.id,
  description: `${overrides.id} preset`,
  binaryCandidates: [overrides.id],
  commandArgs: ["acp"],
  support: "full",
  capabilityNotes: [],
  docsUrl: "docs/user/providers-acp.md",
  ...overrides,
});

const noPath = () => undefined;

describe("discoverLocalAgentPresets", () => {
  it.effect("resolves a bare candidate through the launch resolver", () =>
    Effect.gen(function* () {
      const found = yield* discoverLocalAgentPresets({
        homeDirectory: "/home/tester",
        environment: {},
        presets: [preset({ id: "hermes" })],
      }).pipe(
        Effect.provideService(SpawnExecutableResolution, (command) =>
          command === "hermes" ? "/usr/local/bin/hermes" : undefined,
        ),
      );

      assert.deepStrictEqual(found, [
        { presetId: "hermes", executable: "/usr/local/bin/hermes", probe: "not-run" },
      ]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reports null when no candidate resolves", () =>
    Effect.gen(function* () {
      const found = yield* discoverLocalAgentPresets({
        homeDirectory: "/home/tester",
        environment: {},
        presets: [preset({ id: "kimi", binaryCandidates: ["kimi", "~/missing/kimi"] })],
      }).pipe(Effect.provideService(SpawnExecutableResolution, noPath));

      assert.deepStrictEqual(found, [{ presetId: "kimi", executable: null, probe: "not-run" }]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("keeps candidate order and expands a leading tilde", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-preset-home-" });
      const second = path.join(home, ".kimi-code", "bin", "kimi");
      yield* fs.makeDirectory(path.dirname(second), { recursive: true });
      yield* fs.writeFileString(second, "");

      const found = yield* discoverLocalAgentPresets({
        homeDirectory: home,
        environment: {},
        presets: [
          preset({ id: "kimi", binaryCandidates: ["kimi", "~/.kimi-code/bin/kimi"] }),
          preset({ id: "kilo", binaryCandidates: ["kilo", "kilocode"] }),
        ],
      }).pipe(Effect.provideService(SpawnExecutableResolution, noPath));

      // The bare name failed, so the tilde candidate answers.
      const expected = yield* fs.realPath(second);
      assert.strictEqual(found[0]?.executable, expected);
      assert.strictEqual(found[1]?.executable, null);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("resolves a symlinked candidate to its real path", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-preset-link-" });
      const real = path.join(home, "real", "cline");
      const link = path.join(home, "bin", "cline");
      yield* fs.makeDirectory(path.dirname(real), { recursive: true });
      yield* fs.makeDirectory(path.dirname(link), { recursive: true });
      yield* fs.writeFileString(real, "");
      yield* fs.symlink(real, link);

      const found = yield* discoverLocalAgentPresets({
        homeDirectory: home,
        environment: {},
        presets: [preset({ id: "cline", binaryCandidates: [link] })],
      }).pipe(Effect.provideService(SpawnExecutableResolution, noPath));

      const resolvedReal = yield* fs.realPath(real);
      assert.strictEqual(found[0]?.executable, resolvedReal);
      assert.notStrictEqual(found[0]?.executable, link);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("never spawns the agent: every result stays not-run", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped({ prefix: "t3-preset-quiet-" });
      const fake = path.join(home, "bin", "codebuddy");
      yield* fs.makeDirectory(path.dirname(fake), { recursive: true });
      // A binary that would leave a marker behind if anything executed it.
      yield* fs.writeFileString(fake, `#!/bin/sh\ntouch "${path.join(home, "spawned")}"\n`);

      const found = yield* discoverLocalAgentPresets({
        homeDirectory: home,
        environment: {},
        presets: [preset({ id: "codebuddy", binaryCandidates: [fake] })],
      }).pipe(Effect.provideService(SpawnExecutableResolution, noPath));

      assert.strictEqual(found[0]?.probe, "not-run");
      const spawned = yield* fs.exists(path.join(home, "spawned"));
      assert.isFalse(spawned);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
