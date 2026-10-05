import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
    WORKSPACE_HISTORY_NAVIGATION,
    WorkspaceBackNavigationService,
    WorkspaceHistoryNavigation,
} from './workspace-back-navigation.service';

@Component({
    template: '',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
class RoutePage {}

describe('WorkspaceBackNavigationService asynchronous parent', () => {
    let harness: RouterTestingHarness;
    let router: Router;
    let service: WorkspaceBackNavigationService;
    let history: EventTarget;

    beforeEach(async () => {
        history = Object.assign(new EventTarget(), {
            currentEntry: { index: 0 },
            entries: () => [{ index: 0, sameDocument: true }],
        });
        TestBed.configureTestingModule({
            providers: [
                provideRouter([
                    { path: 'workspace/settings', component: RoutePage },
                    { path: 'workspace/dashboard', component: RoutePage },
                    { path: 'workspace/sources', component: RoutePage },
                    {
                        path: 'workspace/blocked',
                        component: RoutePage,
                        canActivate: [() => false],
                    },
                ]),
                {
                    provide: WORKSPACE_HISTORY_NAVIGATION,
                    useValue: history as unknown as WorkspaceHistoryNavigation,
                },
            ],
        });
        harness = await RouterTestingHarness.create('/workspace/settings');
        router = TestBed.inject(Router);
        service = TestBed.inject(WorkspaceBackNavigationService);
    });

    afterEach(() => jest.restoreAllMocks());

    it('keeps a newer navigation when the previous page parent arrives late', async () => {
        let resolveParent!: (parent: string) => void;
        service.back(
            () => new Promise<string>((resolve) => (resolveParent = resolve))
        );

        await harness.navigateByUrl('/workspace/sources');
        resolveParent('/workspace/dashboard');
        await Promise.resolve();
        await harness.fixture.whenStable();

        expect(router.url).toBe('/workspace/sources');
    });

    it('lets a newer Back request supersede an older unresolved parent', async () => {
        let resolveParent!: (parent: string) => void;
        service.back(
            () => new Promise<string>((resolve) => (resolveParent = resolve))
        );
        service.back(() => '/workspace/sources');
        await Promise.resolve();
        await harness.fixture.whenStable();

        resolveParent('/workspace/dashboard');
        await Promise.resolve();
        await harness.fixture.whenStable();

        expect(router.url).toBe('/workspace/sources');
    });

    it('discards an old parent when a newer navigation is cancelled by a guard', async () => {
        let resolveParent!: (parent: string) => void;
        service.back(
            () => new Promise<string>((resolve) => (resolveParent = resolve))
        );
        expect(await router.navigateByUrl('/workspace/blocked')).toBe(false);

        resolveParent('/workspace/dashboard');
        await Promise.resolve();
        await harness.fixture.whenStable();

        expect(router.url).toBe('/workspace/settings');
    });

    it('discards an unresolved parent when browser history changes', async () => {
        let resolveParent!: (parent: string) => void;
        service.back(
            () => new Promise<string>((resolve) => (resolveParent = resolve))
        );
        history.dispatchEvent(new Event('currententrychange'));

        resolveParent('/workspace/dashboard');
        await Promise.resolve();
        await harness.fixture.whenStable();

        expect(router.url).toBe('/workspace/settings');
    });

    it.each(['throws', 'rejects'])(
        'keeps the view when the parent resolver %s',
        async (failure) => {
            const warn = jest
                .spyOn(console, 'warn')
                .mockImplementation(() => undefined);
            service.back(() => {
                if (failure === 'throws') throw new Error('parent unavailable');
                return Promise.reject(new Error('parent unavailable'));
            });
            await Promise.resolve();
            await harness.fixture.whenStable();

            expect(router.url).toBe('/workspace/settings');
            expect(warn).toHaveBeenCalledWith(
                '[WorkspaceBackNavigation]',
                'Could not open the parent view'
            );
        }
    );

    it('handles a rejected parent navigation without falling out of the app', async () => {
        const warn = jest
            .spyOn(console, 'warn')
            .mockImplementation(() => undefined);
        jest.spyOn(router, 'navigateByUrl').mockRejectedValueOnce(
            new Error('guard failed')
        );
        service.back(() => '/workspace/dashboard');
        await Promise.resolve();
        await Promise.resolve();
        await harness.fixture.whenStable();

        expect(router.url).toBe('/workspace/settings');
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('does not start a parent navigation after the service is destroyed', async () => {
        let resolveParent!: (parent: string) => void;
        const navigate = jest.spyOn(router, 'navigateByUrl');
        service.back(
            () => new Promise<string>((resolve) => (resolveParent = resolve))
        );
        TestBed.resetTestingModule();

        resolveParent('/workspace/dashboard');
        await Promise.resolve();
        await Promise.resolve();

        expect(navigate).not.toHaveBeenCalled();
    });
});
