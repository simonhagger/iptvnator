import {
    categoryContentCoverIndicators,
    categorySortLabelKey,
} from './category-content-presentation';

describe('catalogue cover presentation', () => {
    it('retains provider episode progress and truthful rating attribution for embedded series', () => {
        expect(
            categoryContentCoverIndicators(
                { series: ['episode'], rating_kinopoisk: '8.5' },
                { watchState: 'in-progress', progress: 100 },
                'stalker',
                'vod',
                undefined
            )
        ).toMatchObject({
            watchState: 'in-progress',
            progress: 100,
            progressScope: 'episode',
            favorite: undefined,
            rating: { value: 8.5, source: 'kinopoisk' },
        });
    });

    it('preserves unknown watch state and scopes ordinary movie progress to the title', () => {
        const result = categoryContentCoverIndicators(
            { rating: 'N/A' },
            {},
            'xtream',
            'vod',
            false
        );
        expect(result).toEqual({
            favorite: false,
            rating: null,
            progressScope: 'title',
        });
    });

    it('retains rating sort and custom fallback labels', () => {
        expect(categorySortLabelKey('rating-desc')).toBe(
            'WORKSPACE.SORT_TOP_RATED'
        );
        expect(categorySortLabelKey('rating-asc')).toBe(
            'WORKSPACE.SORT_LOWEST_RATED'
        );
        expect(categorySortLabelKey(null)).toBe('WORKSPACE.SORT_CUSTOM');
    });
});
