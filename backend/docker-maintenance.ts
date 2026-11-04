import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
let pruning = false;

/** Prune images on this Docker host, allowing only one operation at a time. */
export async function pruneImages(all: unknown): Promise<string> {
    if (typeof all !== "boolean") {
        throw new Error("Invalid image cleanup mode");
    }
    if (pruning) {
        throw new Error("Image cleanup is already running on this host");
    }
    pruning = true;
    try {
        const args = [ "image", "prune", "--force" ];
        if (all) {
            args.push("--all");
        }
        const { stdout } = await execFileAsync("docker", args, {
            timeout: 15 * 60 * 1000,
            maxBuffer: 8 * 1024 * 1024,
            env: {
                ...process.env,
                LC_ALL: "C",
            },
        });
        return stdout;
    } finally {
        pruning = false;
    }
}
