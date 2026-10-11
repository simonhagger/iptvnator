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

    it.each([
        [{ rating_imdb: '8.1' }, {}, 8.1, 'provider-imdb'],
        [{ rating_imdb: 'bad' }, { rating_imdb: '7.9' }, 7.9, 'provider-imdb'],
        [{ rating: '6.2' }, { rating_imdb: '8.3' }, 8.3, 'provider-imdb'],
        [
            { rating_kinopoisk: '8.2' },
            { rating_kinopoisk: '7.5' },
            8.2,
            'kinopoisk',
        ],
        [
            { rating_imdb: '0' },
            { rating_imdb: '', rating_kinopoisk: '7.5' },
            7.5,
            'kinopoisk',
        ],
        [{ rating: 'bad' }, { rating: '6.529' }, 6.529, 'provider'],
    ])(
        'resolves valid outer/detail score precedence: %p / %p',
        (outer, info, value, source) => {
            const item = Object.freeze({ ...outer, info: Object.freeze(info) });
            expect(resolveProviderCoverRating(item)).toEqual({
                value,
                scale: 10,
                source,
            });
            expect(item.info).toEqual(info);
        }
    );

    it.each([null, undefined, '8.2', 8.2, true, [{ rating_imdb: '8.2' }]])(
        'ignores malformed detail-info without changing valid outer scores: %p',
        (info) => {
            const item = { rating: '6.4', info };
            expect(resolveProviderCoverRating(item)).toEqual({
                value: 6.4,
                scale: 10,
                source: 'provider',
            });
            expect(
                resolveProviderCoverRating({ ...item, rating: 'bad' })
            ).toBeNull();
        }
    );

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
