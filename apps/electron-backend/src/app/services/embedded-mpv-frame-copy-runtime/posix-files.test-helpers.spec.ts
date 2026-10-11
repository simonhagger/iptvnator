import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import {
    chmodFixtureSync,
    clearPosixFixtureMetadata,
    lstatFixtureSync,
    symlinkFixtureSync,
} from './posix-files.test-helpers';

describe('POSIX runtime file fixtures', () => {
    let rootDir: string;

    beforeEach(() => {
        rootDir = mkdtempSync(path.join(tmpdir(), 'mpv-posix-fixtures-'));
    });

    afterEach(() => {
        clearPosixFixtureMetadata(rootDir);
        rmSync(rootDir, { recursive: true, force: true });
    });

    it.each([0o755, 0o4755, 0o2755, 0o1755, 0o600])(
        'retains permission mode %i without changing actual bytes',
        (mode) => {
            const file = path.join(rootDir, 'helper');
            writeFileSync(file, 'runtime bytes');
            chmodFixtureSync(file, mode);

            const stat = lstatFixtureSync(file);
            expect(stat.mode & 0o7777).toBe(mode);
            expect(stat.isFile()).toBe(true);
            expect(stat.isSymbolicLink()).toBe(false);
            expect(stat.size).toBe(Buffer.byteLength('runtime bytes'));
            expect(readFileSync(file, 'utf8')).toBe('runtime bytes');
        }
    );

    it('distinguishes symlinks from regular artifacts', () => {
        const target = path.join(rootDir, 'target');
        const link = path.join(rootDir, 'link');
        writeFileSync(target, 'runtime bytes');
        symlinkFixtureSync(target, link);

        expect(lstatFixtureSync(target).isFile()).toBe(true);
        expect(lstatFixtureSync(link).isSymbolicLink()).toBe(true);
        expect(lstatFixtureSync(link).isFile()).toBe(false);
    });

    it('clears metadata only for the disposed fixture root', () => {
        const firstRoot = path.join(rootDir, 'first');
        const secondRoot = path.join(rootDir, 'first-other');
        // Parent directories also exercise root-prefix isolation.
        mkdirSync(firstRoot);
        mkdirSync(secondRoot);
        const first = path.join(firstRoot, 'helper');
        const second = path.join(secondRoot, 'helper');
        writeFileSync(first, 'first');
        writeFileSync(second, 'second');
        chmodFixtureSync(first, 0o755);
        chmodFixtureSync(second, 0o755);
        clearPosixFixtureMetadata(firstRoot);

        expect(lstatFixtureSync(second).mode & 0o7777).toBe(0o755);
        // Native POSIX permissions survive clearing test metadata. Windows
        // falls back to the default regular-artifact permissions.
        expect(lstatFixtureSync(first).mode & 0o7777).toBe(
            process.platform === 'win32' ? 0o644 : 0o755
        );
        expect(() => lstatFixtureSync(path.join(rootDir, 'missing'))).toThrow();
    });
});
