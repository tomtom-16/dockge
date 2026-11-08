// Build the pinned upstream SQLite as a static library for node-sqlite3.
// Keep this version, checksum and the Docker version assertion in sync.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const archiveVersion = "3540100";
const checksum = "b6ced585c750916b1052667239a12c25a7ff34e7f06e1e6e01ecb0427657d9c4";
const prefix = path.resolve(process.argv[2] || "/opt/sqlite");
const directory = mkdtempSync(path.join(tmpdir(), "dockge-sqlite-"));
try {
    const archive = path.join(directory, "sqlite.tar.gz");
    execFileSync("curl", [ "--fail", "--location", "--retry", "3", "--max-time", "120", `https://sqlite.org/2026/sqlite-autoconf-${archiveVersion}.tar.gz`, "--output", archive ], { stdio: "inherit" });
    const actual = createHash("sha3-256").update(readFileSync(archive)).digest("hex");
    if (actual !== checksum) {
        throw new Error("SQLite source checksum mismatch");
    }
    execFileSync("tar", [ "-xzf", archive, "-C", directory ]);
    const source = path.join(directory, `sqlite-autoconf-${archiveVersion}`);
    // Match the features enabled by node-sqlite3's bundled build.
    const defines = [ "SQLITE_THREADSAFE=1", "HAVE_USLEEP=1", "SQLITE_ENABLE_FTS3", "SQLITE_ENABLE_FTS4", "SQLITE_ENABLE_FTS5", "SQLITE_ENABLE_RTREE", "SQLITE_ENABLE_DBSTAT_VTAB=1", "SQLITE_ENABLE_MATH_FUNCTIONS" ];
    execFileSync("cc", [ "-O2", "-fPIC", ...defines.map(value => `-D${value}`), "-c", "sqlite3.c", "-o", "sqlite3.o" ], { cwd: source, stdio: "inherit" });
    mkdirSync(path.join(prefix, "lib"), { recursive: true });
    mkdirSync(path.join(prefix, "include"), { recursive: true });
    execFileSync("ar", [ "rcs", path.join(prefix, "lib/libsqlite3.a"), path.join(source, "sqlite3.o") ]);
    for (const header of [ "sqlite3.h", "sqlite3ext.h" ]) {
        copyFileSync(path.join(source, header), path.join(prefix, "include", header));
    }
    writeFileSync(path.join(prefix, "version"), "3.54.1\n");
} finally {
    rmSync(directory, { recursive: true, force: true });
}
