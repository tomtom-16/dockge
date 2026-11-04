import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { R } from "redbean-node";
import jwt from "jsonwebtoken";
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
        const user = R.dispense("user");
        user.username = "compatibility-user";
        user.password = legacyHash;
        const id = await R.store(user);
        await R.close();

        await Database.init(server);
        const restored = await R.load("user", id) as User;
        assert.equal(restored.username, "compatibility-user");
        assert.equal(verifyPassword(password, restored.password), true);
        assert.equal(typeof restored.resetPassword, "function");
        const token = User.createJWT(restored, "compatibility-test-secret");
        const decoded = jwt.verify(token, "compatibility-test-secret") as jwt.JwtPayload;
        assert.equal(decoded.username, "compatibility-user");
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
