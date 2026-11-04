import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import * as pty from "@homebridge/node-pty-prebuilt-multiarch";
import sqlite3 from "sqlite3";

test("native terminal runs a command and reports its output and exit code", { timeout: 15000 }, async (t) => {
    const terminal = pty.spawn(process.execPath, [ "-e", "process.stdout.write('dockge-native-terminal');" ], {
        name: "xterm",
        cols: 80,
        rows: 24,
        cwd: tmpdir(),
    });
    let exited = false;
    t.after(() => {
        if (!exited) {
            terminal.kill();
        }
    });
    let output = "";
    terminal.onData(data => {
        output += data;
    });
    const exitCode = await new Promise<number>(resolve => {
        terminal.onExit(event => {
            exited = true;
            resolve(event.exitCode);
        });
    });
    assert.equal(exitCode, 0);
    assert.match(output, /dockge-native-terminal/);
});

test("native SQLite opens a database and executes a query", { timeout: 15000 }, async () => {
    const database = new sqlite3.Database(":memory:");
    try {
        const row = await new Promise((resolve, reject) => {
            database.get("SELECT 42 AS answer", (error, result) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(result);
                }
            });
        });
        assert.deepEqual(row, { answer: 42 });
    } finally {
        await new Promise<void>((resolve, reject) => {
            database.close(error => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }
});
