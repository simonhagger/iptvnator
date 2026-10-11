import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { parse } from 'yaml';
import { dockerBuildMetadata } from './docker-build-metadata.mjs';

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
);
const workflow = (name) =>
    parse(fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8'));
const build = workflow('build-and-make.yaml');
const steps = build.jobs['build-cross-platform'].steps;
const step = (name) => {
    const result = steps.find((entry) => entry.name === name);
    assert.ok(result, `Missing step: ${name}`);
    return result;
};
function context(repository, eventName = 'push', platform = 'macos') {
    return {
        github: {
            repository,
            event_name: eventName,
            ref: 'refs/heads/master',
            event: {
                pull_request: { head: { repo: { full_name: repository } } },
                release: { tag_name: 'v0.25.0', draft: false },
            },
        },
        matrix: { os: platform, linux_profile: 'portable' },
        needs: { 'verify-snap': { result: 'success' } },
        startsWith: (value, prefix) => value.startsWith(prefix),
        always: () => true,
    };
}
function enabled(condition, values) {
    if (!condition) return true;
    const expression = condition
        .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
        .replaceAll('needs.verify-snap', "needs['verify-snap']");
    return Boolean(vm.runInNewContext(expression, values, { timeout: 1000 }));
}

test('fork platform builds remain enabled without upstream signing or distribution', () => {
    for (const event of ['push', 'pull_request', 'workflow_dispatch']) {
        for (const platform of ['macos', 'windows', 'linux']) {
            const values = context('simonhagger/iptvnator', event, platform);
            assert.ok(enabled(step('Build frontend').if, values));
            assert.ok(enabled(step('Build backend').if, values));
            for (const name of [
                'Validate macOS signing configuration',
                'Prepare macOS notarization credentials',
                'Make Electron app (macOS)',
                'Verify signed macOS app',
                'Make Electron app',
                'Verify packaged worker layout',
                'Upload artifacts (macOS)',
                'Upload system-runtime Linux artifacts',
                'Upload portable-runtime Linux artifacts',
                'Upload Flatpak-runtime Linux artifacts',
                'Build website',
                'Make marker-only foreign-architecture DEB packages',
                'Verify DEB payloads and x64 system runtime',
                'Verify RPM payload and x64 system runtime',
                'Verify Pacman payload and x64 system runtime',
                'Verify AppImage payloads and bundled runtime',
                'Verify Snap payloads and strict-confinement runtime',
                'Run packaged x64 frame-copy and fallback smoke',
                'Upload packaged frame-copy smoke diagnostics',
                'Diagnose packaged x64 frame-copy hardware path',
                'Verify Flatpak payload, launcher, and sandboxed runtime',
            ]) {
                assert.equal(
                    enabled(step(name).if, values),
                    false,
                    `${event}/${platform}/${name}`
                );
            }
            assert.equal(
                enabled(step('Make personal Windows fork app').if, values),
                platform === 'windows'
            );
        }
    }
});

test('upstream signed releases and PR packaging keep their original paths', () => {
    for (const event of ['push', 'workflow_dispatch', 'pull_request']) {
        const values = context('4gray/iptvnator', event);
        assert.equal(
            enabled(step('Make Electron app (macOS)').if, values),
            event !== 'pull_request'
        );
        assert.equal(
            enabled(step('Validate macOS signing configuration').if, values),
            event !== 'pull_request'
        );
        assert.equal(
            enabled(step('Make Electron app').if, values),
            event === 'pull_request'
        );
        assert.equal(
            enabled(step('Make personal Windows fork app').if, values),
            false
        );
        assert.ok(enabled(build.jobs['create-release'].if, values));
    }
    const externalPr = context('4gray/iptvnator', 'pull_request');
    externalPr.github.event.pull_request.head.repo.full_name =
        'contributor/iptvnator';
    assert.equal(enabled(build.jobs['create-release'].if, externalPr), false);
});

test('fork Windows packaging preserves production output and verifies the personal overlay', () => {
    const personal = step('Make personal Windows fork app');
    const generation = step('Generate personal Windows fork metadata');
    const verification = step('Verify personal Windows fork app');
    const commands = [generation.run, personal.run, verification.run];
    assert.deepEqual(commands, [
        'pnpm nx run electron-backend:generate-builder-metadata --excludeTaskDependencies --skip-nx-cache',
        'pnpm nx run electron-backend:make-personal --excludeTaskDependencies --outputPath=dist/executables',
        'node tools/packaging/verify-electron-package-layout.mjs windows x64 electron-builder.personal.json dist/executables',
    ]);
    assert.ok(steps.indexOf(step('Build backend')) < steps.indexOf(generation));
    assert.ok(steps.indexOf(generation) < steps.indexOf(personal));
    assert.ok(steps.indexOf(personal) < steps.indexOf(verification));
    assert.equal(generation.if, personal.if);
    assert.equal(verification.if, personal.if);
    assert.equal(personal.env.IPTVNATOR_REQUIRE_EMBEDDED_MPV, '1');
    assert.equal(personal.env.IPTVNATOR_EMBEDDED_MPV_ARCH, 'x64');
    const overlay = JSON.parse(
        fs.readFileSync(
            path.join(root, 'electron-builder.personal.json'),
            'utf8'
        )
    );
    assert.equal(overlay.appId, 'com.iptvnator.personal.alpha');
    assert.deepEqual(overlay.extraMetadata.iptvnatorDistribution, {
        profile: 'personal',
        updates: 'disabled',
    });
    assert.equal(overlay.publish, null);
});

test('the personal fork has no inherited GitHub Pages deployment workflow', () => {
    const directory = path.join(root, '.github/workflows');
    assert.equal(
        fs.existsSync(path.join(directory, 'deploy-website.yml')),
        false
    );
    for (const name of fs.readdirSync(directory)) {
        if (!/\.ya?ml$/.test(name)) continue;
        const content = fs.readFileSync(path.join(directory, name), 'utf8');
        assert.doesNotMatch(
            content,
            /actions\/(?:deploy-pages|upload-pages-artifact|configure-pages)@/
        );
        const definition = parse(content);
        assert.equal(definition.permissions?.pages, undefined, name);
        for (const job of Object.values(definition.jobs ?? {})) {
            const environment =
                typeof job.environment === 'string'
                    ? job.environment
                    : job.environment?.name;
            assert.notEqual(environment, 'github-pages', name);
            assert.equal(job.permissions?.pages, undefined, name);
        }
    }
});

test('forks cannot enter release, cleanup or maintenance jobs', () => {
    const jobs = [
        build.jobs['create-release'],
        ...Object.values(workflow('cleanup-pr-draft.yml').jobs),
        ...Object.values(workflow('publish-snap.yaml').jobs),
        ...Object.values(
            workflow('refresh-windows-embedded-mpv-runtime.yaml').jobs
        ),
        ...Object.values(workflow('performance-ratchet.yml').jobs),
    ];
    for (const event of [
        'push',
        'pull_request',
        'workflow_dispatch',
        'release',
        'schedule',
    ]) {
        for (const job of jobs) {
            assert.equal(
                enabled(job.if, context('simonhagger/iptvnator', event)),
                false,
                `${event}/${job.name}`
            );
        }
    }
});

test('Docker metadata rejects fork publishing, including an explicit manual push', () => {
    const docker = workflow('docker.yml');
    const login = docker.jobs.build.steps.find(
        (entry) => entry.name === 'Login to Docker Hub'
    );
    const imageBuild = docker.jobs.build.steps.find(
        (entry) => entry.name === 'Build Docker image'
    );
    assert.equal(login.if, "steps.docker-meta.outputs.publish == 'true'");
    assert.equal(
        imageBuild.with.push,
        "${{ steps.docker-meta.outputs.publish == 'true' }}"
    );
    const metadata = docker.jobs.build.steps.find(
        (entry) => entry.id === 'docker-meta'
    );
    assert.equal(
        metadata.run,
        'node tools/packaging/docker-build-metadata.mjs'
    );
    assert.equal(
        metadata.env.PUSH_REQUESTED,
        "${{ inputs.push && 'true' || 'false' }}"
    );
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'iptvnator-docker-policy-')
    );
    try {
        for (const repository of ['simonhagger/iptvnator', '4gray/iptvnator']) {
            for (const [event, ref, push, publishes] of [
                ['push', 'refs/heads/master', false, true],
                ['push', 'refs/tags/v0.25.0', false, true],
                ['workflow_dispatch', 'refs/heads/master', true, true],
                ['workflow_dispatch', 'refs/heads/master', false, false],
                ['pull_request', 'refs/pull/5/merge', false, false],
            ]) {
                const output = path.join(directory, 'output');
                fs.writeFileSync(output, '');
                const result = spawnSync(
                    process.execPath,
                    ['tools/packaging/docker-build-metadata.mjs'],
                    {
                        cwd: root,
                        encoding: 'utf8',
                        timeout: 10000,
                        windowsHide: true,
                        env: {
                            ...process.env,
                            GITHUB_REPOSITORY: repository,
                            GITHUB_EVENT_NAME: event,
                            GITHUB_REF: ref,
                            GITHUB_REF_NAME: ref.split('/').at(-1),
                            GITHUB_SHA: 'a'.repeat(40),
                            GITHUB_OUTPUT: output,
                            PUSH_REQUESTED: String(push),
                            PULL_REQUEST_NUMBER: '5',
                        },
                    }
                );
                assert.equal(
                    result.status,
                    0,
                    result.error?.message ?? result.stderr
                );
                const values = fs.readFileSync(output, 'utf8');
                const upstream = repository === '4gray/iptvnator';
                assert.match(
                    values,
                    new RegExp(`^publish=${upstream && publishes}$`, 'm')
                );
                if (!upstream) {
                    assert.match(values, /^platforms=linux\/amd64$/m);
                    assert.doesNotMatch(values, /4gray\/iptvnator/);
                }
            }
        }
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('Docker upstream tag policy retains stable and prerelease distinctions', () => {
    const base = {
        repository: '4gray/iptvnator',
        eventName: 'push',
        sha: 'a'.repeat(40),
        version: '0.25.0',
    };
    assert.deepEqual(
        dockerBuildMetadata({ ...base, ref: 'refs/tags/v0.25.0' }).tags,
        [
            '4gray/iptvnator:0.25.0',
            '4gray/iptvnator:v0.25.0',
            '4gray/iptvnator:stable',
        ]
    );
    assert.deepEqual(
        dockerBuildMetadata({ ...base, ref: 'refs/tags/v0.25.0-alpha.1' }).tags,
        ['4gray/iptvnator:0.25.0-alpha.1', '4gray/iptvnator:v0.25.0-alpha.1']
    );
    const fork = {
        ...base,
        repository: 'simonhagger/iptvnator',
        ref: 'refs/tags/v0.25.0',
    };
    const before = structuredClone(fork);
    assert.equal(dockerBuildMetadata(fork).publish, false);
    assert.deepEqual(fork, before);
});
