import { DestroyRef, inject, Injectable, Signal, signal } from '@angular/core';
import {
    CollectionContentType,
    CollectionScope,
    UnifiedCollectionItem,
    PORTAL_PLAYBACK_POSITIONS,
    contentCoverIdentity,
    collectionRowIdentity,
} from '@iptvnator/portal/shared/util';
import { projectCollectionCovers } from './collection-cover-projection';
import { createCollectionReloadIndicator } from './collection-reload-indicator';
import { UnifiedFavoritesDataService } from './unified-favorites-data.service';
import { UnifiedRecentDataService } from './unified-recent-data.service';
import { ContentCoverDataService } from './content-cover-data.service';

export type CollectionMode = 'favorites' | 'recent';

export interface CollectionLoadRequest {
    scope: CollectionScope;
    playlistId?: string;
    portalType?: string;
}

/**
 * Reads and writes the rows of one unified collection (a favorites or a
 * recently-viewed list) and owns their loading state. Not `providedIn:
 * 'root'`: `UnifiedCollectionPageComponent` provides it, so every mounted
 * page has its own; the page itself keeps only the view concerns on top of
 * this.
 */
@Injectable()
export class UnifiedCollectionDataService {
    private readonly favoritesData = inject(UnifiedFavoritesDataService);
    private readonly recentData = inject(UnifiedRecentDataService);
    private readonly covers = inject(ContentCoverDataService);
    readonly pendingFavoriteKeys = this.covers.pendingFavoriteKeys;
    readonly favoriteFailed = this.covers.failed;
    private readonly playbackPositions = inject(PORTAL_PLAYBACK_POSITIONS, {
        optional: true,
    });
    private readonly destroyRef = inject(DestroyRef);
    private readonly reloadIndicator = createCollectionReloadIndicator(
        inject(DestroyRef)
    );

    /** First load with nothing on screen: the skeleton replaces the content. */
    readonly isLoading = signal(true);
    /**
     * A reload (scope switch, favorites reload) is in flight while the
     * previous items stay mounted. Never swaps to the skeleton, so a playing
     * channel and the focused toggle survive.
     */
    readonly isReloading = this.reloadIndicator.active;
    /** `isReloading` past its grace period: progress bar + dimming render. */
    readonly showReloadIndicator = this.reloadIndicator.visible;
    readonly allItems = signal<UnifiedCollectionItem[]>([]);
    readonly favoriteUidSet = signal<ReadonlySet<string>>(new Set<string>());

    private readonly request = signal<CollectionLoadRequest | null>(null);
    /**
     * The request that produced `allItems`. Actions on displayed rows (Clear,
     * drag reorder) must use it, not the scope toggle's current value: during
     * a reload the toggle already names the requested scope while the
     * previous rows are still on screen, and "This playlist" against global
     * rows would delete other playlists' favorites or write foreign URLs into
     * this playlist.
     */
    readonly loadedRequest: Signal<CollectionLoadRequest | null> =
        this.request.asReadonly();

    private requestId = 0;
    constructor() {
        this.destroyRef.onDestroy(() => ++this.requestId);
    }

    /**
     * Replace the collection with the rows the request resolves to. Returns
     * the loaded rows, or `null` when the load was superseded by a newer one
     * or failed — in both cases the caller must not post-process it.
     */
    async load(
        params: CollectionLoadRequest & { mode: CollectionMode }
    ): Promise<UnifiedCollectionItem[] | null> {
        const requestId = ++this.requestId;
        if (this.allItems().length === 0) {
            this.isLoading.set(true);
        } else {
            this.reloadIndicator.begin();
        }

        try {
            const items =
                params.mode === 'favorites'
                    ? await this.favoritesData.getFavorites(
                          params.scope,
                          params.playlistId,
                          params.portalType
                      )
                    : await this.recentData.getRecentItems(
                          params.scope,
                          params.playlistId,
                          params.portalType
                      );
            if (requestId !== this.requestId || this.destroyRef.destroyed)
                return null;
            const hasVod = items.some((item) => item.contentType !== 'live');
            if (params.mode === 'recent' && hasVod)
                await this.covers.load(params);
            else void this.covers.load(null);
            if (requestId !== this.requestId || this.destroyRef.destroyed)
                return null;
            const favorites =
                params.mode === 'favorites'
                    ? items
                    : hasVod
                      ? this.covers.knownFavorites()
                      : await this.loadFavoriteItems(params);
            const projected = hasVod
                ? await projectCollectionCovers(
                      items,
                      favorites,
                      this.playbackPositions,
                      params.mode === 'recent' ? 'history' : 'catalog'
                  )
                : items;
            if (requestId !== this.requestId) {
                return null;
            }
            this.allItems.set(projected);
            this.request.set({
                scope: params.scope,
                playlistId: params.playlistId,
                portalType: params.portalType,
            });
            this.favoriteUidSet.set(
                new Set(favorites?.map((item) => item.uid))
            );
            // A mounted row may have changed membership while watch positions
            // were loading. Publish the current persisted cover snapshot.
            if (params.mode === 'recent' && hasVod)
                this.refreshCoverFavorites();
            return this.allItems();
        } catch {
            if (requestId !== this.requestId) {
                return null;
            }
            this.allItems.set([]);
            return null;
        } finally {
            if (requestId === this.requestId) {
                this.isLoading.set(false);
                this.reloadIndicator.settle();
            }
        }
    }

    async removeItem(
        mode: CollectionMode,
        item: UnifiedCollectionItem
    ): Promise<void> {
        const requestId = this.requestId;
        if (mode === 'favorites') {
            await this.favoritesData.removeFavorite(item);
        } else {
            await this.recentData.removeRecentItem(item);
        }
        if (requestId !== this.requestId || this.destroyRef.destroyed) return;
        const identity =
            mode === 'recent' ? collectionRowIdentity : contentCoverIdentity;
        const key = identity(item);
        const remaining = this.allItems().filter((candidate) =>
            item.contentType === 'live'
                ? candidate.uid !== item.uid
                : identity(candidate) !== key
        );
        this.allItems.set(remaining);
        if (
            mode === 'favorites' &&
            !remaining.some((candidate) => candidate.uid === item.uid)
        )
            this.favoriteUidSet.update(
                (current) =>
                    new Set([...current].filter((uid) => uid !== item.uid))
            );
    }

    async toggleFavorite(item: UnifiedCollectionItem): Promise<void> {
        const requestId = this.requestId;
        if (item.contentType !== 'live') {
            const target =
                item.coverFavoriteTarget === undefined
                    ? item
                    : item.coverFavoriteTarget;
            if (!target) return;
            await this.covers.toggleFavorite(target);
            if (requestId === this.requestId && !this.destroyRef.destroyed)
                this.refreshCoverFavorites();
            return;
        }
        const nextFavoriteUids = new Set(this.favoriteUidSet());

        if (nextFavoriteUids.has(item.uid)) {
            await this.favoritesData.removeFavorite(item);
            nextFavoriteUids.delete(item.uid);
        } else {
            await this.favoritesData.addFavorite(item);
            nextFavoriteUids.add(item.uid);
        }

        if (requestId !== this.requestId) return;
        this.favoriteUidSet.set(nextFavoriteUids);
    }

    async retryFavorites(): Promise<void> {
        const requestId = this.requestId;
        await this.covers.retry();
        if (requestId === this.requestId && !this.destroyRef.destroyed)
            this.refreshCoverFavorites();
    }

    private refreshCoverFavorites(): void {
        const favorites = this.covers.knownFavorites();
        if (favorites)
            this.favoriteUidSet.set(new Set(favorites.map((item) => item.uid)));
        this.allItems.update((items) =>
            items.map((candidate) =>
                candidate.contentType !== 'live' &&
                candidate.sourceType !== 'm3u'
                    ? {
                          ...candidate,
                          coverIndicators: {
                              ...candidate.coverIndicators,
                              favorite:
                                  candidate.coverFavoriteTarget === null
                                      ? undefined
                                      : this.covers.favoriteFor(
                                            candidate.coverFavoriteTarget ??
                                                candidate
                                        ),
                          },
                      }
                    : candidate
            )
        );
    }

    async reorder(
        items: UnifiedCollectionItem[],
        request: CollectionLoadRequest
    ): Promise<void> {
        const nonLive = this.allItems().filter((i) => i.contentType !== 'live');
        this.allItems.set([...items, ...nonLive]);
        await this.favoritesData.reorder(items, request);
    }

    /** Drop every row of one type from the list, without persisting. */
    dropContentType(contentType: CollectionContentType): void {
        this.allItems.update((items) =>
            items.filter((item) => item.contentType !== contentType)
        );
    }

    clearFavorites(items: UnifiedCollectionItem[]): Promise<void> {
        return this.favoritesData.clearFavorites(items);
    }

    removeRecentItemsBatch(items: UnifiedCollectionItem[]): void {
        void this.recentData.removeRecentItemsBatch(items);
    }

    /** Move a just-played item back to the head of the recent list. */
    promoteRecentItem(item: UnifiedCollectionItem): void {
        this.allItems.update((items) => {
            const nextItems = [
                item,
                ...items.filter((candidate) => candidate.uid !== item.uid),
            ];
            return nextItems.sort(
                (a, b) =>
                    new Date(b.viewedAt ?? 0).getTime() -
                    new Date(a.viewedAt ?? 0).getTime()
            );
        });
    }

    private async loadFavoriteItems(
        params: CollectionLoadRequest
    ): Promise<UnifiedCollectionItem[] | undefined> {
        try {
            const favorites = await this.favoritesData.getFavorites(
                params.scope,
                params.playlistId,
                params.portalType
            );
            return favorites;
        } catch {
            return undefined;
        }
    }
}
