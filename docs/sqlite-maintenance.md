# SQLite maintenance

The Docker images use Node.js 26 on Debian 13 (Trixie). The `sqlite3` npm driver
remains at 6.0.1; its version is different from the SQLite engine version.
`extra/build-sqlite.mjs` downloads SQLite **3.54.1** from sqlite.org, checks the
published SHA3-256 digest, and builds a position-independent static library.
The driver is compiled against that library using its supported `--sqlite`
option. The runtime image needs neither Python nor a system SQLite library.

A plain `npm ci` outside Docker still uses the driver's bundled SQLite 3.52.0.
To use the pinned engine on Linux or macOS, install a C/C++ toolchain, Python,
curl and tar, then run:

```sh
node extra/build-sqlite.mjs /tmp/dockge-sqlite
npm_config_sqlite=/tmp/dockge-sqlite npm_config_build_from_source=sqlite3 npm rebuild sqlite3
npm run test:native
npm run test:compat
```

When upgrading SQLite, update the source version, year and checksum in the build
script and the version assertions in both Dockerfiles. Use the digest published
at https://sqlite.org/download.html and review https://sqlite.org/changes.html.
Docker builds fail if the checksum or the loaded engine version is wrong.

## Connections and storage

Each connection enables foreign keys, a 5-second SQLite lock timeout, a 12 MB
page cache and `synchronous=FULL`. FULL requests a WAL sync after each commit,
improving durability during power loss compared with NORMAL at some write cost.
The pool has one connection; its 120-second acquisition timeout is separate from
the SQLite lock timeout. WAL mode is checked at startup. Keep the data directory
on a local filesystem supporting SQLite locking, not NFS/SMB.

New databases request incremental auto-vacuum before migrations create tables.
An existing database in NONE mode remains in that mode unless explicitly rebuilt
with VACUUM; startup does not perform that potentially expensive rewrite.

## Backup and restore

Create a consistent database snapshot while Dockge is running:

```sh
# Local checkout; defaults to DOCKGE_DATA_DIR/dockge.db or ./data/dockge.db
npm run backup:db -- /safe/location/dockge-backup.db
# Optional explicit source, opened read-only; no migrations are run
npm run backup:db -- /safe/location/dockge-backup.db /path/to/data/dockge.db
# Container built from this checkout; choose a mounted backup directory
# (or copy the resulting backup out of the container afterward).
docker exec dockge npm run backup:db -- /app/data/dockge-backup.db
```

The destination must not exist. The command uses SQLite `VACUUM INTO`, which
includes committed WAL contents in a standalone database, and creates the output
with private permissions (0600 on Unix). A failed snapshot removes its partial
output. Protect backups: they contain password hashes, settings and agent
credentials. Copy completed snapshots to storage outside the data volume.
Do not copy only `dockge.db` while Dockge is writing: committed data may still be
in `dockge.db-wal`.

Before upgrading an installation, retain its existing image and stop Dockge to
archive the entire data directory (including `db-config.json` and any WAL/SHM
files). This also works with older images without the backup command.
Back up the stacks directory separately: the database snapshot does not include
Compose files, environment files, volumes or application data.

To restore a snapshot, stop Dockge and archive the entire current data directory.
Replace `dockge.db` with the snapshot, remove the old `dockge.db-wal` and
`dockge.db-shm` from the restored directory, and preserve the application's file
ownership and restrictive permissions. Keep `db-config.json` configured for
SQLite. Restart Dockge and check its logs. Never replace or delete a live database
or its WAL/SHM files. Test restore procedures on a separate installation first.

## Validation

`npm run test:compat` checks migrations, connection replacement, persistence,
SQLite integrity and live WAL snapshots without overwriting existing backups.
The Docker dependency stage runs these tests and native-module tests against the
pinned SQLite version. CI builds this stage on Ubuntu in addition to the native
Linux/macOS/Windows checks. Docker upgrades require rebuilding the image; changing
the host's SQLite installation does not update the embedded engine.
