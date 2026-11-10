import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Stack } from "../backend/stack";
import type { DockgeServer } from "../backend/dockge-server";
import { CREATED_STACK, EXITED, RUNNING, UNKNOWN } from "../common/util-common";

test("stack list, detail status and updateStatus resolve clean exits conservatively", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "dockge-status-test-"));
    const originalPath = process.env.PATH;
    const callsFile = join(directory, "calls.jsonl");
    const fixtureFile = join(directory, "fixture.json");
    const server = { stacksDir: directory } as DockgeServer;
    await writeFile(join(directory, "docker"), `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify(args) + "\\n");
const fixture = JSON.parse(fs.readFileSync(${JSON.stringify(fixtureFile)}, "utf8"));
if (args[0] === "compose" && args[1] === "ls") {
    console.log(JSON.stringify(fixture.compose));
} else if (args[0] === "ps") {
    if (fixture.error) { console.error("Docker unavailable"); process.exit(1); }
    process.stdout.write(fixture.raw ?? fixture.containers.map(row => JSON.stringify(row)).join("\\n"));
} else if (args.includes("ps")) {
    console.log(JSON.stringify(fixture.services));
} else {
    process.exit(2);
}
`, { mode: 0o755 });
    process.env.PATH = `${directory}:${originalPath}`;
    const row = (State: string, Status = "", Project = "trk") => ({ Project,
        State,
        Status });
    const trk = [ row("running", "Up 1 minute (healthy)"), row("running", "Up 1 minute (healthy)"), row("exited", "Exited (0) 1 minute ago"), row("exited", "Exited (0) 1 minute ago") ];
    const scenarios = [
        { name: "TRK with two successful init tasks",
            status: "exited(2), running(2)",
            containers: trk,
            expected: RUNNING },
        { name: "reverse summary order",
            status: "running(2), exited(2)",
            containers: trk,
            expected: RUNNING },
        { name: "nonzero exit",
            containers: [ ...trk.slice(0, 3), row("exited", "Exited (1) 1 minute ago") ],
            expected: EXITED },
        { name: "unknown exit code",
            containers: [ ...trk.slice(0, 3), row("exited", "Exited (?)") ],
            expected: EXITED },
        { name: "missing exit code",
            containers: [ ...trk.slice(0, 3), row("exited") ],
            expected: EXITED },
        { name: "missing state",
            containers: [ ...trk.slice(0, 3), { Project: "trk",
                Status: "Exited (0)" }],
            expected: EXITED },
        { name: "no running containers",
            status: "exited(2)",
            containers: trk.slice(2),
            expected: EXITED,
            extraCalls: 0 },
        { name: "all running",
            status: "running(2)",
            containers: trk.slice(0, 2),
            expected: RUNNING,
            extraCalls: 0 },
        { name: "running containers disappeared",
            containers: trk.slice(2),
            expected: EXITED },
        { name: "exited container disappeared",
            containers: trk.slice(0, 3),
            expected: EXITED },
        { name: "Docker error",
            error: true,
            expected: EXITED },
        { name: "empty Docker output",
            raw: "",
            expected: EXITED },
        { name: "malformed row alongside valid rows",
            raw: trk.map(r => JSON.stringify(r)).join("\n") + "\ninvalid",
            expected: EXITED },
        { name: "null Docker row",
            raw: "null",
            expected: EXITED },
        { name: "empty Docker object",
            raw: "{}",
            expected: EXITED },
        { name: "health remains separate",
            containers: [ row("running", "Up (unhealthy)"), ...trk.slice(1) ],
            expected: RUNNING },
    ];
    for (const state of [ "created", "paused", "restarting", "dead", "removing", "unknown" ]) {
        scenarios.push({ name: `mixed ${state}`,
            status: `exited(2), running(2), ${state}(1)`,
            expected: EXITED,
            extraCalls: 0 });
        scenarios.push({ name: `snapshot changed to ${state}`,
            containers: [ ...trk, row(state) ],
            expected: EXITED });
        scenarios.push({ name: `existing ${state} mapping`,
            status: `${state}(1)`,
            expected: state === "created" ? CREATED_STACK : UNKNOWN,
            extraCalls: 0 });
    }
    try {
        for (const scenario of scenarios) {
            await t.test(scenario.name, async () => {
                const compose = [{ Name: "trk",
                    Status: scenario.status ?? "exited(2), running(2)" }];
                await writeFile(fixtureFile, JSON.stringify({ compose,
                    containers: trk,
                    ...scenario }));
                await writeFile(callsFile, "");
                assert.equal((await Stack.getStatusList()).get("trk"), scenario.expected);
                assert.equal((await Stack.getStackList(server)).get("trk")?.status, scenario.expected);
                const stack = new Stack(server, "trk", undefined, undefined, true);
                await stack.updateStatus();
                assert.equal(stack.status, scenario.expected);
                assert.equal((stack.toSimpleJSON("") as { status: number }).status, scenario.expected);
                const calls = (await readFile(callsFile, "utf8")).trim().split("\n").map(line => JSON.parse(line));
                assert.equal(calls.filter(args => args[0] === "ps").length, 3 * (scenario.extraCalls ?? 1));
                assert.equal(calls.filter(args => args[0] === "compose").length, 3);
                for (const args of calls.filter(args => args[0] === "ps")) {
                    assert.deepEqual(args.slice(0, 5), [ "ps", "--all", "--filter", "label=com.docker.compose.project", "--format" ]);
                    assert.match(args[5], /\.Label "com.docker.compose.project"/);
                }
            });
        }
        await t.test("multiple projects share one read and retain independent status", async () => {
            await writeFile(fixtureFile, JSON.stringify({
                compose: [ "trk", "second", "failed" ].map(Name => ({ Name,
                    Status: "exited(2), running(2)" })),
                containers: [ ...trk, ...trk.map(r => ({ ...r,
                    Project: "second" })),
                ...trk.map(r => ({ ...r,
                    Project: "failed",
                    Status: r.State === "exited" ? "Exited (2)" : r.Status })) ],
            }));
            await writeFile(callsFile, "");
            assert.deepEqual(await Stack.getStatusList(), new Map([[ "trk", RUNNING ], [ "second", RUNNING ], [ "failed", EXITED ]]));
            assert.equal((await readFile(callsFile, "utf8")).trim().split("\n").length, 2);
        });
        await t.test("service health indicators are preserved", async () => {
            await mkdir(join(directory, "trk"));
            await writeFile(fixtureFile, JSON.stringify({ services: [
                { Service: "app",
                    State: "running",
                    Health: "healthy",
                    Name: "trk-app-1" },
                { Service: "db",
                    State: "running",
                    Health: "unhealthy",
                    Name: "trk-db-1" },
                { Service: "worker",
                    State: "running",
                    Health: "starting",
                    Name: "trk-worker-1" },
            ] }));
            const stack = new Stack(server, "trk", undefined, undefined, true);
            assert.deepEqual(Object.fromEntries(await stack.getServiceStatusList()), {
                app: [{ status: "healthy",
                    name: "trk-app-1" }],
                db: [{ status: "unhealthy",
                    name: "trk-db-1" }],
                worker: [{ status: "starting",
                    name: "trk-worker-1" }],
            });
        });
    } finally {
        process.env.PATH = originalPath;
        await rm(directory, { recursive: true,
            force: true });
    }
});
