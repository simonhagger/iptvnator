export interface SeriesQueueState {
    current: number | null;
    upcoming: readonly number[];
    custom: boolean;
}

export interface SeriesQueueLaunchEvent {
    revision: number;
    phase: 'requested' | 'confirmed' | 'failed';
}

export const emptySeriesQueue = (): SeriesQueueState => ({
    current: null,
    upcoming: [],
    custom: false,
});

const validIds = (ids: readonly number[]): number[] => [
    ...new Set(ids.filter((id) => Number.isFinite(id) && id > 0)),
];

/** Automatic ordering follows the loaded catalogue; edits make it explicit. */
export function syncSeriesQueue(
    state: SeriesQueueState,
    catalogue: readonly number[],
    current: number
): SeriesQueueState {
    const ids = validIds(catalogue);
    if (!ids.includes(current)) return emptySeriesQueue();
    return {
        current,
        custom: state.custom,
        upcoming: state.custom
            ? state.upcoming.filter((id) => id !== current && ids.includes(id))
            : ids.slice(ids.indexOf(current) + 1),
    };
}

export function enqueueSeriesEpisode(
    state: SeriesQueueState,
    id: number,
    placement: 'next' | 'last'
): SeriesQueueState {
    if (!Number.isFinite(id) || id <= 0 || id === state.current) return state;
    const remaining = state.upcoming.filter((value) => value !== id);
    return {
        ...state,
        custom: true,
        upcoming:
            placement === 'next' ? [id, ...remaining] : [...remaining, id],
    };
}

export function removeSeriesQueueEpisode(
    state: SeriesQueueState,
    id: number
): SeriesQueueState {
    return {
        ...state,
        custom: true,
        upcoming: state.upcoming.filter((value) => value !== id),
    };
}

export function moveSeriesQueueEpisode(
    state: SeriesQueueState,
    id: number,
    direction: -1 | 1
): SeriesQueueState {
    const index = state.upcoming.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= state.upcoming.length)
        return state;
    const upcoming = [...state.upcoming];
    [upcoming[index], upcoming[target]] = [upcoming[target], upcoming[index]];
    return { ...state, upcoming, custom: true };
}

export function seriesQueueFromHere(
    catalogue: readonly number[],
    id: number
): SeriesQueueState {
    return syncSeriesQueue(emptySeriesQueue(), catalogue, id);
}

export function clearSeriesQueue(state: SeriesQueueState): SeriesQueueState {
    return { ...state, upcoming: [], custom: true };
}
