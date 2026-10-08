import { signal } from '@angular/core';
import { OverlayContainer } from '@angular/cdk/overlay';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import {
    UnifiedCollectionItem,
    contentCoverIdentity,
} from '@iptvnator/portal/shared/util';
import { SettingsStore } from '@iptvnator/services';
import { UnifiedGridTabComponent } from './unified-grid-tab.component';

const ITEMS: UnifiedCollectionItem[] = [
    {
        uid: 'x:1:movie:1',
        name: 'Blade Runner',
        contentType: 'movie',
        posterUrl: 'blade-runner.jpg',
    } as UnifiedCollectionItem,
    {
        uid: 'x:1:movie:2',
        name: 'Alien',
        contentType: 'movie',
        posterUrl: 'alien.jpg',
    } as UnifiedCollectionItem,
];

describe('UnifiedGridTabComponent posters-only wall', () => {
    let fixture: ComponentFixture<UnifiedGridTabComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [UnifiedGridTabComponent, TranslateModule.forRoot()],
            providers: [
                {
                    provide: SettingsStore,
                    useValue: { showCoverTitles: signal(false) },
                },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(UnifiedGridTabComponent);
        fixture.componentRef.setInput('items', ITEMS);
    });

    const cardInfos = () => fixture.debugElement.queryAll(By.css('.card-info'));
    const overlays = () =>
        fixture.debugElement.queryAll(By.css('.cover-title-overlay'));

    it('hides titles behind the overlay while nothing is being searched', () => {
        fixture.detectChanges();

        expect(cardInfos()).toHaveLength(0);
        expect(overlays()).toHaveLength(2);
    });

    it('keeps titles visible while a search term filters the collection', () => {
        fixture.componentRef.setInput('searchTerm', 'blade');
        fixture.detectChanges();

        expect(cardInfos()).toHaveLength(1);
        expect(cardInfos()[0].nativeElement.textContent).toContain(
            'Blade Runner'
        );
        expect(overlays()).toHaveLength(0);

        fixture.componentRef.setInput('searchTerm', '  ');
        fixture.detectChanges();

        expect(cardInfos()).toHaveLength(0);
        expect(overlays()).toHaveLength(2);
    });

    it('offers recent favourite changes only when membership is known', () => {
        fixture.componentRef.setInput('mode', 'recent');
        const item = { ...ITEMS[0], coverIndicators: { favorite: false } };
        const component = fixture.componentInstance;
        expect(component.coverActions(ITEMS[0])).toEqual([]);
        expect(component.coverActions(item)[0]).toMatchObject({
            id: 'favorite',
            labelKey: 'PORTALS.ADD_TO_FAVORITES',
            disabled: false,
        });
        const emitted = jest.fn();
        component.favoriteToggled.subscribe(emitted);
        component.onCoverAction(item, component.coverActions(item)[0]);
        expect(emitted).toHaveBeenCalledWith(item);
        fixture.componentRef.setInput(
            'pendingFavoriteKeys',
            new Set([contentCoverIdentity(item)])
        );
        const pendingAction = component.coverActions(item)[0];
        expect(pendingAction.disabled).toBe(true);
        component.onCoverAction(item, pendingAction);
        expect(emitted).toHaveBeenCalledTimes(1);
        fixture.componentRef.setInput('mode', 'favorites');
        expect(component.coverActions(item)).toEqual([]);
    });

    it('disables favourite changes while the collection refreshes its source scope', () => {
        fixture.componentRef.setInput('mode', 'recent');
        fixture.componentRef.setInput('favoriteActionsDisabled', true);
        const item = { ...ITEMS[0], coverIndicators: { favorite: true } };
        expect(fixture.componentInstance.coverActions(item)[0].disabled).toBe(
            true
        );
        fixture.componentRef.setInput('favoriteActionsDisabled', false);
        expect(fixture.componentInstance.coverActions(item)[0].disabled).toBe(
            false
        );
    });

    it('guards direct favourite removal while pending or membership is unknown, keeping history removal independent', () => {
        const component = fixture.componentInstance;
        const item = { ...ITEMS[0], coverIndicators: { favorite: true } };
        const removed = jest.fn();
        component.removeItem.subscribe(removed);
        fixture.componentRef.setInput(
            'pendingFavoriteKeys',
            new Set([contentCoverIdentity(item)])
        );
        expect(component.removeActionDisabled(item)).toBe(true);
        component.onRemove(item);
        expect(removed).not.toHaveBeenCalled();
        fixture.componentRef.setInput('pendingFavoriteKeys', new Set());
        expect(component.removeActionDisabled(ITEMS[0])).toBe(true);
        component.onRemove(ITEMS[0]);
        expect(removed).not.toHaveBeenCalled();
        component.onRemove(item);
        expect(removed).toHaveBeenCalledWith(item);
        fixture.componentRef.setInput('mode', 'recent');
        component.onRemove(ITEMS[0]);
        expect(removed).toHaveBeenCalledTimes(2);
    });

    it('locks an episode history action by its parent favourite while retaining history ownership', () => {
        fixture.componentRef.setInput('mode', 'recent');
        const parent: UnifiedCollectionItem = {
            ...ITEMS[0],
            uid: 'xtream::portal::series:900',
            sourceType: 'xtream',
            playlistId: 'portal',
            contentType: 'series',
            xtreamId: 900,
        };
        const episode = {
            ...parent,
            uid: 'xtream::portal::series:909',
            xtreamId: 909,
            contentId: 88,
            coverFavoriteTarget: parent,
            coverIndicators: { favorite: false },
        };
        fixture.componentRef.setInput(
            'pendingFavoriteKeys',
            new Set([contentCoverIdentity(parent)])
        );
        const component = fixture.componentInstance;
        const emitted = jest.fn();
        component.favoriteToggled.subscribe(emitted);
        const pending = component.coverActions(episode)[0];
        expect(pending.disabled).toBe(true);
        component.onCoverAction(episode, pending);
        expect(emitted).not.toHaveBeenCalled();
        expect(component.trackByUid(0, episode)).toBe(
            contentCoverIdentity(episode)
        );
        fixture.componentRef.setInput('pendingFavoriteKeys', new Set());
        component.onCoverAction(episode, component.coverActions(episode)[0]);
        expect(emitted).toHaveBeenCalledWith(episode);
        expect(episode.contentId).toBe(88);
        expect(episode.xtreamId).toBe(909);
    });

    it('omits an unresolved history favourite target even with stale indicators', () => {
        fixture.componentRef.setInput('mode', 'recent');
        expect(
            fixture.componentInstance.coverActions({
                ...ITEMS[0],
                coverFavoriteTarget: null,
                coverIndicators: { favorite: false },
            } as UnifiedCollectionItem)
        ).toEqual([]);
    });

    it('keeps unresolved episode history removable without advertising a broken Details action', () => {
        const item = {
            ...ITEMS[0],
            historyContentType: 'episode',
            contentType: 'series',
            coverDetailTarget: null,
        } as UnifiedCollectionItem;
        fixture.componentRef.setInput('mode', 'recent');
        fixture.componentRef.setInput('items', [item]);
        fixture.detectChanges();
        const card = fixture.debugElement.query(By.css('app-content-card'));
        const selected = jest.fn();
        const removed = jest.fn();
        fixture.componentInstance.itemSelected.subscribe(selected);
        fixture.componentInstance.removeItem.subscribe(removed);
        const activation = card.query(
            By.css('.content-card__activation')
        ).nativeElement;
        expect(activation.getAttribute('aria-disabled')).toBe('true');
        expect(activation.getAttribute('tabindex')).toBe('-1');
        activation.click();
        activation.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        );
        fixture.componentInstance.onCardClick(item);
        expect(selected).not.toHaveBeenCalled();
        card.query(
            By.css('[data-test-id="content-cover-actions"]')
        ).nativeElement.click();
        fixture.detectChanges();
        const menu = TestBed.inject(OverlayContainer).getContainerElement();
        expect(menu?.textContent).toContain('PORTALS.REMOVE_FROM_RECENT');
        expect(menu?.textContent).not.toContain('COVER.DETAILS');
        menu.querySelector<HTMLButtonElement>(
            '[data-test-id="content-cover-action-remove"]'
        )?.click();
        expect(removed).toHaveBeenCalledWith(item);
        fixture.componentInstance.onCardClick(ITEMS[0]);
        expect(selected).toHaveBeenCalledWith(ITEMS[0]);
    });

    it('tracks same-ID episode and parent-show history rows separately', () => {
        const show: UnifiedCollectionItem = {
            ...ITEMS[0],
            uid: 'xtream::portal::series:909',
            sourceType: 'xtream',
            playlistId: 'portal',
            contentType: 'series',
            xtreamId: 909,
            contentId: 101,
            historyContentType: 'series',
        };
        const episode: UnifiedCollectionItem = {
            ...show,
            contentId: 202,
            historyContentType: 'episode',
        };
        expect(fixture.componentInstance.trackByUid(0, episode)).not.toBe(
            fixture.componentInstance.trackByUid(1, show)
        );
        expect(episode.uid).toBe(show.uid);
        expect(episode.xtreamId).toBe(show.xtreamId);
    });

    it('keeps same-ID movies and series separate without changing live identity', () => {
        const movie = {
            ...ITEMS[0],
            uid: 'same',
            sourceType: 'stalker',
            playlistId: 'portal',
            stalkerId: '42',
        } as UnifiedCollectionItem;
        const series = {
            ...movie,
            contentType: 'series',
        } as UnifiedCollectionItem;
        const component = fixture.componentInstance;
        expect(component.trackByUid(0, movie)).not.toBe(
            component.trackByUid(1, series)
        );
        expect(component.trackByUid(0, { ...movie, contentType: 'live' })).toBe(
            'same'
        );
    });
});
