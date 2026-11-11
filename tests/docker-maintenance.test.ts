import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listImagesForCleanup, pruneImages } from "../backend/docker-maintenance";

const id = (value: string) => `sha256:${value.repeat(64)}`;

test("image cleanup previews unused images and reports deleted tags without layer IDs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dockge-prune-test-"));
    const originalPath = process.env.PATH;
    const executable = join(directory, "docker");
    const statePath = join(directory, "state.json");
    const callsPath = join(directory, "calls.jsonl");
    const images = [
        {
            Id: id("1"),
            Parent: id("7"),
            RepoTags: [],
        },
        { Id: id("2"),
            RepoTags: [ "example/app:old", "example/app:rollback" ] },
        { Id: id("3"),
            Parent: id("4"),
            RepoTags: [ "example/app:current" ] },
        { Id: id("4"),
            RepoTags: [] },
        { Id: id("5"),
            RepoTags: [],
            RepoDigests: [ `example/digest@${id("5")}` ] },
        { Id: id("6"),
            RepoTags: [] },
        {
            Id: id("7"),
            RepoTags: [],
        },
    ];
    const state = {
        images,
        containers: [{ Image: id("3") }, { Image: id("6") }],
        fail: false,
        failPrune: false,
        output: `Untagged Images:\nuntagged: example/app:old\ndeleted: ${id("1")}\ndeleted: ${id("2")}\ndeleted: ${id("a")}\nTotal reclaimed space: 12.3MB\n`,
    };
    const save = () => writeFile(statePath, JSON.stringify(state));
    const calls = async () => (await readFile(callsPath, "utf8")).trim().split("\n").map(line => JSON.parse(line) as string[]);
    try {
        process.env.PATH = `${directory}:${originalPath}`;
        await save();
        await writeFile(executable, `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const state = JSON.parse(fs.readFileSync(path.join(__dirname, "state.json"), "utf8"));
const args = process.argv.slice(2);
fs.appendFileSync(path.join(__dirname, "calls.jsonl"), JSON.stringify(args) + "\\n");
setTimeout(() => {
    if (state.fail || (state.failPrune && args[1] === "prune")) { console.error("Docker unavailable"); process.exit(1); }
    if (args[1] === "ls") {
        console.log(args[0] === "image" ? state.images.map(image => image.Id).join("\\n") : state.containers.map((_, index) => "container" + index).join("\\n"));
    } else if (args[1] === "inspect") {
        console.log(JSON.stringify(args[0] === "image" ? state.images.filter(image => args.includes(image.Id)) : state.containers));
    } else if (args[1] === "prune") {
        console.log(state.output);
    } else { process.exit(2); }
}, 40);
`, { mode: 0o755 });
        await assert.rejects(listImagesForCleanup("--all; echo bad"), /Invalid/);
        await assert.rejects(pruneImages("--all; echo bad", []), /Invalid/);
        const dangling = await listImagesForCleanup(false);
        assert.deepEqual(dangling, [
            { id: id("1"),
                tags: [] },
            { id: id("5"),
                tags: [] },
            { id: id("7"),
                tags: [] },
        ]);
        const unused = await listImagesForCleanup(true);
        assert.deepEqual(unused, [
            { id: id("1"),
                tags: [] },
            { id: id("2"),
                tags: [ "example/app:old", "example/app:rollback" ] },
            { id: id("5"),
                tags: [] },
            { id: id("7"),
                tags: [] },
        ]);

        const first = pruneImages(false, dangling);
        await assert.rejects(pruneImages(true, unused), /already running/);
        assert.deepEqual(await first, { images: dangling.slice(0, 1),
            reclaimedSpace: "12.3MB" });
        assert.deepEqual((await calls()).filter(args => args[1] === "prune").at(-1), [ "image", "prune", "--force" ]);
        assert.deepEqual(await pruneImages(true, unused), { images: unused.slice(0, 2),
            reclaimedSpace: "12.3MB" });
        assert.deepEqual((await calls()).filter(args => args[1] === "prune").at(-1), [ "image", "prune", "--force", "--all" ]);

        // Never prune when tags or candidates changed since confirmation was prepared.
        state.images[1].RepoTags = [ "example/app:new" ];
        await save();
        const before = (await calls()).filter(args => args[1] === "prune").length;
        await assert.rejects(pruneImages(true, unused), /Image list changed/);
        assert.equal((await calls()).filter(args => args[1] === "prune").length, before);

        state.fail = true;
        await save();
        await assert.rejects(pruneImages(false, dangling), /Docker unavailable/);
        state.fail = false;
        state.failPrune = true;
        await save();
        await assert.rejects(pruneImages(false, dangling), /Docker unavailable/);
        state.failPrune = false;
        state.output = "Total reclaimed space: 0B\n";
        await save();
        assert.deepEqual(await pruneImages(false, dangling), { images: [],
            reclaimedSpace: "0B" });

        state.images = [];
        state.containers = [];
        await save();
        const beforeEmpty = (await calls()).filter(args => args[1] === "prune").length;
        assert.deepEqual(await pruneImages(false, []), { images: [],
            reclaimedSpace: "" });
        assert.equal((await calls()).filter(args => args[1] === "prune").length, beforeEmpty);
    } finally {
        process.env.PATH = originalPath;
        await rm(directory, { recursive: true,
            force: true });
    }
});
