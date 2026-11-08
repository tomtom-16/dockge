import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { R } from "redbean-node";
import jwt from "jsonwebtoken";
import sqlite from "sqlite3";
import { Cron } from "croner";
import { parse as parseEnvironment } from "dotenv";
import { spawn, isChildProcessError } from "promisify-child-process";
import { passwordStrength } from "check-password-strength";
import { backupSQLite } from "../backend/sqlite-backup";
import { Database } from "../backend/database";
import type { DockgeServer } from "../backend/dockge-server";
import { User } from "../backend/models/user";
import { generatePasswordHash, verifyPassword } from "../backend/password-hash";
import { envsubstYAML } from "../common/util-common";
import { parseDocument } from "yaml";

const password = "DockgeCompatibility2026!";
// Generated with bcryptjs 2.4.3 before upgrading the password library.
const legacyHash = "$2a$10$abcdefghijklmnopqrstuuhZV4XuXwlYWLTgrfHX6IGfGjVG3jFya";

test("passwords hashed by the previous bcrypt version remain valid", () => {
    assert.equal(verifyPassword(password, legacyHash), true);
    assert.equal(verifyPassword("incorrect", legacyHash), false);
    assert.equal(verifyPassword(password, generatePasswordHash(password)), true);
});

test("Compose variable substitution preserves YAML types and comments", () => {
    const source = "# example stack\nservices:\n  app:\n    image: ${IMAGE}\n    ports:\n      - ${PORT}:80\n    environment:\n      VALUE: ${VALUE}\n";
    const document = parseDocument(envsubstYAML(source, {
        IMAGE: "nginx:alpine",
        PORT: "8080",
        VALUE: "false",
    }));
    assert.equal(document.errors.length, 0);
    assert.match(document.toString(), /# example stack/);
    assert.deepEqual(document.toJS().services.app, {
        image: "nginx:alpine",
        ports: [ "8080:80" ],
        environment: { VALUE: "false" },
    });
});

test("SQLite migrations, model loading and user records survive a database reopen", { timeout: 30000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), "dockge-database-compat-"));
    const server = { config: { dataDir: directory } } as DockgeServer;
    try {
        await Database.init(server);
        for (let attempt = 0; attempt < 2; attempt++) {
            assert.equal(await R.getCell("PRAGMA foreign_keys", [], false), 1);
            assert.equal(await R.getCell("PRAGMA synchronous", [], false), 2);
            assert.equal(await R.getCell("PRAGMA busy_timeout", [], false), 5000);
            assert.equal(await R.getCell("PRAGMA journal_mode", [], false), "wal");
            if (attempt === 0) {
                // Replacing a pooled connection must preserve connection-local settings.
                const connection = await R.knex.client.acquireConnection();
                connection.__knex__disposed = "test connection replacement";
                await R.knex.client.releaseConnection(connection);
            }
        }
        const user = R.dispense("user");
        user.username = "compatibility-user";
        user.password = legacyHash;
        const id = await R.store(user);
        const backup = join(directory, "snapshot 'quoted'.db");
        await backupSQLite(Database.sqlitePath, backup);
        if (process.platform !== "win32") {
            assert.equal((await stat(backup)).mode & 0o777, 0o600);
        }
        const before = await readFile(backup);
        await assert.rejects(backupSQLite(Database.sqlitePath, backup), /EEXIST/);
        assert.deepEqual(await readFile(backup), before);
        // Later writes must not affect the standalone snapshot.
        user.username = "updated-user";
        await R.store(user);
        const snapshot = new sqlite.Database(backup, sqlite.OPEN_READONLY);
        try {
            const row = await new Promise((resolve, reject) => {
                snapshot.get("SELECT username FROM user WHERE id = ?", [ id ], (error, result) => error ? reject(error) : resolve(result));
            });
            assert.deepEqual(row, { username: "compatibility-user" });
        } finally {
            await new Promise<void>((resolve, reject) => snapshot.close(error => error ? reject(error) : resolve()));
        }
        await R.close();

        await Database.init(server);
        const restored = await R.load("user", id) as User;
        assert.equal(restored.username, "updated-user");
        assert.equal(verifyPassword(password, restored.password), true);
        assert.equal(typeof restored.resetPassword, "function");
        const token = User.createJWT(restored, "compatibility-test-secret");
        const decoded = jwt.verify(token, "compatibility-test-secret") as jwt.JwtPayload;
        assert.equal(decoded.username, "updated-user");
        await restored.resetPassword("UpdatedCompatibility2026!");
        const updated = await R.load("user", id);
        assert.equal(verifyPassword("UpdatedCompatibility2026!", updated.password), true);
        assert.equal((await R.getRow("PRAGMA integrity_check")).integrity_check, "ok");
    } finally {
        await R.close();
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
});

test("failed SQLite backups leave no partial files and do not create a missing source", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dockge-backup-failure-"));
    const source = join(directory, "missing.db");
    const output = join(directory, "backup.db");
    try {
        await assert.rejects(backupSQLite(source, output), /SQLITE_CANTOPEN/);
        await assert.rejects(stat(source), /ENOENT/);
        await assert.rejects(stat(output), /ENOENT/);
        await writeFile(source, "not a SQLite database");
        await assert.rejects(backupSQLite(source, output), /SQLITE_NOTADB/);
        await assert.rejects(stat(output), /ENOENT/);
    } finally {
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
});

test("environment parsing and password policy remain compatible", () => {
    assert.deepEqual(parseEnvironment("EMPTY=\nQUOTED=\"space # literal\"\nMULTILINE=\"first\\nsecond\"\nCOMMENT=value # comment\nDOLLAR=$VALUE\n"), {
        EMPTY: "",
        QUOTED: "space # literal",
        MULTILINE: "first\nsecond",
        COMMENT: "value",
        DOLLAR: "$VALUE",
    });
    assert.equal(passwordStrength("a").value, "Too weak");
    assert.notEqual(passwordStrength(password).value, "Too weak");
});

test("child process results and errors retain Docker command output", async () => {
    const result = await spawn(process.execPath, [ "-e", "process.stdout.write('output');process.stderr.write('diagnostic');" ], {
        encoding: "utf8",
    });
    assert.equal(result.stdout, "output");
    assert.equal(result.stderr, "diagnostic");
    await assert.rejects(spawn(process.execPath, [ "-e", "process.stderr.write('failure');process.exitCode = 7;" ], {
        encoding: "utf8",
    }), error => {
        assert.ok(isChildProcessError(error));
        assert.equal(error.code, 7);
        assert.equal(error.stderr, "failure");
        return true;
    });
});

test("Cron awaits asynchronous refreshes and retains the ten-second schedule", async () => {
    let finish = () => {};
    const completion = new Promise<void>(resolve => {
        finish = resolve;
    });
    const cron = new Cron("*/10 * * * * *", {
        paused: true,
        protect: true,
        timezone: "UTC",
    }, async () => {
        await completion;
    });
    try {
        assert.equal(cron.nextRun(new Date("2026-01-01T00:00:01Z"))?.toISOString(), "2026-01-01T00:00:10.000Z");
        const refresh = cron.trigger();
        assert.equal(cron.isBusy(), true);
        finish();
        await refresh;
        assert.equal(cron.isBusy(), false);
    } finally {
        finish();
        cron.stop();
    }
});
