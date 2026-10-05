import assert from 'node:assert/strict';
import { spawn, type execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { describe, it } from 'node:test';
import { createInterface } from 'node:readline';
import { terminateElectronProcess } from '../electron-process-termination';
import {
    captureElectronProcess,
    closeElectronApplicationAndConfirmExit,
} from '../electron-process-lifecycle';

describe('Electron forced termination', () => {
    it('terminates the Windows shell and its Electron descendants together', () => {
        let shellAlive = true;
        let electronAlive = true;
        const child = {
            pid: 1234,
            kill: () => {
                shellAlive = false;
                return true;
            },
        };
        const run = ((file, args, options) => {
            assert.equal(file, 'taskkill.exe');
            assert.deepEqual(args, ['/pid', '1234', '/T', '/F']);
            assert.equal(options?.timeout, 5000);
            shellAlive = false;
            electronAlive = false;
            return Buffer.alloc(0);
        }) as typeof execFileSync;

        terminateElectronProcess(child, 'SIGTERM', 'win32', run);

        assert.equal(shellAlive, false);
        assert.equal(
            electronAlive,
            false,
            'Electron must release the profile before relaunch'
        );
    });

    it('preserves signal escalation on Unix', () => {
        const signals: NodeJS.Signals[] = [];
        const child = {
            pid: 1234,
            kill: (signal: NodeJS.Signals) => {
                signals.push(signal);
                return true;
            },
        };
        terminateElectronProcess(child, 'SIGTERM', 'linux');
        terminateElectronProcess(child, 'SIGKILL', 'darwin');
        assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
    });

    it('does not fall back to killing only the shell when tree termination fails', () => {
        const failure = new Error('taskkill failed');
        const child = {
            pid: 1234,
            kill: () => assert.fail('would orphan the Electron descendant'),
        };
        const run = (() => {
            throw failure;
        }) as typeof execFileSync;
        assert.throws(
            () => terminateElectronProcess(child, 'SIGTERM', 'win32', run),
            (error) => error === failure
        );
    });

    it(
        'reaps a real Windows shell child instead of orphaning its descendant',
        {
            skip: process.platform !== 'win32',
            timeout: 15000,
        },
        async () => {
            // Match Playwright's Windows launch topology: cmd.exe -> application.
            const shell = spawn(
                `"${process.execPath}"`,
                [
                    '-e',
                    '"setInterval(() => {}, 1000); process.stdout.write(String(process.pid) + String.fromCharCode(10))"',
                ],
                {
                    shell: true,
                    windowsHide: true,
                    stdio: ['ignore', 'pipe', 'pipe'],
                }
            );
            const application = {
                process: () => shell,
                close: async () => {
                    throw new Error('Exercise forced termination');
                },
            };
            captureElectronProcess(application);
            const pidOutput = createInterface({ input: shell.stdout });
            try {
                const [output] = await once(pidOutput, 'line', {
                    signal: AbortSignal.timeout(5000),
                });
                const descendantPid = Number(String(output).trim());
                assert.ok(
                    Number.isSafeInteger(descendantPid) && descendantPid > 0
                );
                assert.notEqual(descendantPid, shell.pid);
                process.kill(descendantPid, 0);

                // taskkill may reap the descendant before cmd.exe naturally
                // exits, then report that the shell is gone. Use the same
                // exit-confirmation path as the real fixture; still verify
                // that neither shell nor descendant remains alive.
                await closeElectronApplicationAndConfirmExit(application, {
                    closeTimeoutMs: 1000,
                    exitTimeoutMs: 2000,
                });
                assert.ok(shell.exitCode !== null || shell.signalCode !== null);
                await assert.rejects(
                    async () => process.kill(descendantPid, 0),
                    {
                        code: 'ESRCH',
                    }
                );
            } finally {
                pidOutput.close();
                if (shell.exitCode === null && shell.signalCode === null) {
                    // The successful taskkill can precede Node's exit event.
                    try {
                        terminateElectronProcess(shell);
                    } catch {
                        /* already exited */
                    }
                }
            }
        }
    );
});
