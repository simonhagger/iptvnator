import {
    normalizeContentCoverIndicators,
    normalizeContentCoverRating,
    resolveProviderCoverRating,
} from './content-cover';

describe('content cover presentation policy', () => {
    it.each([
        undefined,
        null,
        '',
        ' ',
        '7.2/10',
        '7.2junk',
        'NaN',
        true,
        [],
        {},
        NaN,
        Infinity,
        -1,
        0,
        10.1,
    ])('withholds invalid or unrated scores: %p', (value) => {
        expect(normalizeContentCoverRating(value, 'provider')).toBeNull();
    });

    it('retains score precision and provider-supplied attribution', () => {
        expect(
            resolveProviderCoverRating({
                rating_imdb: '7.243',
                rating: '6.529',
            })
        ).toEqual({ value: 7.243, scale: 10, source: 'provider-imdb' });
        expect(
            resolveProviderCoverRating({ rating_imdb: '', rating: '6.529' })
        ).toEqual({ value: 6.529, scale: 10, source: 'provider' });
        expect(
            resolveProviderCoverRating({ rating_kinopoisk: '8.2', rating: 7 })
        ).toEqual({ value: 8.2, scale: 10, source: 'kinopoisk' });
        expect(normalizeContentCoverRating(10, 'tmdb')).toEqual({
            value: 10,
            scale: 10,
            source: 'tmdb',
        });
    });

    it('does not infer completion from progress or missing state', () => {
        expect(
            normalizeContentCoverIndicators({ progress: 100 }).watchState
        ).toBeUndefined();
        expect(
            normalizeContentCoverIndicators({
                watchState: 'in-progress',
                progress: 40,
            })
        ).toMatchObject({ watchState: 'in-progress', progress: 40 });
    });

    it('never marks a series watched from a completed episode', () => {
        expect(
            normalizeContentCoverIndicators({
                progressScope: 'episode',
                watchState: 'watched',
                progress: 100,
            })
        ).toMatchObject({
            progressScope: 'episode',
            watchState: 'in-progress',
            progress: 100,
        });
        expect(
            normalizeContentCoverIndicators({
                progressScope: 'title',
                watchState: 'watched',
                progress: 95,
            }).watchState
        ).toBe('watched');
    });

    it('sanitises presentation without mutating current library data', () => {
        const original = Object.freeze({ favorite: true, progress: Infinity });
        expect(normalizeContentCoverIndicators(original)).toMatchObject({
            favorite: true,
            progress: null,
        });
        expect(original.progress).toBe(Infinity);
        expect(
            normalizeContentCoverIndicators({ progress: 150 }).progress
        ).toBe(100);
        expect(
            normalizeContentCoverIndicators({ progress: -5 }).progress
        ).toBeNull();
    });
});
