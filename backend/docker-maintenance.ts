import { docker, inspectDocker } from "./docker-cli";
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

/** List unused images, preserving images used by stopped containers and their parents. */
export async function listImagesForCleanup(all: unknown): Promise<CleanupImage[]> {
    if (typeof all !== "boolean") {
        throw new Error("Invalid image cleanup mode");
    }
    const ids = [ ...new Set((await docker([ "image", "ls", "--all", "--quiet", "--no-trunc" ])).split(/\s+/).filter(Boolean)) ];
    const images = await inspectDocker<DockerImage>("image", ids);
    const containerIds = (await docker([ "container", "ls", "--all", "--quiet" ])).split(/\s+/).filter(Boolean);
    const containers = await inspectDocker<{ Image: string }>("container", containerIds);
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

/** Remove only the image IDs replaced by a successful stack update. */
export async function removeReplacedImages(ids: Set<string>) {
    const result = { removed: 0,
        retained: ids.size };
    if (!ids.size) {
        return result;
    }

    const options = { signal: AbortSignal.timeout(15000) };
    const containerIds = (await docker([ "container", "ls", "--all", "--quiet" ], options)).trim().split(/\s+/).filter(Boolean);
    const containers = await inspectDocker<{ Image: string }>("container", containerIds, options);
    const used = new Set(containers.map(container => container.Image));
    for (const id of ids) {
        if (used.has(id)) {
            continue;
        }
        try {
            const [ image ] = await inspectDocker<DockerImage>("image", [ id ], options);
            if (image?.Id !== id || image.RepoTags?.some(tag => tag !== "<none>:<none>")) {
                continue;
            }
            const output = await docker([ "image", "rm", "--no-prune", id ], options);
            if (output.split(/\r?\n/).some(line => line.trim() === `Deleted: ${id}`)) {
                result.removed++;
                result.retained--;
            }
        } catch {
            // Docker can reject removal if the image disappeared or gained a reference.
        }
    }
    return result;
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
