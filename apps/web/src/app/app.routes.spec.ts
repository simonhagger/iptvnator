import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ParentalLockService, SettingsStore } from '@iptvnator/services';

type AppRoutesModule = typeof import('./app.routes');

describe('app routes', () => {
    let workspaceRoute: import('@angular/router').Route | undefined;
    let workspaceChildren: Array<{
        canActivate?: unknown[];
        data?: Record<string, unknown>;
        loadChildren?: unknown;
        loadComponent?: unknown;
        path?: string;
        pathMatch?: string;
        redirectTo?: unknown;
    }> = [];
    let resolveElectronOnlyGlobalSearchRoute: AppRoutesModule['resolveElectronOnlyGlobalSearchRoute'];
    let resolveRecordingsCapabilityRoute: AppRoutesModule['resolveRecordingsCapabilityRoute'];
    let startupPreferencesToken: (typeof import('./services/workspace-startup-preferences.lazy'))['WorkspaceStartupPreferencesService'];

    beforeAll(async () => {
        jest.unstable_mockModule(
            '@iptvnator/playlist/m3u/feature-player',
            () => ({
                createM3uWorkspaceRoutes: () => [
                    {
                        path: '',
                        pathMatch: 'full',
                        redirectTo: 'all',
                    },
                    {
                        path: 'favorites',
                        data: {
                            mode: 'favorites',
                            portalType: 'm3u',
                            defaultScope: 'playlist',
                        },
                    },
                    {
                        path: 'recent',
                        data: {
                            mode: 'recent',
                            portalType: 'm3u',
                            defaultScope: 'playlist',
                        },
                    },
                    {
                        path: ':view',
                    },
                ],
            })
        );

        const appRoutes = await import('./app.routes');
        const { routes } = appRoutes;
        workspaceRoute = routes.find((route) => route.path === 'workspace');
        workspaceChildren = workspaceRoute?.children ?? [];
        resolveElectronOnlyGlobalSearchRoute =
            appRoutes.resolveElectronOnlyGlobalSearchRoute;
        resolveRecordingsCapabilityRoute =
            appRoutes.resolveRecordingsCapabilityRoute;
        startupPreferencesToken = (
            await import('./services/workspace-startup-preferences.lazy')
        ).WorkspaceStartupPreferencesService;
    });

    afterEach(() => {
        TestBed.resetTestingModule();
    });

    it('resolves the lazy workspace entry with the existing injected preferences', async () => {
        let release!: (path: string) => void;
        const pending = new Promise<string>((resolve) => {
            release = resolve;
        });
        let started!: () => void;
        const invoked = new Promise<void>((resolve) => {
            started = resolve;
        });
        const resolveInitialWorkspacePath = jest.fn(() => {
            started();
            return pending;
        });
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: startupPreferencesToken,
                    useValue: { resolveInitialWorkspacePath },
                },
            ],
        });
        const redirect = workspaceChildren.find(
            (route) => route.path === '' && route.pathMatch === 'full'
        )?.redirectTo as () => Promise<string>;
        const resolution = TestBed.runInInjectionContext(redirect);
        let resolved = false;
        void resolution.then(() => {
            resolved = true;
        });

        await invoked;
        expect(resolveInitialWorkspacePath).toHaveBeenCalledTimes(1);
        expect(resolved).toBe(false);

        release('/workspace/saved-playlists');
        await expect(resolution).resolves.toBe('/workspace/saved-playlists');
    });

    it.each(['/workspace/dashboard', '/workspace/sources'])(
        'keeps the lazy dashboard guard decision for %s',
        async (path) => {
            const urlTree = { redirectedTo: path };
            const parseUrl = jest.fn(() => urlTree);
            const resolveDashboardPath = jest.fn().mockResolvedValue(path);
            TestBed.configureTestingModule({
                providers: [
                    { provide: Router, useValue: { parseUrl } },
                    {
                        provide: startupPreferencesToken,
                        useValue: { resolveDashboardPath },
                    },
                ],
            });
            const guard = workspaceChildren.find(
                (route) => route.path === 'dashboard'
            )?.canActivate?.[0] as () => Promise<unknown>;

            await expect(TestBed.runInInjectionContext(guard)).resolves.toBe(
                path === '/workspace/dashboard' ? true : urlTree
            );
            expect(resolveDashboardPath).toHaveBeenCalledTimes(1);
            if (path === '/workspace/dashboard') {
                expect(parseUrl).not.toHaveBeenCalled();
            } else {
                expect(parseUrl).toHaveBeenCalledWith(path);
            }
        }
    );

    it('waits for the parental lock state before activating workspace children', async () => {
        let releaseLock!: () => void;
        const lockPending = new Promise<void>((resolve) => {
            releaseLock = resolve;
        });
        const initialize = jest.fn(() => lockPending);
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: SettingsStore,
                    useValue: {
                        loadSettings: jest.fn().mockResolvedValue(undefined),
                    },
                },
                { provide: ParentalLockService, useValue: { initialize } },
            ],
        });
        const settingsReadyResolver =
            workspaceRoute?.resolve?.['settingsReady'];
        if (typeof settingsReadyResolver !== 'function') {
            throw new Error('resolver missing');
        }
        let resolved = false;
        const resolution = TestBed.runInInjectionContext(() =>
            Promise.resolve(
                (
                    settingsReadyResolver as import('@angular/router').ResolveFn<void>
                )(
                    {} as import('@angular/router').ActivatedRouteSnapshot,
                    {} as import('@angular/router').RouterStateSnapshot
                )
            )
        ).then(() => {
            resolved = true;
        });
        await Promise.resolve();
        await Promise.resolve();

        expect(initialize).toHaveBeenCalled();
        expect(resolved).toBe(false);

        releaseLock();
        await resolution;
        expect(resolved).toBe(true);
    });

    it('waits for settings before activating workspace children', async () => {
        let releaseSettings!: () => void;
        const settingsPending = new Promise<void>((resolve) => {
            releaseSettings = resolve;
        });
        const loadSettings = jest.fn(() => settingsPending);
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: SettingsStore,
                    useValue: { loadSettings },
                },
                {
                    provide: ParentalLockService,
                    useValue: {
                        initialize: jest.fn().mockResolvedValue(undefined),
                    },
                },
            ],
        });
        const settingsReadyResolver =
            workspaceRoute?.resolve?.['settingsReady'];

        expect(typeof settingsReadyResolver).toBe('function');
        if (typeof settingsReadyResolver !== 'function') {
            return;
        }

        const resolution = TestBed.runInInjectionContext(() =>
            Promise.resolve(
                (
                    settingsReadyResolver as import('@angular/router').ResolveFn<void>
                )(
                    {} as import('@angular/router').ActivatedRouteSnapshot,
                    {} as import('@angular/router').RouterStateSnapshot
                )
            )
        );
        let resolved = false;
        void resolution.then(() => {
            resolved = true;
        });

        await Promise.resolve();

        expect(loadSettings).toHaveBeenCalledTimes(1);
        expect(resolved).toBe(false);

        releaseSettings();

        await expect(resolution).resolves.toBeUndefined();
        expect(resolved).toBe(true);
    });

    it('routes saved lists before provider fallbacks under the initialized workspace', () => {
        const savedIndex = workspaceChildren.findIndex(
            (route) => route.path === 'saved-playlists'
        );
        const providerIndex = workspaceChildren.findIndex(
            (route) => route.path === '' && route.loadChildren
        );
        expect(savedIndex).toBeGreaterThan(-1);
        expect(savedIndex).toBeLessThan(providerIndex);
        expect(typeof workspaceChildren[savedIndex].loadComponent).toBe(
            'function'
        );
        expect(workspaceRoute?.data?.['layout']).toBe('workspace');
        expect(typeof workspaceRoute?.resolve?.['settingsReady']).toBe(
            'function'
        );
    });

    it('lazy-loads M3U workspace routes through the feature boundary', async () => {
        const playlistRoute = workspaceChildren.find(
            (route) => route.path === 'playlists/:id'
        );
        const loadChildren = playlistRoute?.loadChildren as
            (() => Promise<typeof workspaceChildren>) | undefined;
        const m3uRoutes = (await loadChildren?.()) ?? [];
        const defaultRoute = m3uRoutes.find((route) => route.path === '');
        const favoritesRoute = m3uRoutes.find(
            (route) => route.path === 'favorites'
        );
        const recentRoute = m3uRoutes.find((route) => route.path === 'recent');
        const playerRoute = m3uRoutes.find((route) => route.path === ':view');

        expect(defaultRoute?.redirectTo).toBe('all');
        expect(favoritesRoute?.data).toEqual({
            mode: 'favorites',
            portalType: 'm3u',
            defaultScope: 'playlist',
        });
        expect(recentRoute?.data).toEqual({
            mode: 'recent',
            portalType: 'm3u',
            defaultScope: 'playlist',
        });

        expect(playerRoute).toBeDefined();
    });

    it('adds a shared /workspace/global-recent route', async () => {
        const globalRecentRoute = workspaceChildren.find(
            (route) => route.path === 'global-recent'
        );

        expect(globalRecentRoute?.data).toEqual({
            mode: 'recent',
            defaultScope: 'all',
        });
        expect(typeof globalRecentRoute?.loadComponent).toBe('function');
    });

    it('adds a routed /workspace/search global search view', async () => {
        const globalSearchRoute = workspaceChildren.find(
            (route) => route.path === 'search'
        );

        expect(globalSearchRoute?.data).toEqual({
            isGlobalSearch: true,
        });
        expect(globalSearchRoute?.canActivate).toHaveLength(1);
        expect(typeof globalSearchRoute?.loadComponent).toBe('function');
    });

    it('redirects the Electron-only global search route in the web runtime', async () => {
        const redirectTree = { url: '/workspace/sources' };
        const parseUrl = jest.fn().mockReturnValue(redirectTree);

        const result = resolveElectronOnlyGlobalSearchRoute(
            { isElectron: false },
            { parseUrl }
        );

        expect(parseUrl).toHaveBeenCalledWith('/workspace/sources');
        expect(result).toBe(redirectTree);
    });

    it('guards the focused recording detail behind the recordings capability', async () => {
        const recordingRoute = workspaceChildren.find(
            (route) => route.path === 'downloads/recording/:recordingId'
        );

        expect(recordingRoute?.canActivate).toHaveLength(1);
    });

    it('redirects the recording detail to the manager without the capability', async () => {
        const redirectTree = { url: '/workspace/downloads' };
        const parseUrl = jest.fn().mockReturnValue(redirectTree);

        const result = resolveRecordingsCapabilityRoute(
            { supportsRecordings: false },
            { parseUrl }
        );

        expect(parseUrl).toHaveBeenCalledWith('/workspace/downloads');
        expect(result).toBe(redirectTree);
        expect(
            resolveRecordingsCapabilityRoute(
                { supportsRecordings: true },
                { parseUrl }
            )
        ).toBe(true);
    });

    it('uses a dynamic redirect for the default /workspace child route', async () => {
        const workspaceDefaultRoute = workspaceChildren.find(
            (route) => route.path === ''
        );

        expect(typeof workspaceDefaultRoute?.redirectTo).toBe('function');
    });

    it('protects the dashboard route behind a visibility guard', async () => {
        const dashboardRoute = workspaceChildren.find(
            (route) => route.path === 'dashboard'
        );

        expect(dashboardRoute?.canActivate).toHaveLength(1);
    });
});
