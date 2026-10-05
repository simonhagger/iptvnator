import { normalizeSavedVodCandidates } from '@iptvnator/shared/interfaces/saved-vod-validation';
import type {
    SavedVodCandidate,
    XtreamSerieEpisode,
} from '@iptvnator/shared/interfaces';

interface MovieCandidateInput {
    readonly provider: 'xtream' | 'stalker';
    readonly sourceId: unknown;
    readonly contentId: unknown;
    readonly title: unknown;
}

interface XtreamEpisodeCandidateInput {
    readonly sourceId: unknown;
    readonly seriesId: unknown;
    readonly episode: Pick<
        XtreamSerieEpisode,
        'id' | 'season' | 'episode_num' | 'title'
    >;
}

interface StalkerEpisodeCandidateInput {
    readonly sourceId: unknown;
    readonly seriesId: unknown;
    /** Catalog origin: embedded and lazy VOD both use 'vod-series'. */
    readonly seriesMode: 'series' | 'vod-series';
    /** Raw provider season VM ID, never its display key or a tracking hash. */
    readonly seasonId: unknown;
    readonly seasonNumber: unknown;
    readonly episodeNumber: unknown;
    readonly title: unknown;
}

function providerId(value: unknown, positive = false): string | null {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && (!positive || value > 0)
            ? String(value)
            : null;
    }
    return typeof value === 'string' && (!positive || !/^0+$/.test(value))
        ? value
        : null;
}

function coordinate(value: unknown, minimum: number): number | null {
    const parsed =
        typeof value === 'number'
            ? value
            : typeof value === 'string' && /^\d+$/.test(value)
              ? Number(value)
              : null;
    return parsed !== null && Number.isSafeInteger(parsed) && parsed >= minimum
        ? parsed
        : null;
}

function candidate(value: unknown): SavedVodCandidate | null {
    try {
        return normalizeSavedVodCandidates([value])[0];
    } catch {
        return null;
    }
}

/** Only provider identities and a display title enter a saved draft. */
export function createSavedVodMovieCandidate(
    input: MovieCandidateInput
): SavedVodCandidate | null {
    return candidate({
        title: input.title,
        reference: {
            provider: input.provider,
            sourceId: input.sourceId,
            kind: 'movie',
            contentId: providerId(input.contentId, input.provider === 'xtream'),
        },
    });
}

export function createSavedVodXtreamEpisodeCandidate(
    input: XtreamEpisodeCandidateInput
): SavedVodCandidate | null {
    return candidate({
        title: input.episode?.title,
        reference: {
            provider: 'xtream',
            sourceId: input.sourceId,
            kind: 'episode',
            seriesId: providerId(input.seriesId, true),
            contentId: providerId(input.episode?.id, true),
            seasonNumber: coordinate(input.episode?.season, 0),
            episodeNumber: coordinate(input.episode?.episode_num, 1),
        },
    });
}

/** Transport mode, commands and generated tracking IDs are never persisted. */
export function createSavedVodStalkerEpisodeCandidate(
    input: StalkerEpisodeCandidateInput
): SavedVodCandidate | null {
    return candidate({
        title: input.title,
        reference: {
            provider: 'stalker',
            sourceId: input.sourceId,
            kind: 'episode',
            seriesId: providerId(input.seriesId),
            seriesMode: input.seriesMode,
            seasonId: providerId(input.seasonId),
            seasonNumber: coordinate(input.seasonNumber, 0),
            episodeNumber: coordinate(input.episodeNumber, 1),
        },
    });
}
