import { createHash } from "node:crypto";
import { docker, inspectDocker } from "./docker-cli";
import type { Stack } from "./stack";
import type { StackUpdateCheck } from "../common/stack-updates";

interface Platform {
    os: string;
    architecture: string;
    variant?: string;
    "os.version"?: string;
}

interface Descriptor {
    digest: string;
    platform?: Platform;
}

interface Container {
    Image: string;
    ImageManifestDescriptor?: Descriptor;
    Config: { Labels: Record<string, string> };
    State: {
        Running: boolean;
        ExitCode: number;
        Status: string;
        Health?: { Status: string };
    };
}

interface Image {
    Os: string;
    Architecture: string;
    Variant?: string;
    OsVersion?: string;
    Descriptor?: Descriptor;
}

interface Manifest {
    schemaVersion: number;
    manifests?: Descriptor[];
    config?: { digest: string };
}

interface Service {
    image?: string;
    platform?: string;
    pull_policy?: string;
}

const isImageId = (id: string) => /^sha256:[0-9a-f]{64}$/.test(id);

export async function stackContainers(stack: Stack, signal = AbortSignal.timeout(15000)): Promise<Container[]> {
    const options = { cwd: stack.path,
        signal };
    const ids = (await docker(stack.getComposeOptions("--profile", "*", "ps", "--all", "--quiet"), options))
        .trim().split(/\s+/).filter(Boolean);
    const containers = await inspectDocker<Container>("container", ids, options);
    return containers.filter(container => container.Config.Labels["com.docker.compose.oneoff"]?.toLowerCase() !== "true");
}

function serviceName(container: Container): string {
    return container.Config.Labels["com.docker.compose.service"];
}

export function replacedImageIds(before: Container[], after: Container[]): Set<string> {
    const byService = new Map<string, Container[]>();
    for (const container of after) {
        const service = serviceName(container);
        const replicas = byService.get(service) ?? [];
        replicas.push(container);
        byService.set(service, replicas);
    }

    const replaced = new Set<string>();
    const preserved = new Set<string>();
    for (const previous of before) {
        const service = serviceName(previous);
        const replicas = byService.get(service);
        if (!isImageId(previous.Image)) {
            continue;
        }
        const allReplaced = service && replicas?.every(container => container.Image !== previous.Image && isImageId(container.Image) &&
            ((container.State.Status === "running" && container.State.Health?.Status !== "unhealthy") ||
                (!previous.State.Running && container.State.Status === "exited" && container.State.ExitCode === 0)));
        if (allReplaced) {
            replaced.add(previous.Image);
        } else {
            preserved.add(previous.Image);
        }
    }
    for (const id of preserved) {
        replaced.delete(id);
    }
    return replaced;
}

type ManifestReader = (reference: string) => Promise<{ manifest: Manifest;
    digest: string }>;

export function registryManifestReader(signal: AbortSignal): ManifestReader {
    const cache = new Map<string, ReturnType<ManifestReader>>();
    return reference => {
        let result = cache.get(reference);
        if (!result) {
            result = docker([ "buildx", "imagetools", "inspect", "--raw", "--", reference ], {
                signal,
                timeout: 8000,
            }).then(raw => {
                const manifest: Manifest = JSON.parse(raw);
                if (manifest.schemaVersion !== 2) {
                    throw new Error("Unsupported registry manifest");
                }
                // Buildx writes the original manifest bytes in raw mode.
                const digest = "sha256:" + createHash("sha256").update(raw).digest("hex");
                return { manifest,
                    digest };
            });
            cache.set(reference, result);
        }
        return result;
    };
}

function selectPlatform(manifests: Descriptor[], platform: Platform): Descriptor {
    const byArchitecture = manifests.filter(({ platform: candidate }) => candidate?.os === platform.os &&
        candidate.architecture === platform.architecture &&
        (!platform["os.version"] || !candidate["os.version"] || candidate["os.version"] === platform["os.version"]));
    const exact = byArchitecture.filter(({ platform: candidate }) => candidate?.variant === platform.variant ||
        (platform.architecture === "arm64" && (candidate?.variant || "v8") === (platform.variant || "v8")));
    const candidates = exact.length || platform.variant ? exact : byArchitecture;
    if (candidates.length !== 1 || !isImageId(candidates[0].digest)) {
        throw new Error("Missing or ambiguous image platform");
    }
    return candidates[0];
}

async function imageAvailable(container: Container, service: Service & { image: string }, read: ManifestReader, signal: AbortSignal) {
    const deployed = container.ImageManifestDescriptor;
    let platform = deployed?.platform;
    if (!platform || !deployed) {
        const [ image ] = await inspectDocker<Image>("image", [ container.Image ], { signal });
        if (!image || (!deployed && image.Descriptor)) {
            throw new Error("Deployed image manifest unavailable");
        }
        platform ??= { os: image.Os,
            architecture: image.Architecture,
            variant: image.Variant,
            "os.version": image.OsVersion };
    }
    if (service.platform) {
        const [ os, architecture, variant ] = service.platform.split("/");
        if (os !== platform.os || architecture !== platform.architecture || (variant && variant !== platform.variant)) {
            platform = { os,
                architecture,
                variant };
        }
    }
    if (!platform.os || !platform.architecture || !isImageId(deployed?.digest ?? container.Image)) {
        throw new Error("Deployed image identity unavailable");
    }

    let { manifest, digest } = await read(service.image);
    if (manifest.manifests) {
        ({ digest } = selectPlatform(manifest.manifests, platform));
        if (deployed) {
            return deployed.digest !== digest;
        }
        // A tag may already include a registry port. Keep the reference intact before appending the digest.
        ({ manifest } = await read(service.image + "@" + digest));
    } else if (deployed && manifest.config && isImageId(manifest.config.digest)) {
        return deployed.digest !== digest;
    }
    if (!manifest.config || !isImageId(manifest.config.digest)) {
        throw new Error("Registry image configuration unavailable");
    }
    return container.Image !== manifest.config.digest;
}

export async function checkStackImages(stack: Stack, read: ManifestReader, signal: AbortSignal): Promise<StackUpdateCheck> {
    const result: StackUpdateCheck = { name: stack.name,
        available: [],
        unverified: [] };
    try {
        const containers = await stackContainers(stack, signal);
        if (!containers.length) {
            return { ...result,
                incomplete: true };
        }
        const args = stack.getComposeOptions("--profile", "*", "config", "--format", "json");
        const config: { services: Record<string, Service> } = JSON.parse(await docker(args, { cwd: stack.path,
            signal }));
        const byService = new Map<string, Container[]>();
        for (const container of containers) {
            const name = serviceName(container);
            const replicas = byService.get(name) ?? [];
            replicas.push(container);
            byService.set(name, replicas);
        }
        for (const [ name, replicas ] of byService) {
            const service = Object.hasOwn(config.services, name) ? config.services[name] : undefined;
            if (!service) {
                result.unverified.push(name);
                continue;
            }
            if (!service.image || service.image.includes("@") || service.pull_policy === "build" || service.pull_policy === "never") {
                continue;
            }
            let available = false;
            let unverified = false;
            // Replicas can still run different images after a partial deployment.
            for (const replica of replicas) {
                try {
                    available = await imageAvailable(replica, { ...service,
                        image: service.image }, read, signal) || available;
                } catch {
                    unverified = true;
                }
            }
            if (available) {
                result.available.push(name);
            }
            if (unverified) {
                result.unverified.push(name);
            }
        }
    } catch {
        result.incomplete = true;
    }
    return result;
}
