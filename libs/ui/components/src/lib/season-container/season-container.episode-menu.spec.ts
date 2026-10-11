import { OverlayContainer } from '@angular/cdk/overlay';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { DownloadsService } from '@iptvnator/services';
import type { XtreamSerieEpisode } from '@iptvnator/shared/interfaces';
import {
    SeasonContainerComponent,
    type EpisodeViewMode,
    type SeasonEpisodeMenuSections,
} from './season-container.component';
import { SAVED_VOD_ADD_MENU_ITEM } from '../detail-ui/saved-vod-add-menu-item';

describe('SeasonContainer episode overflow presentation', () => {
    let fixture: ComponentFixture<SeasonContainerComponent>;
    let overlay: HTMLElement;
    const episode = {
        id: '101',
        season: 1,
        episode_num: 1,
        title: 'Pilot',
        info: {},
    } as XtreamSerieEpisode;
    const selected = jest.fn();
    const playback = jest.fn();

    beforeEach(async () => {
        localStorage.removeItem('iptvnator_episode_view_mode');
        await TestBed.configureTestingModule({
            imports: [
                SeasonContainerComponent,
                TranslateModule.forRoot(),
                NoopAnimationsModule,
            ],
            providers: [
                { provide: MatDialog, useValue: { open: jest.fn() } },
                { provide: MatSnackBar, useValue: { open: jest.fn() } },
                {
                    provide: DownloadsService,
                    useValue: {
                        isAvailable: signal(false),
                        hasAuthoritativeDownloadList: signal(false),
                        hasLoadedDownloads: signal(false),
                        downloads: signal([]),
                    },
                },
            ],
        }).compileComponents();
        fixture = TestBed.createComponent(SeasonContainerComponent);
        fixture.componentRef.setInput('seasons', { '1': [episode] });
        fixture.componentRef.setInput('seriesId', 20);
        fixture.componentRef.setInput('playlistId', 'local-source');
        overlay = TestBed.inject(OverlayContainer).getContainerElement();
        selected.mockClear();
        playback.mockClear();
        fixture.componentInstance.episodeMenuSelected.subscribe(selected);
        fixture.componentInstance.episodeClicked.subscribe(playback);
    });

    afterEach(() => {
        fixture.destroy();
        localStorage.removeItem('iptvnator_episode_view_mode');
        jest.useRealTimers();
    });

    function trigger(): HTMLButtonElement | null {
        return fixture.nativeElement.querySelector(
            '[data-testid="episode-more-menu-101"]'
        );
    }

    function requiredTrigger(): HTMLButtonElement {
        const button = trigger();
        if (!button)
            throw new Error('Expected an eligible episode menu trigger');
        return button;
    }

    function requiredAction(): HTMLButtonElement {
        const button = overlay.querySelector<HTMLButtonElement>(
            '[data-menu-item="add-to-saved-playlist"]'
        );
        if (!button) throw new Error('Expected an open Add menu item');
        return button;
    }

    it.each<EpisodeViewMode>(['grid', 'list'])(
        'uses the shared icon/menu in %s without starting playback',
        (viewMode) => {
            fixture.componentRef.setInput('episodeMenuSections', (() => [
                { items: [SAVED_VOD_ADD_MENU_ITEM] },
            ]) satisfies SeasonEpisodeMenuSections);
            fixture.componentInstance.viewMode.set(viewMode);
            fixture.detectChanges();
            requiredTrigger().click();
            fixture.detectChanges();
            const action = requiredAction();
            expect(action.querySelector('mat-icon')?.textContent?.trim()).toBe(
                'playlist_add'
            );
            action.click();
            fixture.detectChanges();
            expect(selected).toHaveBeenCalledWith({
                episode,
                actionId: SAVED_VOD_ADD_MENU_ITEM.id,
            });
            expect(playback).not.toHaveBeenCalled();
            expect(overlay.querySelector('[role="menu"]')).toBeNull();
            expect(document.activeElement).toBe(trigger());
        }
    );

    it.each<EpisodeViewMode>(['grid', 'list'])(
        'omits the menu in %s when the host has no eligible actions',
        (viewMode) => {
            fixture.componentInstance.viewMode.set(viewMode);
            fixture.detectChanges();
            expect(trigger()).toBeNull();
            fixture.componentRef.setInput('episodeMenuSections', () => []);
            fixture.detectChanges();
            expect(trigger()).toBeNull();
        }
    );

    it('opens by keyboard and restores trigger focus on Escape', () => {
        jest.useFakeTimers();
        fixture.componentRef.setInput('episodeMenuSections', () => [
            { items: [SAVED_VOD_ADD_MENU_ITEM] },
        ]);
        fixture.detectChanges();
        requiredTrigger().focus();
        requiredTrigger().dispatchEvent(
            new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
        );
        fixture.detectChanges();
        jest.runOnlyPendingTimers();
        const action = requiredAction();
        expect(document.activeElement).toBe(action);
        action.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
        fixture.detectChanges();
        expect(document.activeElement).toBe(trigger());
        expect(selected).not.toHaveBeenCalled();
        expect(playback).not.toHaveBeenCalled();
    });

    it('revalidates an open action when the host invalidates its episode', () => {
        let eligible = true;
        fixture.componentRef.setInput('episodeMenuSections', () =>
            eligible ? [{ items: [SAVED_VOD_ADD_MENU_ITEM] }] : []
        );
        fixture.detectChanges();
        requiredTrigger().click();
        fixture.detectChanges();
        const action = requiredAction();
        eligible = false;
        action.click();
        fixture.detectChanges();
        expect(selected).not.toHaveBeenCalled();
        expect(playback).not.toHaveBeenCalled();
    });
});
