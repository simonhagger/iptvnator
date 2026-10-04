const mockHandle = jest.fn();
const mockConfigure = jest.fn();
const mockRelease = jest.fn();
const mockReleaseRenderer = jest.fn();

jest.mock('electron', () => ({ ipcMain: { handle: mockHandle } }));
jest.mock('../services/request-header-overrides.service', () => ({
    configureRequestHeaderOverride: mockConfigure,
    releaseStreamHeaderOverride: mockRelease,
    releaseRendererStreamHeaderOverride: mockReleaseRenderer,
}));

describe('stream header IPC lifecycle', () => {
    it('distinguishes headerless activation from an explicit release', async () => {
        await import('./shared.events');
        const handler = mockHandle.mock.calls.find(
            ([channel]) => channel === 'set-user-agent'
        )[1];
        const event = { sender: { id: 7, on: jest.fn(), once: jest.fn() } };
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
        const navigation = event.sender.on.mock.calls.find(
            ([name]) => name === 'did-start-navigation'
        )[1];
        navigation({}, 'https://app.example', true, true);
        navigation({}, 'https://app.example', false, false);
        expect(mockReleaseRenderer).not.toHaveBeenCalled();
        navigation({}, 'https://app.example', false, true);
        expect(mockReleaseRenderer).toHaveBeenCalledWith(7);
        event.sender.on.mock.calls.find(
            ([name]) => name === 'render-process-gone'
        )[1]();
        event.sender.once.mock.calls.find(
            ([name]) => name === 'destroyed'
        )[1]();
        expect(mockReleaseRenderer).toHaveBeenCalledTimes(3);
    });
});
