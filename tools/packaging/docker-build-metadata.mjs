import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Forks always validate locally; upstream publication requires an explicit event. */
export function dockerBuildMetadata({
    repository,
    eventName,
    ref,
    sha,
    version,
    pullRequestNumber,
    pushRequested = false,
}) {
    const shortSha = sha.slice(0, 12);
    const upstream = repository === '4gray/iptvnator';
    let publish = false;
    let tags = [
        upstream
            ? `4gray/iptvnator:pr-${pullRequestNumber || 'manual'}`
            : `${repository.toLowerCase()}:validation-${shortSha}`,
    ];
    if (upstream && eventName === 'push' && ref === 'refs/heads/master') {
        publish = true;
        tags = [
            'latest',
            `${version}-pwa`,
            `${version}-pwa-${shortSha}`,
            `sha-${shortSha}`,
        ];
    } else if (
        upstream &&
        eventName === 'push' &&
        ref.startsWith('refs/tags/v')
    ) {
        publish = true;
        const tagVersion = ref.slice('refs/tags/v'.length);
        tags = [tagVersion, `v${tagVersion}`];
        if (!tagVersion.includes('-')) tags.push('stable');
    } else if (upstream && eventName === 'workflow_dispatch' && pushRequested) {
        publish = true;
        tags = [`manual-${shortSha}`, `sha-${shortSha}`];
    }
    return {
        publish,
        platforms: publish ? 'linux/amd64,linux/arm64' : 'linux/amd64',
        tags: publish ? tags.map((tag) => `4gray/iptvnator:${tag}`) : tags,
    };
}

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
    const metadata = dockerBuildMetadata({
        repository: process.env.GITHUB_REPOSITORY,
        eventName: process.env.GITHUB_EVENT_NAME,
        ref: process.env.GITHUB_REF,
        sha: process.env.GITHUB_SHA,
        version: JSON.parse(fs.readFileSync('package.json', 'utf8')).version,
        pullRequestNumber: process.env.PULL_REQUEST_NUMBER,
        pushRequested: process.env.PUSH_REQUESTED === 'true',
    });
    fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        [
            `publish=${metadata.publish}`,
            `platforms=${metadata.platforms}`,
            'tags<<EOF',
            ...metadata.tags,
            'EOF',
            '',
        ].join('\n')
    );
}
