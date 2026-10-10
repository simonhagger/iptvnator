import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ContentCoverDataService } from '@iptvnator/portal/shared/data-access';
import { buildDashboardFavoriteTarget } from './dashboard-favorite-target';
import { PlaylistRefreshActionService } from '@iptvnator/playlist/shared/ui';
import { DialogService } from '@iptvnator/ui/components';
import {
    PlaylistDeleteActionService,
    RuntimeCapabilitiesService,
    SettingsStore,
} from '@iptvnator/services';
import { WORKSPACE_SHELL_ACTIONS } from '@iptvnator/workspace/shell/util';
import {
    DEFAULT_DASHBOARD_RAILS_SETTINGS,
    CatalogTitleMatch,
    PlaybackPositionData,
} from '@iptvnator/shared/interfaces';
import {
    DashboardDataService,
    GlobalRecentItem,
    DashboardFavoriteItem,
    DashboardTrendingItem,
    DashboardRecommendationItem,
    DashboardRecommendationsService,
    DashboardTrendingService,
    DashboardSourceExpiryService,
} from '@iptvnator/workspace/dashboard/data-access';
import { DashboardLiveEpgPresenter } from './dashboard-live-epg.presenter';
import { WorkspaceDashboardRailsComponent } from './workspace-dashboard-rails.component';

describe('Dashboard cover projection', () => {
    const favorite: DashboardFavoriteItem = {
        id: 7,
        xtream_id: 7,
        title: 'Series seven',
        type: 'series',
        playlist_id: 'portal',
        category_id: 1,
        source: 'xtream',
        added_at: '',
    };
    const match = (
        playlistId = 'only-tmdb',
        xtreamId = 7
    ): CatalogTitleMatch => ({
        playlistId,
        playlistName: 'Portal',
        xtreamId,
        categoryId: 1,
        type: 'series',
        queryTitle: 'Series seven',
        trailingYear: null,
    });
    const trending = (matched = match()): DashboardTrendingItem => ({
        tmdbId: 1,
        mediaType: 'tv',
        title: 'Series seven',
        year: null,
        posterUrl: null,
        rating: '8',
        popularity: 1,
        match: matched,
    });
    const recommended = (matched = match()): DashboardRecommendationItem => ({
        ...trending(matched),
        match: matched,
        originalTitle: null,
        seedTitle: 'Seed',
    });

    function setup() {
        const recent = signal<GlobalRecentItem[]>([
            { ...favorite, viewed_at: '' },
        ]);
        const favorites = signal<DashboardFavoriteItem[]>([favorite]);
        const membership = signal<DashboardFavoriteItem[]>([favorite]);
        const added = signal([{ ...favorite }]);
        const trendingItems = signal<DashboardTrendingItem[]>([]);
        const recommendations = signal<DashboardRecommendationItem[]>([]);
        const playlistsReady = signal(true);
        const favoritesReady = signal(true);
        const positionsReady = signal(true);
        const episode = {
            playlistId: 'portal',
            contentXtreamId: 7,
            seriesXtreamId: 99,
            contentType: 'episode' as const,
            positionSeconds: 40,
            durationSeconds: 100,
        };
        const data = {
            playlists: signal([]),
            playlistsLoaded: playlistsReady,
            dashboardReady: signal(true),
            xtreamPlaylistCount: signal(0),
            globalFavoritesLoaded: favoritesReady,
            globalFavoritesLoading: signal(false),
            globalRecentLoading: signal(false),
            xtreamRecentlyAddedLoading: signal(false),
            recentPlaylists: signal([]),
            globalRecentVodItems: recent,
            globalFavoriteItems: favorites,
            globalFavoriteMembership: membership,
            xtreamRecentlyAddedItems: added,
            globalFavoriteLiveItems: signal([]),
            globalRecentLiveItems: signal([]),
            reloadGlobalRecentItems: jest.fn(),
            reloadGlobalFavorites: jest.fn(),
            reloadPlaybackPositions: jest.fn(),
            getPlaybackPositionForItem: jest.fn(
                (_item, scope?: string): PlaybackPositionData | null =>
                    scope === 'catalog' ? null : episode
            ),
            hasLoadedPlaybackPositions: () => positionsReady(),
            getRecentItemLink: () => ['/recent'],
            getRecentItemDetailNavigationState: () => undefined,
            getRecentItemResumeNavigation: () => null,
            getGlobalFavoriteLink: () => ['/favorites'],
            getGlobalFavoriteNavigationState: () => undefined,
            getRecentlyAddedLink: () => ['/added'],
            getRecentlyAddedNavigationState: () => undefined,
        };
        const known = signal(true);
        const pending = signal(false);
        const coverFavorites = {
            load: jest.fn(),
            failed: signal(false),
            retry: jest.fn(),
            favoriteFor: (
                target: ReturnType<typeof buildDashboardFavoriteTarget>
            ) =>
                target && known()
                    ? membership().some(
                          (item) =>
                              item.source === target.sourceType &&
                              item.playlist_id === target.playlistId &&
                              item.type === target.contentType &&
                              String(item.xtream_id) ===
                                  String(target.xtreamId ?? target.stalkerId)
                      )
                    : undefined,
            actionsFor(
                target: ReturnType<typeof buildDashboardFavoriteTarget>
            ) {
                const favoriteState = this.favoriteFor(target);
                return favoriteState === undefined
                    ? []
                    : [
                          {
                              id: 'favorite',
                              icon: 'favorite',
                              favoriteState,
                              disabled: pending(),
                          },
                      ];
            },
            toggleFavorite: jest.fn().mockResolvedValue(undefined),
        };
        TestBed.configureTestingModule({
            providers: [
                { provide: ContentCoverDataService, useValue: coverFavorites },
                { provide: DashboardDataService, useValue: data },
                {
                    provide: DashboardLiveEpgPresenter,
                    useValue: {
                        connect: jest.fn(),
                        enrich: (cards: unknown[]) => cards,
                    },
                },
                ...[
                    MatDialog,
                    MatSnackBar,
                    Router,
                    Store,
                    DialogService,
                    PlaylistDeleteActionService,
                    PlaylistRefreshActionService,
                    WORKSPACE_SHELL_ACTIONS,
                ].map((provide) => ({ provide, useValue: {} })),
                {
                    provide: TranslateService,
                    useValue: {
                        onLangChange: of(null),
                        instant: (key: string) => key,
                    },
                },
                {
                    provide: RuntimeCapabilitiesService,
                    useValue: { isElectron: true },
                },
                {
                    provide: SettingsStore,
                    useValue: {
                        dashboardRails: signal({
                            ...DEFAULT_DASHBOARD_RAILS_SETTINGS,
                            recentSources: false,
                            tmdbTrending: true,
                            tmdbRecommendations: true,
                        }),
                    },
                },
                {
                    provide: DashboardSourceExpiryService,
                    useValue: { facts: signal(new Map()) },
                },
                {
                    provide: DashboardTrendingService,
                    useValue: {
                        isAvailable: true,
                        items: trendingItems,
                        loading: signal(false),
                        load: jest.fn(),
                    },
                },
                {
                    provide: DashboardRecommendationsService,
                    useValue: {
                        isAvailable: true,
                        items: recommendations,
                        loading: signal(false),
                        seedTitles: signal([]),
                        load: jest.fn(),
                    },
                },
            ],
        });
        const component = TestBed.runInInjectionContext(
            () => new WorkspaceDashboardRailsComponent()
        );
        return {
            component,
            data,
            recent,
            favorites,
            membership,
            added,
            trendingItems,
            recommendations,
            coverFavorites,
            known,
            pending,
            playlistsReady,
            favoritesReady,
            positionsReady,
        };
    }

    it('uses parent-only catalog lookup across favourite, added and matched covers, preserving history lookup', () => {
        const { component, trendingItems, recommendations } = setup();
        trendingItems.set([trending(match('portal'))]);
        recommendations.set([recommended(match('portal'))]);
        expect(
            component.continueWatchingCards()[0].indicators?.watchState
        ).toBe('in-progress');
        for (const card of [
            component.favoriteMoviesAndSeriesCards()[0],
            component.xtreamRecentlyAddedCards()[0],
            component.trendingCards()[0],
            component.recommendationCards()[0],
        ]) {
            expect(card.indicators?.watchState).toBe('unwatched');
            expect(card.indicators?.progress).toBeNull();
        }
    });

    it('loads strict command membership only after initial sources are ready and refreshes meaningful membership changes', () => {
        const { coverFavorites, playlistsReady, favoritesReady, membership } =
            setup();
        playlistsReady.set(false);
        favoritesReady.set(false);
        TestBed.tick();
        expect(coverFavorites.load).not.toHaveBeenCalled();
        playlistsReady.set(true);
        TestBed.tick();
        expect(coverFavorites.load).not.toHaveBeenCalled();
        favoritesReady.set(true);
        TestBed.tick();
        expect(coverFavorites.load).toHaveBeenCalledTimes(1);
        membership.set([
            { ...favorite, title: 'Same identity, updated title' },
        ]);
        TestBed.tick();
        expect(coverFavorites.load).toHaveBeenCalledTimes(1);
        membership.set([{ ...favorite, xtream_id: 99 }]);
        TestBed.tick();
        expect(coverFavorites.load).toHaveBeenCalledTimes(2);
    });

    it('offers ready semantic hearts for Recent and Recently Added using parent ownership', () => {
        const { component, recent, added, membership, data } = setup();
        recent.set([
            {
                ...favorite,
                xtream_id: 909,
                historyContentType: 'episode',
                viewed_at: '',
            },
        ]);
        added.set([{ ...favorite, xtream_id: 909 }]);
        membership.set([{ ...favorite, xtream_id: 900 }]);
        data.getPlaybackPositionForItem.mockReturnValue({
            playlistId: 'portal',
            contentXtreamId: 909,
            seriesXtreamId: 900,
            contentType: 'episode',
            positionSeconds: 40,
            durationSeconds: 100,
        });
        expect(
            component
                .continueWatchingCards()[0]
                .actions?.find((action) => action.id === 'favorite')
        ).toMatchObject({ favoriteState: true });
        expect(
            component
                .xtreamRecentlyAddedCards()[0]
                .actions?.find((action) => action.id === 'favorite')
        ).toMatchObject({ favoriteState: false });
    });

    it('routes a Recent heart through the existing controller with parent identity, not history storage', async () => {
        const { component, recent, data, coverFavorites, known, pending } =
            setup();
        recent.set([
            {
                ...favorite,
                xtream_id: 909,
                historyContentType: 'episode',
                viewed_at: '',
            },
        ]);
        data.getPlaybackPositionForItem.mockReturnValue({
            playlistId: 'portal',
            contentXtreamId: 909,
            seriesXtreamId: 909,
            contentType: 'episode',
            positionSeconds: 40,
            durationSeconds: 100,
        });
        const card = component.continueWatchingCards()[0];
        const action = card.actions?.find(
            (candidate) => candidate.id === 'favorite'
        );
        if (!action) throw new Error('Expected ready heart');
        component.onContinueWatchingActionSelected({ card, action });
        await Promise.resolve();
        expect(coverFavorites.toggleFavorite).toHaveBeenCalledWith(
            expect.objectContaining({
                xtreamId: 909,
                contentId: undefined,
                playlistId: 'portal',
                contentType: 'series',
            })
        );
        expect(data.reloadGlobalFavorites).toHaveBeenCalledTimes(2); // mount + settled write
        coverFavorites.toggleFavorite.mockClear();
        pending.set(true);
        component.onContinueWatchingActionSelected({ card, action });
        expect(coverFavorites.toggleFavorite).not.toHaveBeenCalled();
        pending.set(false);
        known.set(false);
        component.onContinueWatchingActionSelected({ card, action });
        expect(coverFavorites.toggleFavorite).not.toHaveBeenCalled();
        expect(
            component
                .continueWatchingCards()[0]
                .actions?.map((candidate) => candidate.id)
        ).not.toContain('favorite');
    });

    it.each([undefined, 'episode'] as const)(
        'withholds an unknown-position history heart and rejects its stale command (%s)',
        (historyContentType) => {
            const { component, recent, positionsReady, coverFavorites } =
                setup();
            recent.set([{ ...favorite, historyContentType, viewed_at: '' }]);
            const card = component.continueWatchingCards()[0];
            const action = card.actions?.find(
                (candidate) => candidate.id === 'favorite'
            );
            if (!action) throw new Error('Expected ready source heart');
            positionsReady.set(false);
            expect(
                component
                    .continueWatchingCards()[0]
                    .actions?.map((candidate) => candidate.id)
            ).not.toContain('favorite');
            component.onContinueWatchingActionSelected({ card, action });
            expect(coverFavorites.toggleFavorite).not.toHaveBeenCalled();
            positionsReady.set(true);
            expect(
                component
                    .continueWatchingCards()[0]
                    .actions?.map((candidate) => candidate.id)
            ).toContain('favorite');
        }
    );

    it('toggles Recently Added and favourite rails through the same owner and withholds unresolved episodes', () => {
        const { component, recent, data, coverFavorites } = setup();
        for (const card of [
            component.xtreamRecentlyAddedCards()[0],
            component.favoriteMoviesAndSeriesCards()[0],
        ]) {
            const action = card.actions?.find(
                (candidate) => candidate.id === 'favorite'
            );
            if (!action) throw new Error('Expected known membership command');
            component.onContentActionSelected({ card, action });
        }
        expect(coverFavorites.toggleFavorite).toHaveBeenCalledTimes(2);
        recent.set([
            {
                ...favorite,
                xtream_id: 909,
                historyContentType: 'episode',
                viewed_at: '',
            },
        ]);
        data.getPlaybackPositionForItem.mockReturnValue(null);
        expect(
            component
                .continueWatchingCards()[0]
                .actions?.map((action) => action.id)
        ).not.toContain('favorite');
    });

    it('reloads match-only playlist scope when Trending or Recommendations matches change', () => {
        const {
            data,
            recent,
            favorites,
            added,
            trendingItems,
            recommendations,
        } = setup();
        recent.set([]);
        favorites.set([]);
        added.set([]);
        TestBed.tick();
        data.reloadPlaybackPositions.mockClear();
        trendingItems.set([trending(match('trending-only'))]);
        TestBed.tick();
        expect(data.reloadPlaybackPositions).toHaveBeenLastCalledWith([
            'trending-only',
        ]);
        recommendations.set([recommended(match('recommendations-only'))]);
        TestBed.tick();
        expect(data.reloadPlaybackPositions).toHaveBeenLastCalledWith([
            'trending-only',
            'recommendations-only',
        ]);
        trendingItems.set([trending(match('replacement', 8))]);
        TestBed.tick();
        expect(data.reloadPlaybackPositions).toHaveBeenLastCalledWith([
            'replacement',
            'recommendations-only',
        ]);
        data.reloadPlaybackPositions.mockClear();
        trendingItems.set([
            { ...trending(match('replacement', 8)), rating: '9' },
        ]);
        TestBed.tick();
        expect(data.reloadPlaybackPositions).not.toHaveBeenCalled();
        trendingItems.set([{ ...trending(), match: null }]);
        recommendations.set([]);
        TestBed.tick();
        expect(data.reloadPlaybackPositions).toHaveBeenLastCalledWith([]);
    });

    it('projects complete membership onto non-favourite rails when that title is outside the display cap', () => {
        const { component, favorites, membership, trendingItems } = setup();
        favorites.set([]);
        membership.set([favorite, { ...favorite, xtream_id: 99 }]);
        trendingItems.set([trending(match('portal'))]);
        expect(component.favoriteMoviesAndSeriesCards()).toEqual([]);
        for (const card of [
            component.continueWatchingCards()[0],
            component.xtreamRecentlyAddedCards()[0],
            component.trendingCards()[0],
        ]) {
            expect(card.indicators?.favorite).toBe(true);
        }
    });

    it('projects an episode history favourite from its resolved parent, preserving a colliding catalogue show', () => {
        const { component, recent, membership, added, data } = setup();
        recent.set([
            {
                ...favorite,
                xtream_id: 909,
                historyContentType: 'episode',
                viewed_at: '',
            },
        ]);
        added.set([{ ...favorite, xtream_id: 909 }]);
        membership.set([{ ...favorite, xtream_id: 900 }]);
        data.getPlaybackPositionForItem.mockImplementation((_item, scope) =>
            scope === 'catalog'
                ? null
                : {
                      playlistId: 'portal',
                      contentXtreamId: 909,
                      seriesXtreamId: 900,
                      contentType: 'episode',
                      positionSeconds: 40,
                      durationSeconds: 100,
                  }
        );
        expect(component.continueWatchingCards()[0].indicators?.favorite).toBe(
            true
        );
        expect(
            component.xtreamRecentlyAddedCards()[0].indicators?.favorite
        ).toBe(false);
        membership.set([{ ...favorite, xtream_id: 909 }]);
        expect(component.continueWatchingCards()[0].indicators?.favorite).toBe(
            false
        );
        expect(
            component.xtreamRecentlyAddedCards()[0].indicators?.favorite
        ).toBe(true);
    });

    it('does not imply the colliding show is favourited when episode history has no parent identity', () => {
        const { component, recent, membership, data } = setup();
        recent.set([
            {
                ...favorite,
                xtream_id: 909,
                historyContentType: 'episode',
                viewed_at: '',
            },
        ]);
        membership.set([{ ...favorite, xtream_id: 909 }]);
        data.getPlaybackPositionForItem.mockReturnValue({
            playlistId: 'portal',
            contentXtreamId: 909,
            contentType: 'episode',
            positionSeconds: 40,
            durationSeconds: 100,
        });
        expect(
            component.continueWatchingCards()[0].indicators?.favorite
        ).not.toBe(true);
        const unresolved = component.continueWatchingCards()[0];
        expect(unresolved.detailsEnabled).toBe(false);
        expect(unresolved.actions?.map((action) => action.id)).not.toContain(
            'details'
        );
        expect(unresolved.actions?.map((action) => action.id)).toContain(
            'remove-from-history'
        );
    });

    it('rejects a stale Details selection after the episode parent becomes unresolved', () => {
        const { component, recent, data } = setup();
        const row: GlobalRecentItem = {
            ...favorite,
            xtream_id: 909,
            historyContentType: 'episode',
            viewed_at: '',
        };
        recent.set([row]);
        data.getPlaybackPositionForItem.mockReturnValue({
            playlistId: 'portal',
            contentXtreamId: 909,
            seriesXtreamId: 900,
            contentType: 'episode',
            positionSeconds: 40,
            durationSeconds: 100,
        });
        const card = component.continueWatchingCards()[0];
        const action = card.actions?.find(
            (candidate) => candidate.id === 'details'
        );
        if (!action) throw new Error('Expected initial Details action');
        const router = TestBed.inject(Router);
        router.navigate = jest.fn();
        data.getPlaybackPositionForItem.mockReturnValue(null);
        recent.set([{ ...row }]);
        component.onContentActionSelected({ card, action });
        expect(router.navigate).not.toHaveBeenCalled();
        expect(
            component
                .continueWatchingCards()[0]
                .actions?.map((candidate) => candidate.id)
        ).toContain('remove-from-history');
    });

    it('keeps parent history favourite ownership distinct from the same-ID episode and other scopes', () => {
        const { component, recent, membership, data } = setup();
        const row = { ...favorite, xtream_id: 909, viewed_at: '' };
        recent.set([
            { ...row, id: 91, historyContentType: 'episode' },
            { ...row, id: 92, historyContentType: 'series' },
        ]);
        data.getPlaybackPositionForItem.mockImplementation((item) => ({
            playlistId: 'portal',
            contentType: 'episode',
            positionSeconds: 40,
            durationSeconds: 100,
            contentXtreamId: item.historyContentType === 'episode' ? 909 : 42,
            seriesXtreamId: item.historyContentType === 'episode' ? 900 : 909,
        }));
        membership.set([
            { ...favorite, xtream_id: 900, playlist_id: 'other' },
            { ...favorite, xtream_id: 900, source: 'stalker' },
            { ...favorite, xtream_id: 909 },
        ]);
        expect(
            component
                .continueWatchingCards()
                .map((card) => card.indicators?.favorite)
        ).toEqual([false, true]);
        membership.set([{ ...favorite, xtream_id: 900 }]);
        expect(
            component
                .continueWatchingCards()
                .map((card) => card.indicators?.favorite)
        ).toEqual([true, false]);
        expect(recent()[0].xtream_id).toBe(909);
    });
});
