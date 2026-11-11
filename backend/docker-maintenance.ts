import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
let pruning = false;

export interface CleanupImage {
    id: string;
    tags: string[];
}

interface DockerImage {
    Id: string;
    Parent?: string;
    RepoTags?: string[];
}

/** Run Docker without a shell, with bounded execution and output. */
async function docker(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("docker", args, {
        timeout: 15 * 60 * 1000,
        maxBuffer: 8 * 1024 * 1024,
        env: {
            ...process.env,
            LC_ALL: "C",
        },
    });
    return stdout;
}

/** Inspect in batches to keep command arguments bounded on large hosts. */
async function inspect<T>(kind: string, ids: string[]): Promise<T[]> {
    const result: T[] = [];
    for (let index = 0; index < ids.length; index += 100) {
        result.push(...JSON.parse(await docker([ kind, "inspect", ...ids.slice(index, index + 100) ])));
    }
    return result;
}

/** List unused images, preserving images used by stopped containers and their parents. */
export async function listImagesForCleanup(all: unknown): Promise<CleanupImage[]> {
    if (typeof all !== "boolean") {
        throw new Error("Invalid image cleanup mode");
    }
    const ids = [ ...new Set((await docker([ "image", "ls", "--all", "--quiet", "--no-trunc" ])).split(/\s+/).filter(Boolean)) ];
    const images = await inspect<DockerImage>("image", ids);
    const containerIds = (await docker([ "container", "ls", "--all", "--quiet" ])).split(/\s+/).filter(Boolean);
    const containers = await inspect<{ Image: string }>("container", containerIds);
    const protectedIds = new Set(containers.map(container => container.Image));
    const byId = new Map(images.map(image => [ image.Id, image ]));
    if (!all) {
        for (const image of images) {
            if (image.RepoTags?.length) {
                protectedIds.add(image.Id);
            }
        }
    }
    for (const id of protectedIds) {
        const parent = byId.get(id)?.Parent;
        if (parent) {
            protectedIds.add(parent);
        }
    }
    return images.filter(image => !protectedIds.has(image.Id))
        .map(image => ({
            id: image.Id,
            tags: (image.RepoTags || []).filter(tag => tag !== "<none>:<none>").sort(),
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
}

/** Prune images on this Docker host, allowing only one operation at a time. */
export async function pruneImages(all: unknown, expectedImages: CleanupImage[]) {
    if (typeof all !== "boolean") {
        throw new Error("Invalid image cleanup mode");
    }
    if (pruning) {
        throw new Error("Image cleanup is already running on this host");
    }
    pruning = true;
    try {
        const images = await listImagesForCleanup(all);
        if (JSON.stringify(images) !== JSON.stringify(expectedImages)) {
            throw new Error("Image list changed. Please reopen the cleanup dialog.");
        }
        if (!images.length) {
            return {
                images: [],
                reclaimedSpace: "",
            };
        }
        const args = [ "image", "prune", "--force" ];
        if (all) {
            args.push("--all");
        }
        const output = await docker(args);
        // Docker also prints deleted layer digests. Only report deleted image IDs,
        // using the tags saved before pruning rather than exposing raw Docker output.
        const deletedIds = new Set(Array.from(output.matchAll(/^deleted:\s+(?:sha256:)?([a-f0-9]{64})\s*$/gm), match => `sha256:${match[1]}`));
        return {
            images: images.filter(image => deletedIds.has(image.id)),
            reclaimedSpace: output.match(/^Total reclaimed space:\s*(.+)$/m)?.[1]?.trim() || "",
        };
    } finally {
        pruning = false;
    }
}
