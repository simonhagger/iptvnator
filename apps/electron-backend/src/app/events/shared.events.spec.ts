const mockHandle = jest.fn();
const mockConfigure = jest.fn();
const mockRelease = jest.fn();

jest.mock('electron', () => ({ ipcMain: { handle: mockHandle } }));
jest.mock('../services/request-header-overrides.service', () => ({
    configureRequestHeaderOverride: mockConfigure,
    releaseStreamHeaderOverride: mockRelease,
}));

describe('stream header IPC lifecycle', () => {
    it('distinguishes headerless activation from an explicit release', async () => {
        await import('./shared.events');
        const handler = mockHandle.mock.calls.find(
            ([channel]) => channel === 'set-user-agent'
        )[1];
        const event = { sender: { id: 7 } };
        const url = 'https://stream.example/live.ts';

        handler(event, undefined, undefined, url);
        expect(mockConfigure).toHaveBeenCalledWith(
            undefined,
            undefined,
            url,
            null,
            7
        );
        mockConfigure.mockClear();

        handler(event, undefined, undefined, url, undefined, 'release');
        expect(mockRelease).toHaveBeenCalledWith(url, 7);
        expect(mockConfigure).not.toHaveBeenCalled();
    });
});
