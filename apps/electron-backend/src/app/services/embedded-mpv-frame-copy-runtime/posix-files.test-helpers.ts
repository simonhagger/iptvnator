import {
    chmodSync as hostChmodSync,
    constants,
    lstatSync as hostLstatSync,
    symlinkSync as hostSymlinkSync,
    writeFileSync,
} from 'fs';
import type { Stats } from 'fs';
import path from 'path';

// Windows cannot store POSIX execute/special bits. Model those attributes at
// the probe's injected filesystem boundary, keeping real bytes and file types.
// Linux continues exercising its actual filesystem permissions and symlinks.
const modes = new Map<string, number>();
const symlinks = new Set<string>();

export function chmodFixtureSync(filePath: string, mode: number): void {
    // Windows chmod only changes readonly state, which is unrelated to Linux
    // permission validation and can obstruct fixture teardown.
    if (process.platform !== 'win32') hostChmodSync(filePath, mode);
    modes.set(path.resolve(filePath), mode);
}

export function symlinkFixtureSync(target: string, filePath: string): void {
    if (process.platform !== 'win32') {
        hostSymlinkSync(target, filePath);
        return;
    }
    writeFileSync(filePath, 'symbolic-link fixture');
    symlinks.add(path.resolve(filePath));
}

export function lstatFixtureSync(filePath: string): Stats {
    const stat = hostLstatSync(filePath);
    if (process.platform !== 'win32') return stat;
    const key = path.resolve(filePath);
    const mode =
        modes.get(key) ??
        (path.basename(filePath) === 'iptvnator_mpv_helper' ? 0o755 : 0o644);
    return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, {
        mode: symlinks.has(key)
            ? constants.S_IFLNK | 0o777
            : (stat.mode & ~0o7777) | mode,
    });
}

export function clearPosixFixtureMetadata(rootDir: string): void {
    const prefix = `${path.resolve(rootDir)}${path.sep}`;
    for (const key of modes.keys()) {
        if (key.startsWith(prefix)) modes.delete(key);
    }
    for (const key of symlinks) {
        if (key.startsWith(prefix)) symlinks.delete(key);
    }
}
