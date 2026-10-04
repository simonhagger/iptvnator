import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import {
    SeriesQueueStartComponent,
    type SeriesQueueStartRequest,
} from './series-queue-start.component';

describe('show-page series queue entry point', () => {
    it('renders before playback and starts only the chosen season or remaining episodes', async () => {
        await TestBed.configureTestingModule({
            imports: [SeriesQueueStartComponent, TranslateModule.forRoot()],
        }).compileComponents();
        const fixture = TestBed.createComponent(SeriesQueueStartComponent);
        fixture.componentRef.setInput('seasons', {
            '1': [
                { id: 1, season: 1 },
                { id: 2, season: 1 },
            ],
            '2': [
                { id: 3, season: 2 },
                { id: 4, season: 2 },
            ],
        });
        fixture.detectChanges();
        expect(
            fixture.nativeElement.querySelector(
                '[data-testid="series-queue-start"]'
            )
        ).not.toBeNull();
        const requests: SeriesQueueStartRequest[] = [];
        fixture.componentInstance.requested.subscribe((request) =>
            requests.push(request)
        );
        fixture.componentInstance.selected.set(4);
        fixture.componentInstance.start(true);
        expect(requests[0].episode.id).toBe(3);
        expect(requests[0].ids).toEqual([3, 4]);
        fixture.componentInstance.selected.set(2);
        fixture.componentInstance.start(false);
        expect(requests[1].episode.id).toBe(2);
        expect(requests[1].ids).toEqual([2, 3, 4]);
        fixture.destroy();
    });
});
