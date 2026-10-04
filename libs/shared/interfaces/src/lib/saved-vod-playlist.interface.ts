/** Saved lists contain provider identities. Resolve credentials and URLs at playback time. */
export type SavedVodReference =
    | {
          readonly provider: 'xtream' | 'stalker';
          readonly sourceId: string;
          readonly kind: 'movie';
          readonly contentId: string;
      }
    | {
          readonly provider: 'xtream';
          readonly sourceId: string;
          readonly kind: 'episode';
          readonly contentId: string;
          readonly seriesId: string;
          readonly seasonNumber: number;
          readonly episodeNumber: number;
      }
    | {
          readonly provider: 'stalker';
          readonly sourceId: string;
          readonly kind: 'episode';
          readonly seriesId: string;
          readonly seriesMode: 'series' | 'vod-series';
          readonly seasonId: string;
          readonly seasonNumber: number;
          readonly episodeNumber: number;
      };

export interface SavedVodEntry {
    /** Unique occurrence, allowing an intentional second copy of the same content. */
    readonly id: string;
    readonly reference: SavedVodReference;
    readonly title: string;
    /** Expansion provenance, separate from the playback identity. */
    readonly groupId?: string;
}

/** Drafts have provider identities; persistence assigns each occurrence its ID. */
export type SavedVodCandidate = Omit<SavedVodEntry, 'id'>;

export interface SavedVodProgress {
    readonly entryId: string;
    readonly positionSeconds: number;
    readonly durationSeconds: number | null;
    readonly completed: boolean;
}

export interface SavedVodExecution {
    readonly id: string;
    /** Incremented on each transition, including Repeat One of the same occurrence. */
    readonly playbackRevision: number;
    /** Snapshot: editing the saved list never changes an already-started run. */
    readonly entries: readonly SavedVodEntry[];
    readonly currentEntryId: string | null;
    readonly progress: readonly SavedVodProgress[];
    readonly repeat: 'off' | 'one' | 'all';
    readonly mode: 'ordered' | 'shuffle';
    readonly updatedAt: string;
}

export interface SavedVodObservation {
    readonly executionId: string;
    readonly playbackRevision: number;
    readonly entryId: string;
}

export interface SavedVodPlaylist {
    readonly schemaVersion: 1;
    readonly id: string;
    readonly name: string;
    readonly revision: number;
    readonly entries: readonly SavedVodEntry[];
    readonly execution: SavedVodExecution | null;
    readonly createdAt: string;
    readonly updatedAt: string;
}

/** Expected revision makes a stale window's edit detectable rather than destructive. */
export type SavedVodWriteResult =
    | { status: 'saved'; playlist: SavedVodPlaylist }
    | { status: 'conflict'; current: SavedVodPlaylist | null };

export interface SavedVodPlaylistSummary {
    readonly id: string;
    readonly name: string;
    readonly revision: number;
    readonly entryCount: number;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export type SavedVodDeleteResult =
    | { status: 'deleted' }
    | { status: 'conflict'; current: SavedVodPlaylist | null };
