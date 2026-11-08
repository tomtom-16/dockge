# Dependency maintenance

The November 2026 maintenance keeps Node.js 26 and Debian Trixie and refreshes the
server and build tools alongside the pinned SQLite 3.54.1 engine.

| Component | Previous version | Selected version |
| --- | --- | --- |
| Express / static gzip middleware | 4.22.3 / 2.1.8 | 5.3.0 / 3.0.2 |
| Croner | 8.1.2 | 11.0.0 |
| dotenv | 16.6.1 | 18.0.9 |
| graceful shutdown | 3.1.16 | 4.0.0 |
| promisify-child-process | 4.1.2 | 5.0.1 |
| password strength checker | 2.0.10 | 3.0.0 |
| environment substitution | 0.16.0 | 0.17.0 |
| TypeScript | 5.9.3 | 6.0.3 |
| ESLint / Vue plugin | 8.57.1 / 9.32.0 | 10.14.0 / 10.12.0 |
| Go healthcheck compiler | 1.21.4 or 1.24 | 1.27.3 |
| Vue / Vite / Sass | 3.5.44 / 8.3.5 / 1.107.1 | 3.5.45 / 8.3.6 / 1.108.1 |

Express 5 requires a named wildcard, so the SPA fallback is now `/{*path}`.
Croner requires a constructor call; the periodic refresh also returns its promise
so overrun protection waits for completion. Child-process calls use named exports
with version 5. Existing password hashes remain unchanged.

ESLint uses `eslint.config.mjs` and the maintained Stylistic rules instead of the
legacy configuration. The unused JSDoc plugin and the unused MySQL driver were
removed. SQLite is currently the only implemented database backend.

The minimatch overrides for ESLint, its config-array dependency and the TypeScript
parser select the fixed 11.x release for GHSA-g3hv-75wg-m249. Keep these overrides
until the upstream dependencies include the fix; re-run lint and audit when
removing them.

The Go healthcheck is compiled from the source in this checkout in both Docker
build paths. The main image no longer copies a separately published healthcheck
binary whose compiler version could be stale. SQLite compilation is cached before
npm dependencies so dependency-only updates do not rebuild the engine.

## Version choices

TypeScript 7 is outside `@typescript-eslint/parser` 8.72.1's supported range
(`>=4.8.4 <6.1.0`), so 6.0.3 is the newest supported version for this toolchain.
Do not force TypeScript 7 through peer dependency checks.

BootstrapVueNext 1.x, Font Awesome 7 and Vue Router 5 are separate interface
migrations. Their current versions remain in place; upgrading them requires
checking modals, dropdowns, icons and navigation in the browser. Vue Toastification
2 RC is the Vue 3-compatible branch used by this app; its `latest` npm tag points
to the older Vue 2 branch, so it must not be downgraded automatically.

Composerize and its composeverter dependency still bring in core-js 2. Their
latest published releases retain that dependency; forcing core-js 3 is not a
compatible version bump. Replacing that conversion engine is a separate change.
The final dependency audit reports no known vulnerabilities.

## Checks

```sh
npm ci
npm run lint
npm run check-ts
npm run test:native
npm run test:compat
npm run test:maintenance
npm run build:frontend
npm audit
```

Compatibility tests cover existing bcrypt hashes, SQLite migrations and backups,
Compose substitution and dotenv parsing, password policy, asynchronous Cron
execution, child-process output/errors, real Express routes and precompressed
assets. HTTP tests bind an ephemeral loopback port and use a temporary frontend
fixture without requiring a frontend build. Run both Docker target architectures
when changing native dependencies or base images.

The Linux, macOS and Windows CI workflow also builds the Trixie SQLite dependency
stage on Linux. GitHub checkout/setup-node actions use v6/v7, which require current
hosted runners.

Cross-platform Docker build tests use an esbuild transformer copied from the
native build stage. Transformation is architecture-independent, while SQLite,
the terminal module and Node still run as the target architecture. This avoids
Go/esbuild crashes observed under QEMU on an ARM host without skipping HTTP tests.
The override applies only to build tests; the release image keeps its own
architecture's esbuild binary. Native ARM64 runtime startup, WebSocket setup/login,
JWT login, backup, clean shutdown and persisted login after restart were also
checked in an isolated container.
