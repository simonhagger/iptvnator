const getUserData = jest.fn();
const setPath = jest.fn();
const selectLegacy = jest.fn();

jest.mock('electron', () => ({
    app: {
        getPath: () => '/upstream',
        setPath: (...args: unknown[]) => setPath(...args),
    },
}));
jest.mock('@iptvnator/shared/database', () => ({
    getElectronUserDataPath: () => getUserData(),
}));
jest.mock('./legacy-profile', () => ({
    selectLegacyProfile: (...args: unknown[]) => selectLegacy(...args),
}));

describe('explicit production Electron profile', () => {
    let previous: string | undefined;
    beforeEach(() => {
        previous = process.env.IPTVNATOR_DATA_DIR;
        delete process.env.IPTVNATOR_DATA_DIR;
        jest.resetModules();
        jest.clearAllMocks();
        getUserData.mockReturnValue(null);
        selectLegacy.mockReturnValue('/legacy');
    });
    afterEach(() => {
        if (previous === undefined) delete process.env.IPTVNATOR_DATA_DIR;
        else process.env.IPTVNATOR_DATA_DIR = previous;
    });

    it('retains automatic legacy adoption for ordinary upstream profiles', async () => {
        await import('./electron-profile-bootstrap');
        expect(selectLegacy).toHaveBeenCalled();
        expect(setPath).toHaveBeenCalledWith('userData', '/legacy');
    });

    it('does not even inspect legacy storage when a production root is explicit', async () => {
        process.env.IPTVNATOR_DATA_DIR = '/personal';
        getUserData.mockReturnValue('/personal/user-data');
        await import('./electron-profile-bootstrap');
        expect(selectLegacy).not.toHaveBeenCalled();
        expect(setPath).toHaveBeenCalledWith('userData', '/personal/user-data');
    });
});
