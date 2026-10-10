import { buildDashboardFavoriteTarget } from './dashboard-favorite-target';
import type {
    PortalActivityItem,
    PlaybackPositionData,
} from '@iptvnator/shared/interfaces';
const item: PortalActivityItem = {
    id: 22,
    xtream_id: 909,
    title: 'Episode',
    source: 'xtream',
    type: 'series',
    playlist_id: 'a',
    category_id: 4,
};
const position: PlaybackPositionData = {
    playlistId: 'a',
    contentType: 'episode',
    contentXtreamId: 909,
    seriesXtreamId: 900,
    positionSeconds: 40,
    durationSeconds: 100,
};
describe('Dashboard favourite targets', () => {
    it('does not invent a provider for unscoped or live rows', () => {
        expect(
            buildDashboardFavoriteTarget({ ...item, source: undefined })
        ).toBeNull();
        expect(
            buildDashboardFavoriteTarget({ ...item, type: 'live' })
        ).toBeNull();
    });
    it.each([900, 909])(
        'clears episode storage ownership even when parent ID%s coincides',
        (seriesXtreamId) => {
            const raw = Object.freeze({
                ...item,
                historyContentType: 'episode' as const,
            });
            expect(
                buildDashboardFavoriteTarget(raw, 'history', {
                    ...position,
                    seriesXtreamId,
                })
            ).toMatchObject({ xtreamId: seriesXtreamId, contentId: undefined });
            expect(raw.id).toBe(22);
            expect(raw.xtream_id).toBe(909);
        }
    );
    it('withholds explicit unresolved episode favourites and rejects another playlist position', () => {
        const raw = { ...item, historyContentType: 'episode' as const };
        expect(buildDashboardFavoriteTarget(raw, 'history')).toBeNull();
        expect(
            buildDashboardFavoriteTarget(raw, 'history', {
                ...position,
                playlistId: 'b',
            })
        ).toBeNull();
    });
    it('keeps catalogue and legacy history ownership distinct', () => {
        expect(buildDashboardFavoriteTarget(item)).toMatchObject({
            xtreamId: 909,
            contentId: 22,
        });
        expect(
            buildDashboardFavoriteTarget(item, 'history', position)
        ).toMatchObject({ xtreamId: 900, contentId: undefined });
        expect(
            buildDashboardFavoriteTarget(item, 'history', {
                ...position,
                contentXtreamId: 42,
                seriesXtreamId: 909,
            })
        ).toMatchObject({ xtreamId: 909, contentId: undefined });
    });
});
