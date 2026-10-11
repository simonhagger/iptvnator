import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const scriptPath = fileURLToPath(
    new URL('./check-coverage-policy.mjs', import.meta.url)
);

function checkPolicy({ all = [], tested = [], tierA = [], tierB = [] }) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'coverage policy '));
    try {
        mkdirSync(path.join(root, 'tools/coverage'), { recursive: true });
        mkdirSync(path.join(root, 'node_modules/nx/bin'), { recursive: true });
        writeFileSync(path.join(root, 'package.json'), '{}');
        writeFileSync(
            path.join(root, 'node_modules/nx/package.json'),
            JSON.stringify({ name: 'nx', version: '0.0.0' })
        );
        writeFileSync(
            path.join(root, 'node_modules/nx/bin/nx.js'),
            `const args = process.argv.slice(2);
             if (JSON.stringify(args.slice(0, 3)) !== JSON.stringify(['show', 'projects', '--json'])) process.exit(2);
             const target = args[args.indexOf('--withTarget') + 1];
             console.log(JSON.stringify(args.includes('--withTarget') ? (target === 'test' ? ${JSON.stringify(tested)} : []) : ${JSON.stringify(all)}));`
        );
        writeFileSync(
            path.join(root, 'tools/coverage/coverage-policy.json'),
            JSON.stringify({
                unitCoverage: {
                    tierA: tierA.map((name) => ({ name })),
                    tierB: tierB.map((name) => ({ name })),
                },
            })
        );
        return spawnSync(process.execPath, [scriptPath], {
            cwd: root,
            // No pnpm launcher is available; paths containing spaces must also
            // work without shell quoting on Windows and Unix.
            env: { ...process.env, PATH: '' },
            encoding: 'utf8',
            timeout: 15_000,
            windowsHide: true,
        });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

test('checks the installed Nx CLI without a package-manager launcher on PATH', () => {
    const result = checkPolicy({
        all: ['tested', 'manual'],
        tested: ['tested'],
        tierA: ['tested'],
        tierB: ['manual'],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(
        result.stdout,
        /Coverage policy OK: 1 test projects classified/
    );
});

test('still rejects an unclassified test project', () => {
    const result = checkPolicy({ all: ['tested'], tested: ['tested'] });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /missing projects that have a test target/);
});

test('still rejects policy entries absent from the workspace', () => {
    const result = checkPolicy({ tierB: ['removed'] });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /projects that do not exist/);
});

test('still requires a test target for every Tier A project', () => {
    const result = checkPolicy({ all: ['untested'], tierA: ['untested'] });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Tier A projects must have a test target/);
});
