import {
    isPortalPlaybackWatched,
    parseDurationSeconds,
    formatDurationLabel,
    formatRemainingLabel,
} from '@iptvnator/portal/shared/util';
import { PlaybackPositionData } from '@iptvnator/shared/interfaces';

/** Pure helpers for episode duration parsing and progress-text formatting. */

export function parseDuration(duration: string | number | undefined): number {
    return parseDurationSeconds(duration);
}

/**
 * Human-readable in-progress text ("41:12 left" / elapsed time when the
 * duration is unknown). Returns null for watched or position-less episodes.
 */
export function formatEpisodePositionText(
    position: PlaybackPositionData | undefined
): string | null {
    if (isPortalPlaybackWatched(position)) {
        return null;
    }

    if (!position || !position.positionSeconds) {
        return null;
    }

    let seconds = position.positionSeconds;
    let suffix = '';

    if (position.durationSeconds && position.durationSeconds > 0) {
        const remaining = Math.max(
            0,
            position.durationSeconds - position.positionSeconds
        );

        if (remaining <= 0) {
            return null;
        }

        seconds = remaining;
        suffix = ' left';
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const formatted = [hours, minutes, secs]
        .map((value) => String(value).padStart(2, '0'))
        .filter((value, index) => (index === 0 ? value !== '00' : true))
        .join(':');
    return `${formatted}${suffix}`;
}

/** The episode runtime: the provider's `duration_secs` first, then its formatted `duration`. */
export function episodeRuntimeSeconds(
    info: { duration_secs?: number; duration?: string } | null | undefined
): number {
    const seconds = Number(info?.duration_secs);
    return Number.isFinite(seconds) && seconds > 0
        ? Math.floor(seconds)
        : parseDuration(info?.duration);
}

/** Receives translation rather than depending on a renderer or Angular service. */
export function formatEpisodeSubline(
    info: { duration_secs?: number; duration?: string } | null | undefined,
    position: PlaybackPositionData | undefined,
    translate: (key: string, params?: Record<string, number>) => string
): string | null {
    const duration = formatDurationLabel(episodeRuntimeSeconds(info));
    const remaining = formatRemainingLabel(position);
    const parts = [
        duration ? translate(duration.key, duration.params) : null,
        isPortalPlaybackWatched(position)
            ? translate('PORTALS.DETAIL.WATCHED')
            : remaining
              ? translate(remaining.key, remaining.params)
              : formatEpisodePositionText(position),
    ].filter((part): part is string => !!part);
    return parts.length ? parts.join(' · ') : null;
}
