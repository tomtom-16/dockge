import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Stack } from "../backend/stack";
import type { DockgeServer } from "../backend/dockge-server";
import { ValidationError } from "../backend/util-server";

test("stack lookup rejects escaping names before accessing the filesystem", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "dockge-stack-path-"));
    t.after(() => rm(directory, { recursive: true,
        force: true }));
    const stacksDir = join(directory, "stacks");
    const outsideDir = join(directory, "outside");
    await mkdir(stacksDir);
    await mkdir(outsideDir);
    await writeFile(join(outsideDir, "compose.yaml"), "services: {}\n");
    await writeFile(join(outsideDir, ".env"), "SECRET=outside\n");
    const server = { stacksDir } as DockgeServer;

    for (const name of [ "../outside", "..", ".", "app/../../outside", "app\\..\\outside", outsideDir, "", "app\n" ]) {
        for (const skipFSOperations of [ false, true ]) {
            await assert.rejects(Stack.getStack(server, name, skipFSOperations), ValidationError);
        }
    }
    await mkdir(join(stacksDir, "app_1-test"));
    await writeFile(join(stacksDir, "app_1-test", "compose.yaml"), "services: {}\n");
    assert.equal((await Stack.getStack(server, "app_1-test")).name, "app_1-test");
    assert.equal(await readFile(join(outsideDir, ".env"), "utf8"), "SECRET=outside\n");
});

test("stack saves persist, update and clear .env without creating unnecessary files", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "dockge-stack-save-"));
    t.after(() => rm(directory, { recursive: true,
        force: true }));
    const server = { stacksDir: directory } as DockgeServer;
    const originalPUID = process.env.PUID;
    const originalPGID = process.env.PGID;
    delete process.env.PUID;
    delete process.env.PGID;
    t.after(() => {
        if (originalPUID === undefined) {
            delete process.env.PUID;
        } else {
            process.env.PUID = originalPUID;
        }
        if (originalPGID === undefined) {
            delete process.env.PGID;
        } else {
            process.env.PGID = originalPGID;
        }
    });

    const compose = "services: {}\n";
    const envPath = join(directory, "app", ".env");
    await new Stack(server, "app", compose, "IMAGE_TAG=v1\n").save(true);
    assert.equal(await readFile(envPath, "utf8"), "IMAGE_TAG=v1\n");
    await new Stack(server, "app", compose, "IMAGE_TAG=v2\n").save(false);
    assert.equal((await Stack.getStack(server, "app")).composeENV, "IMAGE_TAG=v2\n");
    await new Stack(server, "app", compose, "").save(false);
    assert.equal(await readFile(envPath, "utf8"), "");

    await new Stack(server, "without-env", compose, "\n").save(true);
    await assert.rejects(stat(join(directory, "without-env", ".env")), { code: "ENOENT" });

    await t.test("ownership applies to both saved files and the directory", async (t) => {
        const ownedPaths: string[] = [];
        t.mock.method(fs, "lchownSync", (path, uid, gid) => {
            assert.equal(uid, 1234);
            assert.equal(gid, 5678);
            ownedPaths.push(String(path));
        });
        t.mock.method(fs, "chownSync", (path, uid, gid) => {
            assert.equal(uid, 1234);
            assert.equal(gid, 5678);
            ownedPaths.push(String(path));
        });
        process.env.PUID = "1234";
        process.env.PGID = "5678";
        await new Stack(server, "owned", compose, "IMAGE_TAG=v3\n").save(true);
        assert.deepEqual(ownedPaths, [ join(directory, "owned"), join(directory, "owned", "compose.yaml"), join(directory, "owned", ".env") ]);
        assert.equal(await readFile(join(directory, "owned", ".env"), "utf8"), "IMAGE_TAG=v3\n");
    });
});
