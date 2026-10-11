import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const scriptPath = fileURLToPath(
    new URL('./run-tier-a-coverage.mjs', import.meta.url)
);

function runCoverage({
    executor = '@nx/jest:jest',
    code = 0,
    report = true,
    message = '',
} = {}) {
    const root = mkdtempSync(path.join(os.tmpdir(), 'tier A runner '));
    const project = {
        name: 'fixture',
        root: 'libs/fixture',
        sourceRoot: 'libs/fixture/src',
    };
    try {
        for (const directory of [
            'tools/coverage',
            'node_modules/nx/bin',
            project.sourceRoot,
        ]) {
            mkdirSync(path.join(root, directory), { recursive: true });
        }
        writeFileSync(path.join(root, 'package.json'), '{}');
        writeFileSync(
            path.join(root, 'node_modules/nx/package.json'),
            '{"name":"nx"}'
        );
        writeFileSync(
            path.join(root, project.root, 'project.json'),
            JSON.stringify({
                targets: { test: { executor } },
            })
        );
        writeFileSync(
            path.join(root, project.sourceRoot, 'value.ts'),
            'export const value = 1;'
        );
        writeFileSync(
            path.join(root, project.sourceRoot, 'value.spec.ts'),
            '// fixture spec'
        );
        writeFileSync(
            path.join(root, 'tools/coverage/coverage-policy.json'),
            JSON.stringify({
                unitCoverage: { tierA: [project], tierB: [], tierC: [] },
            })
        );
        writeFileSync(
            path.join(root, 'node_modules/nx/bin/nx.js'),
            `
            const fs = require('node:fs');
            const path = require('node:path');
            fs.writeFileSync('args.json', JSON.stringify(process.argv.slice(2)));
            if (${report}) {
                const file = path.resolve('libs/fixture/src/value.ts');
                const location = {start: {line: 1, column: 0}, end: {line: 1, column: 23}};
                fs.mkdirSync('coverage/libs/fixture', {recursive: true});
                fs.writeFileSync('coverage/libs/fixture/coverage-final.json', JSON.stringify({
                    [file]: {path: file, statementMap: {'0': location}, s: {'0': 1}, fnMap: {}, f: {}, branchMap: {}, b: {}}
                }));
            }
            console.log(${JSON.stringify(message)});
            process.exitCode = ${code};
        `
        );
        const result = spawnSync(
            process.execPath,
            [scriptPath, '--concurrency=1', '--max-workers=1'],
            {
                cwd: root,
                env: { ...process.env, PATH: '' },
                encoding: 'utf8',
                timeout: 15_000,
                windowsHide: true,
            }
        );
        return {
            ...result,
            nxArgs: JSON.parse(
                readFileSync(path.join(root, 'args.json'), 'utf8')
            ),
        };
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

test('Jest coverage uses workspace Nx without pnpm on PATH and preserves CI arguments', () => {
    const result = runCoverage();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.nxArgs, [
        'run',
        'fixture:test',
        '--configuration=ci',
        '--codeCoverage',
        '--coverageDirectory=coverage/libs/fixture',
        '--maxWorkers=1',
        '--output-style=static',
    ]);
    assert.match(result.stdout, /fixture ok/);
});

test('run-commands coverage forwards explicit source collection arguments', () => {
    const result = runCoverage({ executor: 'nx:run-commands' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.nxArgs.slice(0, 5), [
        'run',
        'fixture:test',
        '--output-style=static',
        '--',
        '--maxWorkers=1',
    ]);
    assert.ok(
        result.nxArgs.includes(
            '--collectCoverageFrom=libs/fixture/src/**/*.{ts,js,mjs,html}'
        )
    );
});

test('the runner propagates a failing Nx exit status', () => {
    const result = runCoverage({ code: 7 });
    assert.equal(result.status, 7, result.stderr);
});

test('coverage collection errors still fail despite a successful Nx process', () => {
    const result = runCoverage({
        message: 'Failed to collect coverage from value.ts',
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(
        result.stderr,
        /Coverage collection failed while testing fixture/
    );
});

test('successful Nx without a report still fails the integrity gate', () => {
    const result = runCoverage({ report: false });
    assert.equal(result.status, 1, result.stderr);
    assert.match(
        result.stderr,
        /did not produce coverage\/libs\/fixture\/coverage-final.json/
    );
});
