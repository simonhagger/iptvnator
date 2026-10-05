import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
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
} from '@iptvnator/shared/interfaces';
import {
    DashboardDataService,
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
        const recent = signal([{ ...favorite, viewed_at: '' }]);
        const favorites = signal<DashboardFavoriteItem[]>([favorite]);
        const membership = signal<DashboardFavoriteItem[]>([favorite]);
        const added = signal([{ ...favorite }]);
        const trendingItems = signal<DashboardTrendingItem[]>([]);
        const recommendations = signal<DashboardRecommendationItem[]>([]);
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
            playlistsLoaded: signal(true),
            dashboardReady: signal(true),
            xtreamPlaylistCount: signal(0),
            globalFavoritesLoaded: signal(true),
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
            getPlaybackPositionForItem: jest.fn((_item, scope?: string) =>
                scope === 'catalog' ? null : episode
            ),
            hasLoadedPlaybackPositions: () => true,
            getRecentItemLink: () => ['/recent'],
            getRecentItemDetailNavigationState: () => undefined,
            getRecentItemResumeNavigation: () => null,
            getGlobalFavoriteLink: () => ['/favorites'],
            getGlobalFavoriteNavigationState: () => undefined,
            getRecentlyAddedLink: () => ['/added'],
            getRecentlyAddedNavigationState: () => undefined,
        };
        TestBed.configureTestingModule({
            providers: [
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
        const { component, favorites, trendingItems } = setup();
        favorites.set([]);
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
});
