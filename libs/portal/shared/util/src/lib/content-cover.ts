import type { PortalWatchState } from './portal-watch-state';

export type ContentCoverRatingSource =
    'provider-imdb' | 'provider' | 'tmdb' | 'kinopoisk';

/** Attribution describes the supplied field, not independent score verification. */
export interface ContentCoverRating {
    readonly value: number;
    readonly scale: 10;
    readonly source: ContentCoverRatingSource;
}

export interface ContentCoverIndicators {
    readonly favorite?: boolean;
    readonly watchState?: PortalWatchState;
    readonly progress?: number | null;
    /** A series card can show an episode's progress without claiming show completion. */
    readonly progressScope?: 'title' | 'episode';
    readonly rating?: ContentCoverRating | null;
}

export interface ContentCoverAction {
    readonly id: string;
    readonly labelKey?: string;
    readonly label?: string;
    readonly icon: string;
    readonly destructive?: boolean;
    readonly disabled?: boolean;
    readonly separatorBefore?: boolean;
    /** Marks a membership command for the direct heart toggle; never history removal. */
    readonly favoriteState?: boolean;
}

export function resolveContentCoverFavoriteAction(
    actions: readonly ContentCoverAction[]
): ContentCoverAction | undefined {
    return actions.find((action) => typeof action.favoriteState === 'boolean');
}

const RATING_SOURCES: ReadonlySet<string> = new Set([
    'provider-imdb',
    'provider',
    'tmdb',
    'kinopoisk',
]);

/** Strict finite scores on the documented ten-point scale; zero means unrated. */
export function normalizeContentCoverRating(
    value: unknown,
    source: ContentCoverRatingSource
): ContentCoverRating | null {
    if (!RATING_SOURCES.has(source)) return null;
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const numeric = typeof value === 'string' ? Number(value.trim()) : value;
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 10) return null;
    return { value: numeric, scale: 10, source };
}

/** Valid IMDb, Kinopoisk, then generic scores; outer wins within each source. */
export function resolveProviderCoverRating(item: {
    rating_imdb?: unknown;
    rating_kinopoisk?: unknown;
    rating?: unknown;
    info?: unknown;
}): ContentCoverRating | null {
    const info =
        item.info && typeof item.info === 'object' && !Array.isArray(item.info)
            ? (item.info as Record<string, unknown>)
            : {};
    return (
        normalizeContentCoverRating(item.rating_imdb, 'provider-imdb') ??
        normalizeContentCoverRating(info['rating_imdb'], 'provider-imdb') ??
        normalizeContentCoverRating(item.rating_kinopoisk, 'kinopoisk') ??
        normalizeContentCoverRating(info['rating_kinopoisk'], 'kinopoisk') ??
        normalizeContentCoverRating(item.rating, 'provider') ??
        normalizeContentCoverRating(info['rating'], 'provider')
    );
}

/** Presentation sanitisation only; completion decisions stay in the watch policy. */
export function normalizeContentCoverIndicators(
    indicators: ContentCoverIndicators | null | undefined
): ContentCoverIndicators {
    if (!indicators) return {};
    const progress = indicators.progress;
    const rating = indicators.rating;
    const state = indicators.watchState;
    return {
        favorite: indicators.favorite === true,
        watchState:
            indicators.progressScope === 'episode' && state === 'watched'
                ? 'in-progress'
                : ['watched', 'in-progress', 'unwatched'].includes(state ?? '')
                  ? state
                  : undefined,
        progress:
            typeof progress === 'number' &&
            Number.isFinite(progress) &&
            progress > 0
                ? Math.min(100, progress)
                : null,
        progressScope:
            indicators.progressScope === 'episode' ? 'episode' : 'title',
        rating:
            rating?.scale === 10
                ? normalizeContentCoverRating(rating.value, rating.source)
                : null,
    };
}
