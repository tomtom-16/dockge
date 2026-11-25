import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { DockgeServer } from "../backend/dockge-server";
import { Stack } from "../backend/stack";
import { Terminal } from "../backend/terminal";
import type { DockgeSocket } from "../backend/util-server";

const id = (character: string) => "sha256:" + character.repeat(64);
const manifest = (digest: string) => JSON.stringify({ schemaVersion: 2,
    config: { digest } });
const digestOf = (raw: string) => "sha256:" + createHash("sha256").update(raw).digest("hex");
const container = (service: string, image: string, state = "running", descriptor?: object) => ({
    Image: image,
    ImageManifestDescriptor: descriptor,
    State: { Status: state,
        Running: state === "running",
        ExitCode: 0 },
    Config: { Labels: { "com.docker.compose.service": service } },
});

test("stack image checks and cleanup through Stack", async t => {
    const dir = await mkdtemp(join(tmpdir(), "dockge-stack-images-"));
    const originalPath = process.env.PATH;
    t.after(async () => {
        process.env.PATH = originalPath;
        await rm(dir, { recursive: true,
            force: true });
    });
    const server = { stacksDir: dir } as DockgeServer;
    const socket = { endpoint: "" } as DockgeSocket;
    const callsFile = join(dir, "calls.jsonl");
    const fixtureFile = join(dir, "fixture.json");
    const fixture = async (data: object) => writeFile(fixtureFile, JSON.stringify(data));
    const calls = async () => (await readFile(callsFile, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as string[]);
    for (const name of [ "active", "stopped" ]) {
        await mkdir(join(dir, name));
        await writeFile(join(dir, name, "compose.yaml"), "services: {}\n");
    }
    await writeFile(join(dir, "docker"), `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify(args) + "\\n");
const data = JSON.parse(fs.readFileSync(${JSON.stringify(fixtureFile)}, "utf8"));
if (args[0] === "compose") {
    if (args.includes("ls")) console.log(JSON.stringify(data.projects));
    else if (args.includes("ps")) console.log(data.stackIds.join("\\n"));
    else if (args.includes("config")) console.log(JSON.stringify({ services: data.services }));
    else process.exit(2);
} else if (args[0] === "container") {
    if (args[1] === "ls") console.log(Object.keys(data.containers).join("\\n"));
    else if (args[1] === "inspect") console.log(JSON.stringify(args.slice(2).map(id => data.containers[id])));
    else process.exit(2);
} else if (args[0] === "image") {
    if (args[1] === "inspect") console.log(JSON.stringify(args.slice(2).map(id => data.images[id])));
    else if (args[1] === "rm" && args[2] === "--no-prune") {
        if (args[3] === data.removalConflict) process.exit(1);
        console.log("Deleted: " + args[3]);
    } else process.exit(2);
} else if (args[0] === "buildx") {
    const content = data.manifests[args.at(-1)];
    if (!content) process.exit(1);
    process.stdout.write(content);
} else process.exit(2);
`, { mode: 0o755 });
    process.env.PATH = `${dir}:${originalPath}`;

    const projects = [
        { Name: "active",
            Status: "running(5)" },
        { Name: "stopped",
            Status: "exited(1)" },
        { Name: "external",
            Status: "running(1)" },
    ];
    const amd64 = { os: "linux",
        architecture: "amd64" };
    const arm64 = { os: "linux",
        architecture: "arm64",
        variant: "v8" };
    const armManifest = manifest(id("b"));
    const armDigest = digestOf(armManifest);
    const index = JSON.stringify({ schemaVersion: 2,
        manifests: [
            { digest: id("c"),
                platform: amd64 },
            { digest: armDigest,
                platform: arm64 },
        ] });

    await t.test("reads the deployed variant and reports partial registry failures without pulling", async () => {
        const containers = {
            classic: container("classic", id("a")),
            modern: container("modern", id("d"), "running", { platform: arm64,
                digest: armDigest }),
            current: container("current", id("d"), "running", { platform: arm64,
                digest: digestOf(armManifest) }),
            private: container("private", id("a")),
            pinned: container("pinned", id("a")),
        };
        await fixture({ projects,
            stackIds: Object.keys(containers),
            containers,
            images: { [id("a")]: { Os: "linux",
                Architecture: "arm64" } },
            services: {
                classic: { image: "example:stable" },
                modern: { image: "example:stable" },
                current: { image: "example:flat" },
                private: { image: "private:stable" },
                pinned: { image: "example@" + id("a") },
            },
            manifests: {
                "example:stable": index,
                ["example:stable@" + armDigest]: armManifest,
                "example:flat": armManifest,
            } });

        assert.deepEqual(await Stack.checkForUpdates(server), [{
            name: "active",
            available: [ "classic" ],
            unverified: [ "private" ],
        }]);
        const registryCalls = (await calls()).filter(args => args[0] === "buildx").map(args => args.at(-1));
        assert.deepEqual(registryCalls, [ "example:stable", "example:stable@" + armDigest, "example:flat", "private:stable" ]);
        assert.ok(!(await calls()).some(args => args.includes("pull") || args.includes("up")));
    });

    const before = {
        app: container("app", id("1")),
        worker: container("worker", id("2")),
        db: container("db", id("3")),
        tagged: container("tagged", id("4")),
        stoppedElsewhere: container("shared", id("5")),
        orphan: container("orphan", id("6")),
        conflict: container("conflict", id("7")),
        broken: container("broken", id("8")),
        migration: container("migration", id("9"), "exited"),
    };
    const after = {
        app: container("app", id("a")),
        worker: container("worker", id("b")),
        db: before.db,
        tagged: container("tagged", id("c")),
        stoppedElsewhere: container("shared", id("d")),
        conflict: container("conflict", id("e")),
        broken: container("broken", id("f"), "restarting"),
        migration: container("migration", id("a"), "exited"),
    };
    const updateFixture = (redeployed: boolean, projectList = projects) => fixture({
        projects: projectList,
        stackIds: Object.keys(redeployed ? after : before),
        containers: { ...(redeployed ? after : before),
            other: container("other", id("5"), "exited") },
        images: Object.fromEntries(Object.values(before).map(({ Image }) => [
            Image,
            { Id: Image,
                RepoTags: Image === id("4") ? [ "keep:backup" ] : [] },
        ])),
        removalConflict: id("7"),
    });
    const removals = async () => (await calls()).filter(args => args[0] === "image" && args[1] === "rm").map(args => args[3]);

    await t.test("removes only replaced, untagged, unused images after redeployment", async t => {
        await writeFile(callsFile, "");
        await updateFixture(false);
        t.mock.method(Terminal, "exec", async (_server, _socket, _name, _file, args: string[]) => {
            if (args.includes("up")) {
                await updateFixture(true);
            }
            return 0;
        });
        assert.deepEqual(await new Stack(server, "active").update(socket), { removed: 3,
            retained: 3 });
        assert.deepEqual(await removals(), [ id("1"), id("2"), id("7"), id("9") ]);
    });

    for (const phase of [ "pull", "up" ]) {
        await t.test(`keeps previous images when ${phase} fails`, async t => {
            await writeFile(callsFile, "");
            await updateFixture(false);
            t.mock.method(Terminal, "exec", async (_server, _socket, _name, _file, args: string[]) => args.includes(phase) ? 1 : 0);
            await assert.rejects(new Stack(server, "active").update(socket), /Failed to (pull|restart)/);
            assert.deepEqual(await removals(), []);
        });
    }

    await t.test("updating a stopped stack pulls only", async t => {
        await writeFile(callsFile, "");
        await updateFixture(false);
        const command = t.mock.method(Terminal, "exec", async (_server, _socket, _name, _file, _args: string[]) => 0);
        assert.equal(await new Stack(server, "stopped").update(socket), undefined);
        assert.equal(command.mock.callCount(), 1);
        assert.ok(command.mock.calls[0].arguments[4].includes("pull"));
        assert.deepEqual(await removals(), []);
    });
});
