import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SeriesQueueComponent } from './series-queue.component';
import type { UpNextRailItem } from './up-next-rail.util';

const items: UpNextRailItem[] = [1, 2, 3, 4].map((id) => ({
    id,
    label: `S0${id < 3 ? 1 : 2}E01`,
    seasonNumber: id < 3 ? 1 : 2,
    title: `Episode ${id}`,
    thumbnailUrl: null,
    progressPercent: null,
    isPlaying: id === 1,
    episode: { id },
}));

describe('series queue surface', () => {
    let fixture: ComponentFixture<SeriesQueueComponent>;
    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [SeriesQueueComponent, TranslateModule.forRoot()],
        }).compileComponents();
        fixture = TestBed.createComponent(SeriesQueueComponent);
        fixture.componentRef.setInput('items', items);
        fixture.componentRef.setInput('scope', 'playlist:series');
        fixture.detectChanges();
    });
    afterEach(() => fixture.destroy());
    it('shows a queue on a narrow stage without depending on the side rail', () => {
        fixture.componentInstance.expanded.set(true);
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelectorAll('.series-queue__row')
        ).toHaveLength(3);
    });
    it('play next promotes the chosen episode and delegates its original provider object', () => {
        const component = fixture.componentInstance;
        const selected: UpNextRailItem[] = [];
        component.playRequested.subscribe((item) => selected.push(item));
        component.selected.set(4);
        component.enqueue('next');
        component.next();
        expect(selected).toEqual([items[3]]);
    });
    it('play season queues only the selected season', () => {
        const component = fixture.componentInstance;
        const selected: UpNextRailItem[] = [];
        component.playRequested.subscribe((item) => selected.push(item));
        component.selected.set(4);
        component.fromHere(true);
        expect(selected).toEqual([items[2]]);
        fixture.componentRef.setInput(
            'items',
            items.map((item) => ({
                ...item,
                isPlaying: item.id === 3,
            }))
        );
        fixture.detectChanges();
        expect(component.queue.state().upcoming).toEqual([4]);
    });
    it('play from here uses the selected episode and enables continuation', () => {
        const component = fixture.componentInstance;
        component.queue.setAutoplay(false);
        component.selected.set(3);
        component.fromHere();
        expect(component.queue.autoplay()).toBe(true);
        fixture.componentRef.setInput(
            'items',
            items.map((item) => ({
                ...item,
                isPlaying: item.id === 3,
            }))
        );
        fixture.detectChanges();
        expect(component.queue.state().upcoming).toEqual([4]);
    });
    it('updates the current item without restoring removed episodes', () => {
        const component = fixture.componentInstance;
        component.queue.remove(3);
        fixture.componentRef.setInput(
            'items',
            items.map((item) => ({ ...item, isPlaying: item.id === 2 }))
        );
        fixture.detectChanges();
        expect(component.queue.state().upcoming).toEqual([4]);
    });

    it('applies a fresh season selection when the surface is reused for another series', () => {
        fixture.componentRef.setInput('initialQueue', [1, 2]);
        fixture.detectChanges();
        expect(fixture.componentInstance.queue.state().upcoming).toEqual([2]);
        fixture.componentRef.setInput('scope', 'playlist:another-series');
        fixture.componentRef.setInput('initialQueue', [1, 3]);
        fixture.detectChanges();
        expect(fixture.componentInstance.queue.state().upcoming).toEqual([3]);
    });

    it('retries Next after a provider reports a failed launch', () => {
        const component = fixture.componentInstance;
        const play = jest.fn();
        component.playRequested.subscribe(play);
        component.next();
        fixture.componentRef.setInput('launch', {
            revision: 1,
            phase: 'failed',
        });
        fixture.detectChanges();
        component.next();
        expect(play).toHaveBeenCalledTimes(2);
    });

    it('ignores a stale initial queue containing episodes outside the loaded series', () => {
        fixture.componentRef.setInput('initialQueue', [1, 99]);
        fixture.detectChanges();
        expect(fixture.componentInstance.queue.state().upcoming).toEqual([
            2, 3, 4,
        ]);
    });
});
