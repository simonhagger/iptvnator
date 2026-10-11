import type {
    SavedVodEntry,
    SavedVodReference,
} from '@iptvnator/shared/interfaces';

/** Nonpersisted planning contract; provider adapters supply normalized identities. */
export type SavedVodGroupSource =
    | {
          readonly provider: 'xtream';
          readonly sourceId: string;
          readonly seriesId: string;
      }
    | {
          readonly provider: 'stalker';
          readonly sourceId: string;
          readonly seriesId: string;
          readonly seriesMode: 'series' | 'vod-series';
      };
interface SavedVodGroupLabel {
    readonly id: string;
    readonly title: string;
}
export type SavedVodGroupDescriptor = SavedVodGroupLabel &
    (
        | {
              readonly source: Extract<
                  SavedVodGroupSource,
                  { provider: 'xtream' }
              >;
              readonly scope:
                  | { readonly kind: 'series' }
                  | { readonly kind: 'season'; readonly seasonNumber: number };
          }
        | {
              readonly source: Extract<
                  SavedVodGroupSource,
                  { provider: 'stalker' }
              >;
              readonly scope:
                  | { readonly kind: 'series' }
                  | {
                        readonly kind: 'season';
                        readonly seasonNumber: number;
                        readonly seasonId: string;
                    };
          }
    );
export interface SavedVodExpansionMetadata {
    readonly title: string;
    readonly reference: SavedVodReference;
}
export interface SavedVodExpansionInput {
    readonly metadata: readonly SavedVodExpansionMetadata[];
    /** Consumed in canonical episode order, only for newly added occurrences. */
    readonly occurrenceIds: readonly string[];
    readonly capturedAt: string;
    readonly sequence: number;
    /** Remaining list capacity excluding the group being explicitly refreshed. */
    readonly availableSlots: number;
    /** New IDs may not collide with these IDs, or any old group occurrence. */
    readonly reservedOccurrenceIds?: ReadonlySet<string>;
}
export interface SavedVodGroupSnapshot {
    readonly group: SavedVodGroupDescriptor;
    readonly capturedAt: string;
    readonly sequence: number;
    readonly allowDuplicates: boolean;
    readonly entries: readonly SavedVodEntry[];
}
export interface SavedVodGroupRefreshPreview {
    readonly snapshot: SavedVodGroupSnapshot;
    readonly addedReferences: readonly SavedVodReference[];
    readonly removedReferences: readonly SavedVodReference[];
    /** Additions/removals alone do not count as reordering retained occurrences. */
    readonly retainedOrderChanged: boolean;
}
