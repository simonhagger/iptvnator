import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { SavedVodEntry } from '@iptvnator/shared/interfaces';
import { SavedVodEntryRowComponent } from './saved-vod-entry-row.component';

const movie: SavedVodEntry = {
    id: 'occurrence-1',
    title: 'Evening film',
    reference: {
        provider: 'xtream',
        sourceId: 'source',
        kind: 'movie',
        contentId: '42',
    },
};

describe('saved VOD entry row controls', () => {
    let fixture: ComponentFixture<SavedVodEntryRowComponent>;
    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [SavedVodEntryRowComponent],
        }).compileComponents();
        fixture = TestBed.createComponent(SavedVodEntryRowComponent);
        fixture.componentRef.setInput('entry', movie);
        fixture.componentRef.setInput('index', 1);
        fixture.componentRef.setInput('count', 3);
        fixture.componentRef.setInput('sourceName', 'Home library');
        fixture.componentRef.setInput('labels', {
            movie: 'Movie',
            episode: 'Episode',
            moveUp: 'Move up',
            moveDown: 'Move down',
            remove: 'Remove',
        });
        fixture.detectChanges();
    });
    const button = (id: string): HTMLButtonElement =>
        fixture.nativeElement.querySelector(
            `[data-test-id="saved-vod-entry-${id}"]`
        );

    it('offers accessible keyboard buttons and emits the occurrence identity', () => {
        const move = jest.fn();
        const remove = jest.fn();
        fixture.componentInstance.moveRequested.subscribe(move);
        fixture.componentInstance.removeRequested.subscribe(remove);
        expect(button('up').getAttribute('aria-label')).toBe(
            'Move up: Evening film'
        );
        button('up').click();
        button('down').click();
        button('remove').click();
        expect(move.mock.calls).toEqual([
            [{ entryId: movie.id, targetIndex: 0 }],
            [{ entryId: movie.id, targetIndex: 2 }],
        ]);
        expect(remove).toHaveBeenCalledWith(movie.id);
    });

    it('disables boundary movements and all edits during persistence', () => {
        fixture.componentRef.setInput('index', 0);
        fixture.detectChanges();
        expect(button('up').disabled).toBe(true);
        expect(button('down').disabled).toBe(false);
        fixture.componentRef.setInput('index', 2);
        fixture.detectChanges();
        expect(button('down').disabled).toBe(true);
        fixture.componentRef.setInput('disabled', true);
        fixture.detectChanges();
        const move = jest.fn();
        const remove = jest.fn();
        fixture.componentInstance.moveRequested.subscribe(move);
        fixture.componentInstance.removeRequested.subscribe(remove);
        for (const id of ['up', 'down', 'remove']) {
            expect(button(id).disabled).toBe(true);
            button(id).click();
        }
        expect(move).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
    });

    it('shows episode coordinates and the resolved source without stream details', () => {
        fixture.componentRef.setInput('entry', {
            ...movie,
            reference: {
                provider: 'stalker',
                sourceId: 'source',
                kind: 'episode',
                seriesId: 'show',
                seasonId: 'season',
                seriesMode: 'series',
                seasonNumber: 2,
                episodeNumber: 4,
            },
        });
        fixture.detectChanges();
        const text = fixture.nativeElement.textContent;
        expect(text).toContain('Episode');
        expect(text).toContain('S2 · E4');
        expect(text).toContain('Home library');
        expect(fixture.nativeElement.getAttribute('data-entry-id')).toBe(
            movie.id
        );
    });
});
