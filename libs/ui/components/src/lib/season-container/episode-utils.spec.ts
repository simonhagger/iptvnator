import {
    episodeRuntimeSeconds,
    formatEpisodePositionText,
    formatEpisodeSubline,
    parseDuration,
} from './episode-progress.util';

describe('episodeRuntimeSeconds', () => {
    it('prefers the provider seconds over the formatted string', () => {
        expect(episodeRuntimeSeconds({ duration_secs: 2520 })).toBe(2520);
        expect(
            episodeRuntimeSeconds({ duration_secs: 2520, duration: '00:10:00' })
        ).toBe(2520);
        expect(episodeRuntimeSeconds({ duration: '00:42:00' })).toBe(2520);
        expect(
            episodeRuntimeSeconds({ duration_secs: 0, duration: '00:42:00' })
        ).toBe(2520);
        expect(episodeRuntimeSeconds(undefined)).toBe(0);
    });
});

describe('episode subline presentation', () => {
    const translate = (key: string, params?: Record<string, number>) => {
        if (key === 'PORTALS.DETAIL.DURATION_MINUTES')
            return `${params?.['minutes']} min`;
        if (key === 'WORKSPACE.DASHBOARD.REMAINING_MINUTES')
            return `${params?.['minutes']}m left`;
        if (key === 'PORTALS.DETAIL.WATCHED') return 'watched';
        return key;
    };

    it('keeps runtime and remaining time together without displaying a watched marker', () => {
        expect(
            formatEpisodeSubline(
                { duration: '42 min' },
                {
                    contentXtreamId: 1,
                    contentType: 'episode',
                    positionSeconds: 1440,
                    durationSeconds: 2520,
                },
                translate
            )
        ).toBe('42 min · 18m left');
    });

    it('replaces remaining time with watched at the completion threshold', () => {
        expect(
            formatEpisodeSubline(
                { duration_secs: 2520 },
                {
                    contentXtreamId: 1,
                    contentType: 'episode',
                    positionSeconds: 2510,
                    durationSeconds: 2520,
                },
                translate
            )
        ).toBe('42 min · watched');
    });

    it('keeps elapsed time when the provider has no runtime and omits an empty subline', () => {
        expect(
            formatEpisodeSubline(
                undefined,
                {
                    contentXtreamId: 1,
                    contentType: 'episode',
                    positionSeconds: 61,
                },
                translate
            )
        ).toBe('01:01');
        expect(
            formatEpisodeSubline(undefined, undefined, translate)
        ).toBeNull();
    });
});

describe('episode-progress.util', () => {
    it('parses duration strings', () => {
        expect(parseDuration('01:00:30')).toBe(3630);
        expect(parseDuration('45:12')).toBe(2712);
        // Stalker VOD episodes report minute strings; Xtream fixtures
        // report compound hour/minute strings.
        expect(parseDuration('45 min')).toBe(2700);
        expect(parseDuration('1h 30min')).toBe(5400);
        expect(parseDuration('2h 05min')).toBe(7500);
        expect(parseDuration(120)).toBe(120);
        expect(parseDuration(undefined)).toBe(0);
    });

    it('formats remaining time when duration is known', () => {
        expect(
            formatEpisodePositionText({
                contentXtreamId: 1,
                contentType: 'episode',
                positionSeconds: 60,
                durationSeconds: 360,
            })
        ).toBe('05:00 left');
    });

    it('returns null for watched or missing positions', () => {
        expect(formatEpisodePositionText(undefined)).toBeNull();
        expect(
            formatEpisodePositionText({
                contentXtreamId: 1,
                contentType: 'episode',
                positionSeconds: 350,
                durationSeconds: 360,
            })
        ).toBeNull();
    });
});
