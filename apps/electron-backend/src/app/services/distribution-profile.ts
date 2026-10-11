import { join } from 'node:path';

export type DistributionProfile = 'upstream' | 'personal';
const PROFILE_KEY = Symbol.for('iptvnator.distributionProfile');

/** A package-owned policy, never supplied by a renderer or provider. */
export function resolveDistributionProfile(
    metadata: unknown
): DistributionProfile {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
        throw new Error('Invalid packaged application metadata');
    const value = (metadata as Record<string, unknown>)[
        'iptvnatorDistribution'
    ];
    if (value === undefined) return 'upstream';
    if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        (value as Record<string, unknown>)['profile'] !== 'personal' ||
        (value as Record<string, unknown>)['updates'] !== 'disabled' ||
        Object.keys(value).some((key) => key !== 'profile' && key !== 'updates')
    )
        throw new Error('Invalid IPTVnator distribution policy');
    return 'personal';
}

export interface DistributionApp {
    readonly isPackaged: boolean;
    getAppPath(): string;
    setName(name: string): void;
    setPath(name: 'userData', value: string): void;
}

/** Runs before the compile cache and before settings/database eager imports. */
export function initializeDistributionProfile(options: {
    app: DistributionApp;
    env: NodeJS.ProcessEnv;
    homeDirectory: string;
    readMetadata: (path: string) => unknown;
    ensureDirectory: (path: string) => void;
}): DistributionProfile {
    const { app, env } = options;
    const profile = app.isPackaged
        ? resolveDistributionProfile(
              options.readMetadata(join(app.getAppPath(), 'package.json'))
          )
        : 'upstream';
    if (profile === 'personal') {
        env.IPTVNATOR_DATA_DIR = join(
            options.homeDirectory,
            '.iptvnator-personal'
        );
        const userData = join(
            env.IPTVNATOR_E2E_DATA_DIR?.trim() || env.IPTVNATOR_DATA_DIR,
            'user-data'
        );
        options.ensureDirectory(userData);
        app.setName('iptvnator-personal');
        app.setPath('userData', userData);
    }
    (globalThis as Record<symbol, unknown>)[PROFILE_KEY] = profile;
    return profile;
}

/** Symbol state crosses the independently compiled entry/application bundles. */
export function getDistributionProfile(): DistributionProfile {
    return (globalThis as Record<symbol, unknown>)[PROFILE_KEY] === 'personal'
        ? 'personal'
        : 'upstream';
}
