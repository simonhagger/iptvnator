import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

/** Execute this workspace's installed Nx with Node, without a shell or .cmd launcher. */
export function workspaceNxCommand(workspaceRoot, args) {
    const require = createRequire(path.join(workspaceRoot, 'package.json'));
    return {
        file: process.execPath,
        args: [require.resolve('nx/bin/nx.js'), ...args],
    };
}
