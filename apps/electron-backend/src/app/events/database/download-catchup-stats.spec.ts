import {
    lstatSync,
    mkdtempSync,
    rmSync,
    writeFileSync,
    type BigIntStats,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    archiveFileStats,
    readArchiveStats,
    readArchiveStatsSync,
} from './download-catchup-stats';
import {
    archiveFileIdentity,
    sameArchiveFileIdentity,
} from './download-catchup-output';
import { parseArchiveFinalization } from './download-catchup-journal';

function stats(ino: string) {
    return archiveFileStats({
        dev: BigInt(1),
        ino: BigInt(ino),
        birthtimeMs: BigInt(1000),
        birthtimeNs: BigInt('1000123456'),
        size: BigInt(188),
        nlink: BigInt(1),
        isFile: () => true,
    } as BigIntStats);
}
it('round-trips 64-bit Windows file references without losing ownership proof', () => {
    const file = stats('18446744073709551000');
    const identity = archiveFileIdentity(file);
    const proof = parseArchiveFinalization(
        JSON.stringify({
            version: 1,
            phase: 'transfer',
            filePath: '/archive.ts',
            partialIdentity: identity,
        })
    );
    expect(proof?.partialIdentity.ino).toBe('18446744073709551000');
    expect(sameArchiveFileIdentity(file, proof!.partialIdentity)).toBe(true);
    expect(identity.birthtimeMs).toBe(1000.123456);
});
it('distinguishes adjacent file references that collide when converted to Number', () => {
    const a = stats('18446744073709551000');
    const b = stats('18446744073709551001');
    expect(Number(a.ino)).toBe(Number(b.ino));
    expect(sameArchiveFileIdentity(a, b)).toBe(false);
});

it('rejects already-rounded numeric ownership evidence', () => {
    const rounded = {
        dev: 1,
        ino: Number('18446744073709551000'),
        birthtimeMs: 1000,
    };
    expect(sameArchiveFileIdentity(rounded, rounded)).toBe(false);
    expect(() => archiveFileIdentity(rounded)).toThrow(
        'identity is unavailable'
    );
});

it('round-trips real filesystem ownership through bigint-safe fixture readers', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'archive-stats-'));
    const path = join(directory, 'archive.ts');
    try {
        writeFileSync(path, 'archive');
        const raw = lstatSync(path, { bigint: true });
        const synchronous = readArchiveStatsSync(path);
        const asynchronous = await readArchiveStats(path);
        const identity = archiveFileIdentity(synchronous);
        expect(identity.ino).toBe(String(raw.ino));
        expect(identity.dev).toBe(String(raw.dev));
        expect(sameArchiveFileIdentity(asynchronous, identity)).toBe(true);
        expect(asynchronous.size).toBe(7);
        expect(asynchronous.isFile()).toBe(true);
        expect(
            sameArchiveFileIdentity(asynchronous, {
                ...identity,
                ino: String(raw.ino + BigInt(1)),
            })
        ).toBe(false);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
