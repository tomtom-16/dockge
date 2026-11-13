import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { Terminal } from "../backend/terminal";
import type { DockgeServer } from "../backend/dockge-server";

test("web terminal provides TERM and preserves the parent environment", { timeout: 15000 }, async (t) => {
    const originalTERM = process.env.TERM;
    delete process.env.TERM;
    const terminal = new Terminal({} as DockgeServer, "env-test", process.execPath,
        [ "-e", "process.stdout.write(JSON.stringify({ term: process.env.TERM, path: process.env.PATH }));" ], tmpdir());
    t.after(() => {
        terminal.close();
        if (originalTERM === undefined) {
            delete process.env.TERM;
        } else {
            process.env.TERM = originalTERM;
        }
    });
    const exitCode = await new Promise<number>(resolve => {
        terminal.onExit(resolve);
        terminal.start();
    });
    assert.equal(exitCode, 0);
    assert.deepEqual(JSON.parse(terminal.getBuffer()), {
        term: "xterm-256color",
        path: process.env.PATH,
    });
});
