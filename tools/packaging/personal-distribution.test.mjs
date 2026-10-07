import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolvePackageVerificationConfig } from './package-verification-config.mjs';

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
);

for (const overlay of ['', 'electron-builder.personal.json']) {
    test(`Windows verifier with ${overlay || 'default identity'} and no effective Snap configuration does not crash during setup`, () => {
        const temporaryRoot = fs.realpathSync(os.tmpdir());
        const directory = fs.mkdtempSync(
            path.join(temporaryRoot, 'iptvnator-package-policy-')
        );
        try {
            fs.writeFileSync(
                path.join(directory, 'builder-effective-config.yaml'),
                'win:\n  target:\n    - nsis\n'
            );
            const result = spawnSync(
                process.execPath,
                [
                    'tools/packaging/verify-electron-package-layout.mjs',
                    'windows',
                    'x64',
                    overlay,
                    directory,
                ],
                {
                    cwd: root,
                    encoding: 'utf8',
                    timeout: 10000,
                    windowsHide: true,
                }
            );
            assert.equal(result.error, undefined);
            assert.equal(result.status, 1);
            assert.match(
                result.stderr,
                /No packaged resource directories found for windows \(x64\)/
            );
            assert.doesNotMatch(result.stderr, /ReferenceError/);
        } finally {
            assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
}

test('private Windows packaging is x64-only, unpublished and does not claim upstream file types', () => {
    const personal = resolvePackageVerificationConfig(
        root,
        'electron-builder.personal.json',
        'dist/personal/windows-x64'
    );
    assert.equal(
        personal.electronBuilderConfig.appId,
        'com.iptvnator.personal.alpha'
    );
    assert.equal(
        personal.electronBuilderConfig.productName,
        'IPTVnator Personal Alpha'
    );
    assert.equal(
        personal.electronBuilderConfig.executableName,
        'IPTVnator Personal Alpha'
    );
    assert.deepEqual(personal.electronBuilderConfig.win.target, [
        { target: 'nsis', arch: ['x64'] },
    ]);
    assert.deepEqual(personal.electronBuilderConfig.fileAssociations, []);
    assert.equal(personal.electronBuilderConfig.publish, null);
    assert.deepEqual(personal.packagedPackageMetadata.iptvnatorDistribution, {
        profile: 'personal',
        updates: 'disabled',
    });
    assert.equal(
        personal.packagedPackageMetadata.name,
        'iptvnator-personal-alpha'
    );
    assert.equal(
        personal.packagedPackageMetadata.version,
        personal.packageMetadata.version
    );
    assert.deepEqual(personal.packageOutputRoots, [
        path.join(root, 'dist/personal/windows-x64'),
    ]);
    assert.ok(
        personal.electronBuilderConfig.files.some(
            (file) =>
                typeof file === 'string' &&
                file.startsWith('!electron-backend/native')
        )
    );
    assert.equal(
        personal.electronBuilderConfig.afterPack,
        './tools/packaging/electron-after-pack.cjs'
    );
});

test('default package verification retains upstream identity, version and output roots', () => {
    const normal = resolvePackageVerificationConfig(root);
    assert.equal(normal.electronBuilderConfig.appId, 'com.fourgray.iptvnator');
    assert.equal(normal.packagedPackageMetadata.name, 'iptvnator');
    assert.equal(
        normal.packagedPackageMetadata.version,
        normal.packageMetadata.version
    );
    assert.equal(
        normal.packagedPackageMetadata.iptvnatorDistribution,
        undefined
    );
    assert.deepEqual(normal.packageOutputRoots, [
        path.join(root, 'dist/executables'),
        path.join(root, 'dist/packages'),
    ]);
    const source = fs.readFileSync(
        path.join(root, 'apps/electron-backend/src/main.entry.ts'),
        'utf8'
    );
    assert.ok(
        source.indexOf("import './app/services/distribution-bootstrap'") <
            source.indexOf('publishCompileCacheOutcome(')
    );
});
