import {
    DestroyRef,
    Injectable,
    computed,
    inject,
    signal,
} from '@angular/core';
import {
    CollectionScope,
    ContentCoverAction,
    UnifiedCollectionItem,
    contentCoverIdentity,
    buildProviderCoverItem,
    ProviderCoverContext,
    ContentCoverIndicators,
    resolveProviderCoverRating,
    PORTAL_PLAYBACK_POSITIONS,
    collectionCoverIndicators,
} from '@iptvnator/portal/shared/util';
import type { PlaybackPositionData } from '@iptvnator/shared/interfaces';
import { UnifiedFavoritesDataService } from './unified-favorites-data.service';

export interface CoverFavoriteScope {
    readonly scope: CollectionScope;
    readonly playlistId?: string;
    readonly portalType?: string;
}

/** One bulk read per mounted surface; presentation never fetches per card. */
@Injectable()
export class ContentCoverDataService {
    private readonly favorites = inject(UnifiedFavoritesDataService);
    private readonly destroyRef = inject(DestroyRef);
    private readonly playbackPositions = inject(PORTAL_PLAYBACK_POSITIONS, {
        optional: true,
    });
    private readonly positions = signal<
        ReadonlyMap<string, PlaybackPositionData[]>
    >(new Map());
    private watchGeneration = 0;
    private watchRepresentation = 0;
    private readonly representedWatchIds = new Set<string>();
    private readonly requestedWatchIds = new Set<string>();
    private readonly watchRequests = new Map<string, object>();
    private readonly failedWatchIds = signal<ReadonlySet<string>>(new Set());
    readonly watchReadFailed = computed(() => this.failedWatchIds().size > 0);
    private readonly rows = signal<ReadonlyMap<
        string,
        UnifiedCollectionItem
    > | null>(null);
    private readonly pending = signal<ReadonlySet<string>>(new Set());
    readonly pendingFavoriteKeys = this.pending.asReadonly();
    readonly knownFavorites = computed(() => {
        const rows = this.rows();
        return rows ? [...rows.values()] : undefined;
    });
    private generation = 0;
    private failedSnapshotGeneration: number | null = null;
    private mutations: Promise<void> = Promise.resolve();
    private scope: CoverFavoriteScope | null = null;
    private readonly failureState = signal(false);
    readonly failed = this.failureState.asReadonly();
    readonly coverReadFailed = computed(
        () => this.failed() || this.watchReadFailed()
    );
    readonly failureMessageKey = computed(() =>
        this.watchReadFailed()
            ? 'COVER.PROGRESS_FAILED'
            : 'COVER.FAVORITES_FAILED'
    );

    constructor() {
        this.destroyRef.onDestroy(() => {
            ++this.generation;
            ++this.watchGeneration;
            this.scope = null;
            this.failedWatchIds.set(new Set());
        });
    }

    async load(scope: CoverFavoriteScope | null): Promise<void> {
        const generation = ++this.generation;
        this.scope = scope;
        ++this.watchGeneration;
        ++this.watchRepresentation;
        this.representedWatchIds.clear();
        this.requestedWatchIds.clear();
        this.watchRequests.clear();
        this.failedWatchIds.set(new Set());
        this.positions.set(new Map());
        this.rows.set(null);
        this.failureState.set(false);
        if (!scope) return;
        try {
            // A return from detail may request the same scope while its last
            // click is still saving. Read only after those writes settle.
            await this.mutations;
            if (generation !== this.generation || this.destroyRef.destroyed)
                return;
            const rows = await this.favorites.getFavoritesStrict(
                scope.scope,
                scope.playlistId,
                scope.portalType
            );
            if (generation === this.generation && !this.destroyRef.destroyed) {
                this.rows.set(
                    new Map(rows.map((row) => [contentCoverIdentity(row), row]))
                );
            }
        } catch {
            if (generation === this.generation && !this.destroyRef.destroyed)
                this.failureState.set(true);
        }
    }

    /** Hosts supply the represented source IDs once; callbacks never initiate reads. */
    async loadWatchPositions(playlistIds: readonly string[]): Promise<void> {
        const repository = this.playbackPositions;
        if (!repository || !this.scope) return;
        const generation = this.watchGeneration;
        ++this.watchRepresentation;
        const represented = [...new Set(playlistIds)].filter(
            (id) =>
                id &&
                (this.scope?.scope === 'all' || id === this.scope?.playlistId)
        );
        const removed = [...this.representedWatchIds].filter(
            (id) => !represented.includes(id)
        );
        for (const id of removed) {
            this.requestedWatchIds.delete(id);
            this.watchRequests.delete(id);
        }
        if (removed.length)
            this.positions.update(
                (rows) =>
                    new Map([...rows].filter(([id]) => !removed.includes(id)))
            );
        this.representedWatchIds.clear();
        represented.forEach((id) => this.representedWatchIds.add(id));
        this.failedWatchIds.update(
            (ids) => new Set([...ids].filter((id) => represented.includes(id)))
        );
        const ids = represented.filter((id) => !this.requestedWatchIds.has(id));
        ids.forEach((id) => this.requestedWatchIds.add(id));
        await Promise.all(
            ids.map(async (id) => {
                const request = {};
                this.watchRequests.set(id, request);
                const isCurrent = () =>
                    generation === this.watchGeneration &&
                    this.watchRequests.get(id) === request &&
                    this.representedWatchIds.has(id) &&
                    !this.destroyRef.destroyed;
                try {
                    const rows = await repository.getAllPlaybackPositions(id);
                    if (isCurrent()) {
                        this.positions.update(
                            (current) => new Map([...current, [id, rows]])
                        );
                        this.failedWatchIds.update(
                            (ids) =>
                                new Set(
                                    [...ids].filter((failed) => failed !== id)
                                )
                        );
                    }
                } catch {
                    if (isCurrent()) {
                        this.requestedWatchIds.delete(id);
                        this.failedWatchIds.update(
                            (ids) => new Set([...ids, id])
                        );
                    }
                }
            })
        );
    }

    async retry(): Promise<void> {
        const scope = this.scope;
        if (!scope || this.destroyRef.destroyed) return;
        const playlistIds = [...this.representedWatchIds];
        const generation = this.generation + 1;
        const representation = this.watchRepresentation + 1;
        await this.load(scope);
        if (
            this.generation === generation &&
            this.watchRepresentation === representation &&
            this.scope === scope &&
            !this.destroyRef.destroyed
        )
            await this.loadWatchPositions(playlistIds);
    }

    favoriteFor(item: UnifiedCollectionItem | null): boolean | undefined {
        const rows = this.rows();
        const scope = this.scope;
        const belongs =
            scope &&
            (scope.scope === 'all' ||
                (item?.playlistId === scope.playlistId &&
                    (!scope.portalType ||
                        item?.sourceType === scope.portalType)));
        return item && rows && belongs
            ? rows.has(contentCoverIdentity(item))
            : undefined;
    }

    actionsForProvider(
        context: ProviderCoverContext | null,
        row: object
    ): readonly ContentCoverAction[] {
        if (
            !context ||
            !['vod', 'movie', 'series'].includes(context.contentType)
        )
            return [];
        return this.actionsFor(
            context
                ? buildProviderCoverItem(
                      context,
                      row as Record<string, unknown>
                  )
                : null
        );
    }
    identityForProvider(
        context: ProviderCoverContext | null,
        row: object
    ): string | object {
        const item = context
            ? buildProviderCoverItem(context, row as Record<string, unknown>)
            : null;
        return item ? contentCoverIdentity(item) : row;
    }

    indicatorsForProvider(
        context: ProviderCoverContext | null,
        row: object
    ): ContentCoverIndicators {
        if (
            !context ||
            !['vod', 'movie', 'series'].includes(context.contentType)
        )
            return {};
        const raw = row as Record<string, unknown>;
        const item = buildProviderCoverItem(context, raw);
        return item
            ? {
                  ...collectionCoverIndicators(
                      item,
                      this.positions().get(item.playlistId),
                      this.favoriteFor(item)
                  ),
                  rating: resolveProviderCoverRating(raw),
              }
            : { rating: resolveProviderCoverRating(raw) };
    }

    onProviderAction(
        context: ProviderCoverContext | null,
        row: object,
        action: ContentCoverAction
    ): void {
        if (action.id === 'favorite' && context) {
            void this.toggleFavorite(
                buildProviderCoverItem(context, row as Record<string, unknown>)
            );
        }
    }

    actionsFor(
        item: UnifiedCollectionItem | null
    ): readonly ContentCoverAction[] {
        const actions: ContentCoverAction[] = [
            { id: 'details', icon: 'info', labelKey: 'COVER.DETAILS' },
        ];
        const favorite = this.favoriteFor(item);
        if (item && favorite !== undefined) {
            actions.push({
                id: 'favorite',
                icon: favorite ? 'favorite' : 'favorite_border',
                labelKey: favorite
                    ? 'PORTALS.REMOVE_FROM_FAVORITES'
                    : 'PORTALS.ADD_TO_FAVORITES',
                disabled: this.pending().has(contentCoverIdentity(item)),
            });
        }
        return actions;
    }

    async toggleFavorite(item: UnifiedCollectionItem | null): Promise<void> {
        if (!item || this.favoriteFor(item) === undefined || !this.scope)
            return;
        const key = contentCoverIdentity(item);
        if (this.pending().has(key)) return;
        const generation = this.generation;
        const scope = this.scope;
        const stored = this.rows()?.get(key);
        this.pending.update((pending) => new Set([...pending, key]));
        this.failureState.set(false);
        const mutation = this.mutations.then(() =>
            this.applyMutation(item, stored, scope, generation, key)
        );
        this.mutations = mutation;
        await mutation;
    }

    private async applyMutation(
        item: UnifiedCollectionItem,
        capturedStored: UnifiedCollectionItem | undefined,
        scope: CoverFavoriteScope,
        generation: number,
        key: string
    ): Promise<void> {
        let persisted = false;
        try {
            const current = this.rows();
            if (this.failedSnapshotGeneration === generation) return;
            // Capture the desired membership at click time. A newer snapshot
            // can enrich a removal target, but cannot turn Add into Remove.
            const removalTarget = capturedStored
                ? ((generation === this.generation
                      ? current?.get(key)
                      : undefined) ?? capturedStored)
                : undefined;
            if (removalTarget)
                await this.favorites.removeFavorite(removalTarget);
            else await this.favorites.addFavorite(item);
            persisted = true;
            // A write may be a no-op when the provider row cannot be resolved.
            // Show what was persisted, not an optimistic membership claim.
            const rows = await this.favorites.getFavoritesStrict(
                scope.scope,
                scope.playlistId,
                scope.portalType
            );
            if (generation === this.generation && !this.destroyRef.destroyed) {
                this.rows.set(
                    new Map(rows.map((row) => [contentCoverIdentity(row), row]))
                );
            }
        } catch {
            if (persisted) this.failedSnapshotGeneration = generation;
            if (generation === this.generation && !this.destroyRef.destroyed) {
                if (persisted) this.rows.set(null);
                this.failureState.set(true);
            }
        } finally {
            if (!this.destroyRef.destroyed) {
                this.pending.update(
                    (pending) =>
                        new Set(
                            [...pending].filter(
                                (candidate) => candidate !== key
                            )
                        )
                );
            }
        }
    }
}
