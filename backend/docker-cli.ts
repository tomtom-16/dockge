import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
type DockerOptions = { cwd?: string;
    signal?: AbortSignal;
    timeout?: number };

export async function docker(args: string[], options: DockerOptions = {}): Promise<string> {
    const { stdout } = await execFileAsync("docker", args, {
        timeout: 15 * 60 * 1000,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env,
            LC_ALL: "C" },
        ...options,
    });
    return stdout;
}

/** Inspect in batches to keep command arguments bounded on large hosts. */
export async function inspectDocker<T>(kind: "image" | "container", ids: string[], options?: DockerOptions): Promise<T[]> {
    const result: T[] = [];
    for (let index = 0; index < ids.length; index += 100) {
        result.push(...JSON.parse(await docker([ kind, "inspect", ...ids.slice(index, index + 100) ], options)));
    }
    return result;
}
