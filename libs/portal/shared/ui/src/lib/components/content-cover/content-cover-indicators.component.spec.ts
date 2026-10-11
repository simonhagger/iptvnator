import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import type {
    ContentCoverIndicators,
    ContentCoverRatingSource,
} from '@iptvnator/portal/shared/util';
import { ContentCoverIndicatorsComponent } from './content-cover-indicators.component';

describe('ContentCoverIndicatorsComponent', () => {
    let fixture: ComponentFixture<ContentCoverIndicatorsComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [
                ContentCoverIndicatorsComponent,
                NoopAnimationsModule,
                TranslateModule.forRoot(),
            ],
        }).compileComponents();
        const translate = TestBed.inject(TranslateService);
        translate.setTranslation('en', {
            COVER: {
                FAVORITE: 'Favorite',
                STARTED: 'Started',
                PROGRESS: 'Viewing progress',
                EPISODE_PROGRESS: 'Current episode progress',
                RATING_IMDB: 'Provider IMDb rating',
                RATING_PROVIDER: 'Provider rating',
                RATING_TMDB: 'TMDB rating',
                RATING_KINOPOISK: 'Kinopoisk rating',
            },
            PORTALS: { DETAIL: { WATCHED: 'Watched' } },
        });
        translate.use('en');
        fixture = TestBed.createComponent(ContentCoverIndicatorsComponent);
    });

    const element = () => fixture.nativeElement as HTMLElement;
    const status = (name: string) =>
        element().querySelector<HTMLElement>(
            `[data-test-id="content-cover-${name}"]`
        );
    const requiredStatus = (name: string) => {
        const result = status(name);
        if (!result) throw new Error(`Expected cover indicator: ${name}`);
        return result;
    };
    const render = (indicators: ContentCoverIndicators | null) => {
        fixture.componentRef.setInput('indicators', indicators);
        fixture.detectChanges();
    };

    it.each([
        ['provider-imdb', 'Provider IMDb rating'],
        ['provider', 'Provider rating'],
        ['tmdb', 'TMDB rating'],
        ['kinopoisk', 'Kinopoisk rating'],
    ] as const)(
        'attributes a one-decimal rating to %s without relabelling the source',
        (source, label) => {
            render({
                rating: {
                    value: 7.243,
                    scale: 10,
                    source: source as ContentCoverRatingSource,
                },
            });
            const rating = requiredStatus('rating');
            expect(rating.getAttribute('data-rating-source')).toBe(source);
            expect(rating.getAttribute('role')).toBe('img');
            expect(rating.getAttribute('aria-label')).toBe(`${label}: 7.2/10`);
            expect(rating.querySelector('span')?.textContent).toBe('7.2');
        }
    );

    it.each([
        null,
        {},
        {
            favorite: false,
            watchState: 'unwatched' as const,
            progress: 0,
            rating: {
                value: 0,
                scale: 10 as const,
                source: 'provider' as const,
            },
        },
    ])(
        'omits unknown or unstarted state rather than implying a rating or watched status',
        (indicators) => {
            render(indicators);
            expect(element().querySelector('[data-test-id]')).toBeNull();
            expect(
                element().querySelector('[role="img"],[role="progressbar"]')
            ).toBeNull();
        }
    );

    it('exposes favorite and partial progress as passive accessible state without adding tab stops', () => {
        render({ favorite: true, watchState: 'in-progress', progress: 40 });
        expect(status('favorite')?.getAttribute('aria-label')).toBe('Favorite');
        expect(status('watch')?.getAttribute('data-watch-state')).toBe(
            'in-progress'
        );
        expect(
            status('watch')
                ?.querySelector('[role="img"]')
                ?.getAttribute('aria-label')
        ).toBe('Started');
        const progress = requiredStatus('progress');
        expect(progress.getAttribute('role')).toBe('progressbar');
        expect(progress.getAttribute('aria-label')).toBe('Viewing progress');
        expect(progress.getAttribute('aria-valuenow')).toBe('40');
        expect(progress.getAttribute('aria-valuemin')).toBe('0');
        expect(progress.getAttribute('aria-valuemax')).toBe('100');
        expect(element().querySelector('button,a,input,[tabindex]')).toBeNull();
    });

    it('calls a completed episode Started and labels its progress without claiming the whole series is watched', () => {
        render({
            watchState: 'watched',
            progress: 100,
            progressScope: 'episode',
        });
        expect(status('watch')?.getAttribute('data-watch-state')).toBe(
            'in-progress'
        );
        expect(
            status('watch')
                ?.querySelector('[role="img"]')
                ?.getAttribute('aria-label')
        ).toBe('Started');
        expect(status('progress')?.getAttribute('aria-label')).toBe(
            'Current episode progress'
        );
        expect(status('progress')?.getAttribute('aria-valuenow')).toBe('100');
        expect(
            element().querySelector('.progress-capsule--watched')
        ).toBeNull();
    });

    it('shows one Watched status for a completed title instead of an additional progress bar', () => {
        render({
            watchState: 'watched',
            progress: 100,
            progressScope: 'title',
        });
        expect(status('watch')?.getAttribute('data-watch-state')).toBe(
            'watched'
        );
        expect(
            status('watch')
                ?.querySelector('[role="img"]')
                ?.getAttribute('aria-label')
        ).toBe('Watched');
        expect(status('progress')).toBeNull();
    });

    it('provides a translated referenced description for named cover activation surfaces', () => {
        fixture.componentRef.setInput(
            'descriptionId',
            'cover-description-test'
        );
        render({
            favorite: true,
            watchState: 'in-progress',
            progress: 40,
            rating: { value: 7.243, scale: 10, source: 'provider-imdb' },
        });
        const description = element().querySelector<HTMLElement>(
            '#cover-description-test'
        );
        expect(description?.hidden).toBe(true);
        expect(description?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
            'Favorite. Started. Provider IMDb rating: 7.2/10. Viewing progress: 40%.'
        );
        render({
            favorite: true,
            watchState: 'watched',
            progress: 100,
            progressScope: 'episode',
        });
        expect(description?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
            'Favorite. Started. Current episode progress: 100%.'
        );
        render(null);
        expect(description?.textContent?.trim()).toBe('');
    });

    it('clears previous indicators when a reused cover receives unknown metadata', () => {
        render({
            favorite: true,
            watchState: 'watched',
            rating: { value: 8.8, scale: 10, source: 'tmdb' },
        });
        expect(status('favorite')).not.toBeNull();
        expect(status('watch')).not.toBeNull();
        expect(status('rating')).not.toBeNull();
        render(null);
        expect(element().querySelector('[data-test-id]')).toBeNull();
    });
});
