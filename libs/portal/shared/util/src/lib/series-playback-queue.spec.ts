import {
    clearSeriesQueue,
    emptySeriesQueue,
    enqueueSeriesEpisode,
    moveSeriesQueueEpisode,
    removeSeriesQueueEpisode,
    seriesQueueFromHere,
    syncSeriesQueue,
} from './series-playback-queue';

describe('series playback queue policy', () => {
    const initial = () => seriesQueueFromHere([1, 2, 3, 4], 1);
    it('seeds the remaining catalogue and advances past the new current episode', () => {
        expect(syncSeriesQueue(initial(), [1, 2, 3, 4], 2).upcoming).toEqual([
            3, 4,
        ]);
    });
    it('play next promotes an existing entry without duplicating it', () => {
        const state = initial();
        expect(enqueueSeriesEpisode(state, 4, 'next').upcoming).toEqual([
            4, 2, 3,
        ]);
        expect(state.upcoming).toEqual([2, 3, 4]);
    });
    it('add to queue appends and de-duplicates', () => {
        expect(enqueueSeriesEpisode(initial(), 2, 'last').upcoming).toEqual([
            3, 4, 2,
        ]);
    });
    it('ignores the current episode and malformed IDs', () => {
        const state = initial();
        for (const id of [1, NaN, Infinity, -1, 0])
            expect(enqueueSeriesEpisode(state, id, 'next')).toBe(state);
    });
    it('preserves explicit edits after an episode transition', () => {
        const edited = enqueueSeriesEpisode(initial(), 4, 'next');
        expect(syncSeriesQueue(edited, [1, 2, 3, 4, 5], 4).upcoming).toEqual([
            2, 3,
        ]);
    });
    it('keeps a cleared queue empty as the catalogue changes', () => {
        expect(
            syncSeriesQueue(clearSeriesQueue(initial()), [1, 2, 3, 4, 5], 1)
                .upcoming
        ).toEqual([]);
    });
    it('removes an item and moves by one position without mutating input', () => {
        const state = initial();
        expect(moveSeriesQueueEpisode(state, 3, -1).upcoming).toEqual([
            3, 2, 4,
        ]);
        expect(removeSeriesQueueEpisode(state, 3).upcoming).toEqual([2, 4]);
        expect(moveSeriesQueueEpisode(state, 2, -1)).toBe(state);
        expect(moveSeriesQueueEpisode(state, 4, 1)).toBe(state);
    });
    it('resets when current is missing and filters invalid/duplicate catalogue IDs', () => {
        expect(syncSeriesQueue(initial(), [2, 3], 1)).toEqual(
            emptySeriesQueue()
        );
        expect(seriesQueueFromHere([1, 2, 2, NaN, 3], 1).upcoming).toEqual([
            2, 3,
        ]);
    });
});
