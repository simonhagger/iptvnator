import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { DataService } from '@iptvnator/services';
import {
    ELECTRON_BRIDGE_APP_UPDATE_STATUSES,
    ElectronBridgeAppUpdateStatus,
} from '@iptvnator/shared/interfaces';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MockProvider } from 'ng-mocks';
import { of, Subject } from 'rxjs';
import { ElectronServiceStub } from '../services/electron.service.stub';
import { SettingsService } from '../services/settings.service';
import { AppUpdateReleaseNotesDialogComponent } from './app-update-release-notes-dialog.component';
import { SettingsAppUpdateFacade } from './settings-app-update.facade';
import {
    createElectronStub,
    DEFAULT_APP_UPDATE_STATUS,
    MockSettingsService,
} from './test-stubs/settings-test-harness.stub';

/** The retry loop is deliberately private; tests drive it directly. */
interface SettingsAppUpdateFacadePrivateTestApi {
    loadStatus(): Promise<void>;
    waitForRetry(): Promise<void>;
}

describe('SettingsAppUpdateFacade', () => {
    let facade: SettingsAppUpdateFacade;
    let matDialog: MatDialog;
    let dataService: DataService;
    let translate: TranslateService;
    const originalElectron = window.electron;

    /** Lets the facade's async status load settle */
    const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    const privateApi = (): SettingsAppUpdateFacadePrivateTestApi =>
        facade as unknown as SettingsAppUpdateFacadePrivateTestApi;

    beforeEach(() => {
        window.electron = createElectronStub();

        TestBed.configureTestingModule({
            providers: [
                SettingsAppUpdateFacade,
                { provide: DataService, useClass: ElectronServiceStub },
                MockProvider(MatDialog, { open: jest.fn() }),
                { provide: SettingsService, useClass: MockSettingsService },
            ],
            imports: [TranslateModule.forRoot()],
        });

        facade = TestBed.inject(SettingsAppUpdateFacade);
        matDialog = TestBed.inject(MatDialog);
        dataService = TestBed.inject(DataService);
        translate = TestBed.inject(TranslateService);
    });

    afterEach(() => {
        window.electron = originalElectron;
    });

    it('loads the desktop app update status and subscribes to status pushes', async () => {
        const pushedStatus: ElectronBridgeAppUpdateStatus = {
            ...DEFAULT_APP_UPDATE_STATUS,
            latestVersion: '0.23.0',
            status: ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Available,
        };

        facade.init();
        await flush();

        // The last subscriber is the facade's own — AppUpdateInstallService
        // (injected by the facade) also subscribes at construction time.
        const statusCalls = (
            window.electron.onAppUpdateStatusChange as jest.Mock
        ).mock.calls;
        const statusHandler = statusCalls[statusCalls.length - 1][0] as (
            status: ElectronBridgeAppUpdateStatus
        ) => void;
        statusHandler(pushedStatus);

        expect(window.electron.getAppUpdateStatus).toHaveBeenCalledTimes(1);
        expect(facade.status()).toEqual(pushedStatus);
    });

    it('waits for package capability before the initial version check can fetch upstream', async () => {
        let resolveStatus:
            ((status: ElectronBridgeAppUpdateStatus) => void) | undefined;
        (window.electron.getAppUpdateStatus as jest.Mock).mockReturnValue(
            new Promise<ElectronBridgeAppUpdateStatus>((resolve) => {
                resolveStatus = resolve;
            })
        );
        const settings = TestBed.inject(SettingsService);
        facade.checkAppVersion();
        facade.init();
        expect(settings.getAppVersion).not.toHaveBeenCalled();
        expect(window.electron.getAppUpdateStatus).toHaveBeenCalledTimes(1);
        expect(resolveStatus).toBeDefined();
        resolveStatus?.({
            ...DEFAULT_APP_UPDATE_STATUS,
            updatesEnabled: false,
            supportedSelfUpdate: false,
            status: 'unsupported',
            manualDownloadUrl: '',
        });
        await flush();
        expect(settings.getAppVersion).not.toHaveBeenCalled();
        expect(facade.version()).toBe(dataService.getAppVersion());
        expect(facade.updateMessage()).toBe('SETTINGS.APP_UPDATE_DISABLED');
    });

    it('keeps upstream version checks for ordinary unsupported desktop packages', async () => {
        (window.electron.getAppUpdateStatus as jest.Mock).mockResolvedValue({
            ...DEFAULT_APP_UPDATE_STATUS,
            supportedSelfUpdate: false,
            status: 'unsupported',
        });
        const settings = TestBed.inject(SettingsService);
        facade.checkAppVersion();
        facade.init();
        await flush();
        expect(settings.getAppVersion).toHaveBeenCalledTimes(1);
        expect(window.electron.getAppUpdateStatus).toHaveBeenCalledTimes(1);
    });

    it('does not start a deferred upstream check after the About owner is disposed', async () => {
        let resolveStatus:
            ((status: ElectronBridgeAppUpdateStatus) => void) | undefined;
        (window.electron.getAppUpdateStatus as jest.Mock).mockReturnValue(
            new Promise<ElectronBridgeAppUpdateStatus>((resolve) => {
                resolveStatus = resolve;
            })
        );
        const settings = TestBed.inject(SettingsService);
        facade.checkAppVersion();
        facade.init();
        facade.dispose();
        expect(resolveStatus).toBeDefined();
        resolveStatus?.(DEFAULT_APP_UPDATE_STATUS);
        await flush();
        expect(settings.getAppVersion).not.toHaveBeenCalled();
        expect(facade.status()).toBeNull();
    });

    it('keeps failed desktop capability reads closed to upstream HTTP', async () => {
        const warning = jest
            .spyOn(console, 'warn')
            .mockImplementation(() => undefined);
        (window.electron.getAppUpdateStatus as jest.Mock).mockRejectedValue(
            new Error('Bridge unavailable')
        );
        jest.spyOn(privateApi(), 'waitForRetry').mockResolvedValue(undefined);
        facade.checkAppVersion();
        facade.init();
        await flush();
        expect(window.electron.getAppUpdateStatus).toHaveBeenCalledTimes(60);
        expect(
            TestBed.inject(SettingsService).getAppVersion
        ).not.toHaveBeenCalled();
        expect(facade.version()).toBe(dataService.getAppVersion());
        expect(facade.status()).toBeNull();
        warning.mockRestore();
    });

    it('coalesces pending desktop version checks through the complete HTTP response', async () => {
        const result = new Subject<string>();
        const settings = TestBed.inject(SettingsService);
        (settings.getAppVersion as jest.Mock).mockReturnValue(result);
        facade.checkAppVersion();
        facade.checkAppVersion();
        facade.init();
        await flush();
        expect(settings.getAppVersion).toHaveBeenCalledTimes(1);
        facade.checkAppVersion();
        await flush();
        expect(settings.getAppVersion).toHaveBeenCalledTimes(1);
        result.next('0.25.0');
        result.complete();
        await flush();
        expect(facade.updateMessage()).toBeTruthy();
    });

    it('stops listening for status pushes once disposed', () => {
        const unsubscribe = jest.fn();
        (window.electron.onAppUpdateStatusChange as jest.Mock).mockReturnValue(
            unsubscribe
        );

        facade.init();
        facade.dispose();

        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('retries the initial app update status load when IPC handlers are still starting', async () => {
        const retriedStatus: ElectronBridgeAppUpdateStatus = {
            ...DEFAULT_APP_UPDATE_STATUS,
            status: ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Unsupported,
            supportedSelfUpdate: false,
        };
        (window.electron.getAppUpdateStatus as jest.Mock)
            .mockReset()
            .mockRejectedValueOnce(new Error('No handler registered'))
            .mockResolvedValueOnce(retriedStatus);
        jest.spyOn(privateApi(), 'waitForRetry').mockResolvedValue(undefined);

        await privateApi().loadStatus();

        expect(window.electron.getAppUpdateStatus).toHaveBeenCalledTimes(2);
        expect(facade.status()).toEqual(retriedStatus);
    });

    it('waits for the desktop app update bridge method before loading status', async () => {
        const retriedStatus: ElectronBridgeAppUpdateStatus = {
            ...DEFAULT_APP_UPDATE_STATUS,
            status: ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Unsupported,
            supportedSelfUpdate: false,
        };
        delete (window.electron as Partial<typeof window.electron>)
            .getAppUpdateStatus;
        let retryCount = 0;
        const getStatus = jest.fn().mockResolvedValue(retriedStatus);
        jest.spyOn(privateApi(), 'waitForRetry').mockImplementation(
            async () => {
                retryCount += 1;

                if (retryCount === 1) {
                    window.electron.getAppUpdateStatus = getStatus;
                }
            }
        );

        await privateApi().loadStatus();

        expect(retryCount).toBe(1);
        expect(getStatus).toHaveBeenCalledTimes(1);
        expect(facade.status()).toEqual(retriedStatus);
    });

    it('forwards app update actions to the desktop bridge', async () => {
        await facade.checkForAppUpdate();
        await facade.downloadAppUpdate();
        await facade.installAppUpdate();

        expect(window.electron.checkForAppUpdate).toHaveBeenCalledTimes(1);
        expect(window.electron.downloadAppUpdate).toHaveBeenCalledTimes(1);
        expect(window.electron.installAppUpdate).toHaveBeenCalledTimes(1);
    });

    it('opens the manual release URL from unsupported update status', () => {
        const openSpy = jest.spyOn(window, 'open').mockReturnValue(null);
        facade.status.set({
            ...DEFAULT_APP_UPDATE_STATUS,
            status: ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Unsupported,
            supportedSelfUpdate: false,
        });

        facade.openManualAppUpdate();

        expect(openSpy).toHaveBeenCalledWith(
            DEFAULT_APP_UPDATE_STATUS.manualDownloadUrl,
            '_blank',
            'noreferrer'
        );
    });

    it('opens release notes dialog for the latest update version', () => {
        const openSpy = jest.spyOn(matDialog, 'open').mockReturnValue({
            afterClosed: () => of(false),
        } as unknown as ReturnType<MatDialog['open']>);
        facade.status.set({
            ...DEFAULT_APP_UPDATE_STATUS,
            latestVersion: '0.23.0',
            status: ELECTRON_BRIDGE_APP_UPDATE_STATUSES.Available,
        });

        facade.openReleaseNotes();

        expect(openSpy).toHaveBeenCalledWith(
            AppUpdateReleaseNotesDialogComponent,
            expect.objectContaining({
                data: {
                    initialVersion: '0.23.0',
                },
            })
        );
    });

    it('opens release notes dialog for the current version when no update is available', () => {
        const openSpy = jest.spyOn(matDialog, 'open').mockReturnValue({
            afterClosed: () => of(false),
        } as unknown as ReturnType<MatDialog['open']>);
        facade.status.set({
            ...DEFAULT_APP_UPDATE_STATUS,
            latestVersion: '0.21.0',
            release: {
                version: '0.21.0',
            },
            status: ELECTRON_BRIDGE_APP_UPDATE_STATUSES.NotAvailable,
        });

        facade.openReleaseNotes();

        expect(openSpy).toHaveBeenCalledWith(
            AppUpdateReleaseNotesDialogComponent,
            expect.objectContaining({
                data: {
                    initialVersion: DEFAULT_APP_UPDATE_STATUS.currentVersion,
                    fallbackToLatest: true,
                },
            })
        );
    });

    describe('Version check', () => {
        const latestVersion = '1.0.0';
        const currentVersion = '0.1.0';

        beforeEach(() => {
            const settingsService = TestBed.inject(SettingsService);
            (settingsService.getAppVersion as jest.Mock).mockReturnValue(
                of(latestVersion)
            );

            jest.spyOn(translate, 'instant').mockImplementation((key) => {
                if (key === 'SETTINGS.NEW_VERSION_AVAILABLE') {
                    return 'New version available';
                }
                if (key === 'SETTINGS.LATEST_VERSION') {
                    return 'Latest version installed';
                }
                return key;
            });
        });

        it('should return true if version is outdated', () => {
            jest.spyOn(dataService, 'getAppVersion').mockReturnValue(
                currentVersion
            );

            expect(facade.isCurrentVersionOutdated(latestVersion)).toBe(true);
        });

        it('should update notification message if version is outdated', () => {
            jest.spyOn(dataService, 'getAppVersion').mockReturnValue(
                currentVersion
            );

            facade.showVersionInformation(latestVersion);

            expect(translate.instant).toHaveBeenCalledWith(
                'SETTINGS.NEW_VERSION_AVAILABLE'
            );
            expect(facade.updateMessage()).toBe('New version available: 1.0.0');
        });

        it('reports the installed version as current when it matches', () => {
            jest.spyOn(dataService, 'getAppVersion').mockReturnValue(
                latestVersion
            );

            facade.showVersionInformation(latestVersion);

            expect(facade.updateMessage()).toBe('Latest version installed');
            expect(facade.version()).toBe(latestVersion);
        });
    });
});
