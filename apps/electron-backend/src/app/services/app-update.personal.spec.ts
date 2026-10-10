import { AppUpdateService } from './app-update.service';

describe('personal distribution update boundary', () => {
    it('never resolves the updater, fetches upstream releases or installs updates', async () => {
        const updater = jest.fn(() => {
            throw new Error('Updater must not be resolved');
        });
        const fetcher = jest.fn();
        const prepareQuit = jest.fn();
        const service = new AppUpdateService({
            app: { isPackaged: true, getVersion: () => '0.25.0' },
            platform: 'win32',
            updater,
            releaseFetcher: fetcher,
            getMainWindow: () => null,
            prepareQuit,
            ...{ updatesEnabled: false },
        });
        expect(service.getStatus()).toMatchObject({
            status: 'unsupported',
            updatesEnabled: false,
            supportedSelfUpdate: false,
            manualDownloadUrl: '',
        });
        await service.checkForUpdatesOnStartup();
        await service.checkForUpdates();
        service.setChannel('nightly');
        await service.downloadUpdate();
        service.installUpdate();
        await expect(service.getReleaseNotes()).rejects.toThrow(
            'Updates are disabled for this distribution'
        );
        expect(service.getStatus()).toMatchObject({
            status: 'unsupported',
            channel: 'nightly',
            manualDownloadUrl: '',
        });
        expect(updater).not.toHaveBeenCalled();
        expect(fetcher).not.toHaveBeenCalled();
        expect(prepareQuit).not.toHaveBeenCalled();
    });
});
