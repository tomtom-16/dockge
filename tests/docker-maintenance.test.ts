import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pruneImages } from "../backend/docker-maintenance";

test("image cleanup validates modes, limits arguments, serializes calls and releases its lock", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dockge-prune-test-"));
    const originalPath = process.env.PATH;
    const executable = join(directory, "docker");
    try {
        process.env.PATH = `${directory}:${originalPath}`;
        await writeFile(executable, "#!/usr/bin/env node\nsetTimeout(() => console.log(JSON.stringify(process.argv.slice(2))), 100);\n", { mode: 0o755 });
        await assert.rejects(pruneImages("--all; echo bad"), /Invalid/);
        const first = pruneImages(false);
        await assert.rejects(pruneImages(true), /already running/);
        assert.deepEqual(JSON.parse(await first), [ "image", "prune", "--force" ]);
        assert.deepEqual(JSON.parse(await pruneImages(true)), [ "image", "prune", "--force", "--all" ]);
        await writeFile(executable, "#!/usr/bin/env node\nconsole.error(\"Docker unavailable\"); process.exit(1);\n", { mode: 0o755 });
        await assert.rejects(pruneImages(false), /Docker unavailable/);
        await writeFile(executable, "#!/usr/bin/env node\nconsole.log(\"Total reclaimed space: 0B\");\n", { mode: 0o755 });
        assert.match(await pruneImages(false), /Total reclaimed space/);
    } finally {
        process.env.PATH = originalPath;
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
});
