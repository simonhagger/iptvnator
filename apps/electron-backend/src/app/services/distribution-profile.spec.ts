import { join } from 'node:path';
import {
    getDistributionProfile,
    initializeDistributionProfile,
    resolveDistributionProfile,
} from './distribution-profile';

const policy = {
    iptvnatorDistribution: { profile: 'personal', updates: 'disabled' },
};

describe('package-owned distribution profile', () => {
    afterEach(() => {
        delete (globalThis as Record<symbol, unknown>)[
            Symbol.for('iptvnator.distributionProfile')
        ];
    });

    function setup(metadata: unknown = policy, isPackaged = true) {
        const app = {
            isPackaged,
            getAppPath: jest.fn(() => '/package'),
            setName: jest.fn(),
            setPath: jest.fn(),
        };
        const readMetadata = jest.fn(() => metadata);
        const ensureDirectory = jest.fn();
        const env: NodeJS.ProcessEnv = {};
        return {
            app,
            readMetadata,
            ensureDirectory,
            env,
            homeDirectory: '/home',
        };
    }

    it('leaves every upstream profile default unchanged when the marker is absent', () => {
        const options = setup({ name: 'iptvnator' });
        expect(initializeDistributionProfile(options)).toBe('upstream');
        expect(options.app.setName).not.toHaveBeenCalled();
        expect(options.app.setPath).not.toHaveBeenCalled();
        expect(options.ensureDirectory).not.toHaveBeenCalled();
        expect(options.env).toEqual({});
    });

    it('isolates a personal package before any cache, config or worker can start', () => {
        const options = setup();
        expect(initializeDistributionProfile(options)).toBe('personal');
        expect(options.readMetadata).toHaveBeenCalledWith(
            join('/package', 'package.json')
        );
        expect(options.env.IPTVNATOR_DATA_DIR).toBe(
            join('/home', '.iptvnator-personal')
        );
        expect(options.ensureDirectory).toHaveBeenCalledWith(
            join('/home', '.iptvnator-personal', 'user-data')
        );
        expect(options.app.setPath).toHaveBeenCalledWith(
            'userData',
            join('/home', '.iptvnator-personal', 'user-data')
        );
        expect(options.app.setName).toHaveBeenCalledWith('iptvnator-personal');
        expect(getDistributionProfile()).toBe('personal');
    });

    it('keeps personal package smoke writes inside the disposable test root', () => {
        const options = setup();
        options.env.IPTVNATOR_E2E_DATA_DIR = '/owned-test';
        initializeDistributionProfile(options);
        expect(options.app.setPath).toHaveBeenCalledWith(
            'userData',
            join('/owned-test', 'user-data')
        );
        expect(options.ensureDirectory).not.toHaveBeenCalledWith(
            join('/home', '.iptvnator-personal', 'user-data')
        );
    });

    it('never reads packaged policy or renames development launches', () => {
        const options = setup(policy, false);
        initializeDistributionProfile(options);
        expect(options.readMetadata).not.toHaveBeenCalled();
        expect(options.env).toEqual({});
    });

    it.each([
        null,
        [],
        'personal',
        { profile: 'personal' },
        { profile: 'personal', updates: 'upstream' },
        { profile: 'other', updates: 'disabled' },
        { profile: 'personal', updates: 'disabled', dataRoot: '/existing' },
    ])(
        'fails closed for invalid present policy %j before profile writes',
        (value) => {
            const options = setup({ iptvnatorDistribution: value });
            expect(() => initializeDistributionProfile(options)).toThrow(
                'Invalid IPTVnator distribution policy'
            );
            expect(options.ensureDirectory).not.toHaveBeenCalled();
            expect(options.app.setPath).not.toHaveBeenCalled();
            expect(options.env).toEqual({});
        }
    );

    it.each([null, [], 'invalid'])(
        'rejects malformed application metadata %j',
        (value) => {
            expect(() => resolveDistributionProfile(value)).toThrow(
                'Invalid packaged application metadata'
            );
        }
    );
});
