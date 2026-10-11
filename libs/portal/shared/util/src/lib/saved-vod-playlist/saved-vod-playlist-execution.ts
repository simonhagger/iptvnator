import type {
    SavedVodExecution,
    SavedVodObservation,
    SavedVodPlaylist,
    SavedVodProgress,
} from '@iptvnator/shared/interfaces';

export interface SavedVodStartOptions {
    id: string;
    updatedAt: string;
    repeat?: SavedVodExecution['repeat'];
    /** Caller supplies a shuffled permutation; this function never draws randomness. */
    order?: readonly string[];
}

/** Restarting a list creates a fresh run without altering global watch history. */
export function startSavedVodExecution(
    playlist: SavedVodPlaylist,
    options: SavedVodStartOptions
): SavedVodExecution {
    const byId = new Map(playlist.entries.map((entry) => [entry.id, entry]));
    const order = options.order ?? playlist.entries.map((entry) => entry.id);
    if (
        byId.size !== playlist.entries.length ||
        order.length !== byId.size ||
        new Set(order).size !== byId.size ||
        order.some((id) => !byId.has(id))
    ) {
        throw new Error(
            'Saved playlist order must contain each occurrence exactly once'
        );
    }
    const entries = order.map((id) => {
        const entry = byId.get(id);
        if (!entry) throw new Error('Unknown saved occurrence');
        return { ...entry, reference: { ...entry.reference } };
    });
    return {
        id: options.id,
        playbackRevision: 1,
        entries,
        currentEntryId: entries[0]?.id ?? null,
        progress: [],
        repeat: options.repeat ?? 'off',
        mode: options.order ? 'shuffle' : 'ordered',
        updatedAt: options.updatedAt,
    };
}

export function recordSavedVodProgress(
    execution: SavedVodExecution,
    observation: SavedVodObservation,
    positionSeconds: number,
    durationSeconds: number | null,
    updatedAt: string
): SavedVodExecution {
    // Late events from a player replaced by Next cannot rewind another occurrence.
    if (
        !isCurrentObservation(execution, observation) ||
        !Number.isFinite(positionSeconds) ||
        positionSeconds < 0
    )
        return execution;
    const entryId = observation.entryId;
    const duration =
        durationSeconds !== null &&
        Number.isFinite(durationSeconds) &&
        durationSeconds > 0
            ? durationSeconds
            : null;
    const progress: SavedVodProgress = {
        entryId,
        positionSeconds:
            duration === null
                ? positionSeconds
                : Math.min(positionSeconds, duration),
        durationSeconds: duration,
        completed: false,
    };
    return {
        ...execution,
        progress: [
            ...execution.progress.filter((item) => item.entryId !== entryId),
            progress,
        ],
        updatedAt,
    };
}

/** Completion belongs to the observed occurrence, so stale end events are harmless. */
export function advanceSavedVodExecution(
    execution: SavedVodExecution,
    observation: SavedVodObservation,
    updatedAt: string,
    reason: 'ended' | 'skip' = 'ended'
): SavedVodExecution {
    if (!isCurrentObservation(execution, observation)) return execution;
    const observedEntryId = observation.entryId;
    const index = execution.entries.findIndex(
        (entry) => entry.id === observedEntryId
    );
    if (index < 0) return execution;
    const previous = execution.progress.find(
        (item) => item.entryId === observedEntryId
    );
    const completed: SavedVodProgress = {
        entryId: observedEntryId,
        positionSeconds: previous?.positionSeconds ?? 0,
        durationSeconds: previous?.durationSeconds ?? null,
        completed: reason === 'ended' || (previous?.completed ?? false),
    };
    const nextIndex =
        reason === 'ended' && execution.repeat === 'one'
            ? index
            : index + 1 < execution.entries.length
              ? index + 1
              : execution.repeat === 'all'
                ? 0
                : -1;
    return {
        ...execution,
        playbackRevision: execution.playbackRevision + 1,
        currentEntryId: execution.entries[nextIndex]?.id ?? null,
        progress: [
            ...execution.progress.filter(
                (item) => item.entryId !== observedEntryId
            ),
            completed,
        ],
        updatedAt,
    };
}

export function savedVodResumePosition(execution: SavedVodExecution): number {
    const progress = execution.progress.find(
        (item) => item.entryId === execution.currentEntryId
    );
    return progress && !progress.completed ? progress.positionSeconds : 0;
}

function isCurrentObservation(
    execution: SavedVodExecution,
    observation: SavedVodObservation
): boolean {
    return (
        observation.executionId === execution.id &&
        observation.playbackRevision === execution.playbackRevision &&
        observation.entryId === execution.currentEntryId
    );
}
