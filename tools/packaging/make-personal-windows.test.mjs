import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { makePersonalWindows } from './make-personal-windows.mjs';
import { buildElectronPackageMetadata } from './generate-electron-builder-metadata.mjs';

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve('electron-builder'));
const { getConfig } = builderRequire(
    'app-builder-lib/out/util/config/config.js'
);
const { computeArchToTargetNamesMap } = builderRequire(
    'app-builder-lib/out/targets/targetFactory.js'
);
const { createTransformer } = builderRequire(
    'app-builder-lib/out/fileTransformer.js'
);
const { Platform, Arch } = require('electron-builder');
const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
);

function fixture() {
    const temporaryRoot = fs.realpathSync(os.tmpdir());
    const root = fs.mkdtempSync(
        path.join(temporaryRoot, 'iptvnator-personal-make-')
    );
    const read = (file) =>
        JSON.parse(fs.readFileSync(path.join(repositoryRoot, file), 'utf8'));
    const write = (file, value) => {
        const destination = path.join(root, file);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`);
    };
    const packageMetadata = read('package.json');
    const base = read('electron-builder.json');
    for (const file of [
        'package.json',
        'electron-builder.json',
        'electron-builder.personal.json',
        'apps/electron-backend/project.json',
    ])
        write(file, read(file));
    const sourcePackage = 'dist/apps/electron-backend/package.json';
    write(sourcePackage, buildElectronPackageMetadata(packageMetadata, base));
    const sourceBytes = fs.readFileSync(path.join(root, sourcePackage));
    return {
        root,
        sourcePackage,
        sourceBytes,
        base,
        packageMetadata,
        cleanup() {
            assert.equal(path.dirname(path.resolve(root)), temporaryRoot);
            fs.rmSync(root, { recursive: true, force: true });
        },
    };
}

test('actual builder invocation selects only Windows x64 NSIS without inherited targets or associations', async () => {
    const state = fixture();
    try {
        let called = false;
        await makePersonalWindows({
            workspaceRoot: state.root,
            outputPath: 'dist/personal/candidate2',
            build: async (options) => {
                called = true;
                assert.equal(options.projectDir, state.root);
                assert.equal(options.publish, 'never');
                assert.equal(typeof options.config, 'string');
                const config = await getConfig(
                    state.root,
                    options.config,
                    null
                );
                const expanded = computeArchToTargetNamesMap(
                    options.targets.get(Platform.WINDOWS),
                    {
                        platformSpecificBuildOptions: config.win,
                        defaultTarget: ['nsis'],
                    },
                    Platform.WINDOWS
                );
                assert.deepEqual(
                    [...options.targets.keys()],
                    [Platform.WINDOWS]
                );
                assert.deepEqual([...expanded], [[Arch.x64, ['nsis']]]);
                assert.deepEqual(config.win.target, [
                    { target: 'nsis', arch: ['x64'] },
                ]);
                assert.deepEqual(config.fileAssociations, []);
                assert.equal(config.publish, null);
                assert.equal(config.extends, null);
                assert.equal(config.directories.app, undefined);
                assert.equal(
                    config.directories.output,
                    path.join(state.root, 'dist/personal/candidate2')
                );
                assert.equal(config.afterPack, state.base.afterPack);
                assert.deepEqual(config.extraResources, [
                    { filter: state.base.extraResources },
                ]);
                assert.deepEqual(config.asarUnpack, state.base.asarUnpack);
                assert.ok(
                    config.files.some(
                        (file) =>
                            file.from ===
                                path.join(state.root, 'dist/apps/web') &&
                            file.to === 'web'
                    )
                );
                assert.ok(
                    config.files.some(
                        (file) =>
                            file.filter.includes('main.app.js') &&
                            file.to === 'electron-backend'
                    )
                );
                assert.ok(
                    config.files.some(
                        (file) =>
                            file.filter.includes('main.js') &&
                            file.to === 'electron-backend'
                    )
                );
            },
        });
        assert.equal(called, true);
    } finally {
        state.cleanup();
    }
});

test('copied archive-root metadata retains personal policy and source version without transforming or modifying shared production metadata', async () => {
    const state = fixture();
    try {
        await makePersonalWindows({
            workspaceRoot: state.root,
            build: async (options) => {
                const config = await getConfig(
                    state.root,
                    options.config,
                    null
                );
                const copies = config.files.filter(
                    (file) =>
                        typeof file === 'object' &&
                        file.to === '' &&
                        file.filter.includes('package.json')
                );
                assert.equal(copies.length, 1);
                const copyPath = path.join(copies[0].from, 'package.json');
                const copiedMetadata = JSON.parse(
                    fs.readFileSync(copyPath, 'utf8')
                );
                const transform = createTransformer(
                    state.root,
                    config,
                    config.extraMetadata
                );
                // Actual custom-copy seam bypasses builder's main-package transform.
                assert.equal(await transform(copyPath), null);
                assert.equal(copiedMetadata.name, 'iptvnator-personal-alpha');
                assert.equal(
                    copiedMetadata.productName,
                    'IPTVnator Personal Alpha'
                );
                assert.deepEqual(copiedMetadata.iptvnatorDistribution, {
                    profile: 'personal',
                    updates: 'disabled',
                });
                assert.equal(
                    copiedMetadata.version,
                    state.packageMetadata.version
                );
                assert.equal(copiedMetadata.main, 'electron-backend/main.js');
                assert.equal(config.appId, 'com.iptvnator.personal.alpha');
                assert.equal(config.executableName, 'IPTVnator Personal Alpha');
                assert.deepEqual(
                    fs.readFileSync(path.join(state.root, state.sourcePackage)),
                    state.sourceBytes
                );
            },
        });
        assert.deepEqual(
            fs.readFileSync(path.join(state.root, state.sourcePackage)),
            state.sourceBytes
        );
        assert.deepEqual(
            fs.readdirSync(path.join(state.root, 'dist/personal')),
            []
        );
    } finally {
        state.cleanup();
    }
});

test('builder rejection removes only owned staging and preserves standard package identity', async () => {
    const state = fixture();
    try {
        await assert.rejects(
            makePersonalWindows({
                workspaceRoot: state.root,
                build: async () => {
                    throw new Error('Synthetic builder failure');
                },
            }),
            /Synthetic builder failure/
        );
        assert.deepEqual(
            fs.readdirSync(path.join(state.root, 'dist/personal')),
            []
        );
        assert.deepEqual(
            fs.readFileSync(path.join(state.root, state.sourcePackage)),
            state.sourceBytes
        );
        assert.equal(JSON.parse(state.sourceBytes).name, 'iptvnator');
        assert.equal(
            JSON.parse(state.sourceBytes).iptvnatorDistribution,
            undefined
        );
    } finally {
        state.cleanup();
    }
});

test('personal command rejects an architecture override before builder launch', () => {
    const result = spawnSync(
        process.execPath,
        ['tools/packaging/make-personal-windows.mjs', '--arch=ia32'],
        {
            cwd: repositoryRoot,
            encoding: 'utf8',
            timeout: 10000,
            windowsHide: true,
        }
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(
        result.stderr,
        /Unsupported personal packaging argument: --arch=ia32/
    );
});
