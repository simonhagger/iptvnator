import { signal } from '@angular/core';
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
