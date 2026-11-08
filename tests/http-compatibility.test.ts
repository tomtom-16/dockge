import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

test("Express serves root, nested application routes, robots and compressed assets", { timeout: 15000 }, async () => {
    const previousDirectory = process.cwd();
    const previousEnvironment = process.env.NODE_ENV;
    const directory = await mkdtemp(path.join(tmpdir(), "dockge-http-compat-"));
    const html = "<!doctype html><html><body>Dockge route fixture</body></html>";
    const javascript = "window.dockgeCompatibility = true;";
    process.env.NODE_ENV = "test";
    let server;
    try {
        await mkdir(path.join(directory, "frontend-dist"));
        await writeFile(path.join(directory, "frontend-dist/index.html"), html);
        await writeFile(path.join(directory, "frontend-dist/app.js"), javascript);
        await writeFile(path.join(directory, "frontend-dist/app.js.gz"), gzipSync(javascript));
        await writeFile(path.join(directory, "frontend-dist/app.js.br"), brotliCompressSync(javascript));
        process.chdir(directory);
        const { DockgeServer } = await import("../backend/dockge-server");
        server = new DockgeServer();
        server.httpServer.listen(0, "127.0.0.1");
        await once(server.httpServer, "listening");
        const address = server.httpServer.address() as AddressInfo;
        const base = `http://127.0.0.1:${address.port}`;
        for (const route of [ "/", "/compose/example", "/compose/example?tab=logs" ]) {
            const response = await fetch(base + route);
            assert.equal(response.status, 200);
            assert.equal(await response.text(), html);
        }
        const robots = await fetch(base + "/robots.txt");
        assert.match(robots.headers.get("content-type") || "", /text\/plain/);
        assert.equal(await robots.text(), "User-agent: *\nDisallow: /");
        for (const encoding of [ "gzip", "br" ]) {
            const response = await fetch(base + "/app.js", {
                headers: { "accept-encoding": encoding },
            });
            assert.equal(response.status, 200);
            assert.equal(response.headers.get("content-encoding"), encoding);
            assert.equal(await response.text(), javascript);
        }
    } finally {
        if (server) {
            await new Promise<void>(resolve => server.io.close(() => resolve()));
        }
        process.chdir(previousDirectory);
        if (previousEnvironment === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = previousEnvironment;
        }
        await rm(directory, {
            recursive: true,
            force: true,
        });
    }
});
