import type { WorkspaceCommandContribution } from '@iptvnator/portal/shared/util';
import { SOURCE_TYPE_ICONS } from '@iptvnator/shared/interfaces';
import type { CommandBuilderContext } from './workspace-shell-command-builders';
import { savedPlaylistsNavigationCommand } from './workspace-saved-playlists-command';

export function getGlobalCommandDefinitions(
    ctx: CommandBuilderContext
): WorkspaceCommandContribution[] {
    const {
        route,
        hasSearchablePlaylists,
        supportsDownloads,
        showDashboard,
        parentalLockState,
        actions,
    } = ctx;

    return [
        {
            id: 'parental-lock-now',
            group: 'global',
            icon: 'lock',
            labelKey: 'WORKSPACE.SHELL.COMMANDS.PARENTAL_LOCK_NOW_LABEL',
            descriptionKey:
                'WORKSPACE.SHELL.COMMANDS.PARENTAL_LOCK_NOW_DESCRIPTION',
            priority: 5,
            visible: parentalLockState === 'unlocked',
            keywords: ['parental', 'pin', 'lock'],
            run: () => actions.lockParentalLock(),
        },
        {
            id: 'parental-unlock',
            group: 'global',
            icon: 'lock_open',
            labelKey: 'WORKSPACE.SHELL.COMMANDS.PARENTAL_UNLOCK_LABEL',
            descriptionKey:
                'WORKSPACE.SHELL.COMMANDS.PARENTAL_UNLOCK_DESCRIPTION',
            priority: 5,
            visible: parentalLockState === 'locked',
            keywords: ['parental', 'pin', 'unlock'],
            run: () => actions.unlockParentalLock(),
        },
        {
            id: 'global-search',
            group: 'global',
            icon: 'search',
            labelKey: 'WORKSPACE.SHELL.COMMANDS.GLOBAL_SEARCH_LABEL',
            descriptionKey:
                'WORKSPACE.SHELL.COMMANDS.GLOBAL_SEARCH_DESCRIPTION',
            priority: 10,
            visible: hasSearchablePlaylists && route.kind !== 'global-search',
            keywords: ['xtream', 'm3u', 'live'],
            run: ({ query }) => actions.openGlobalSearch(query),
        },
        {
            id: 'open-global-favorites',
            group: 'global',
            icon: 'star',
            labelKey: 'WORKSPACE.SHELL.COMMANDS.OPEN_GLOBAL_FAVORITES_LABEL',
            descriptionKey:
                'WORKSPACE.SHELL.COMMANDS.OPEN_GLOBAL_FAVORITES_DESCRIPTION',
            priority: 20,
            visible: route.kind !== 'global-favorites',
            run: () => actions.navigateToGlobalFavorites(),
        },
        {
            id: 'open-global-recent',
            group: 'global',
            icon: 'history',
            labelKey: 'WORKSPACE.SHELL.COMMANDS.OPEN_GLOBAL_RECENT_LABEL',
            descriptionKey:
                'WORKSPACE.SHELL.COMMANDS.OPEN_GLOBAL_RECENT_DESCRIPTION',
            priority: 30,
            visible: route.kind !== 'global-recent',
            run: () => actions.openGlobalRecent(),
        },
        {
            id: 'open-downloads',
            group: 'global',
            icon: 'download',
            labelKey: 'WORKSPACE.SHELL.COMMANDS.OPEN_DOWNLOADS_LABEL',
            descriptionKey:
                'WORKSPACE.SHELL.COMMANDS.OPEN_DOWNLOADS_DESCRIPTION',
            priority: 40,
            visible: supportsDownloads && route.kind !== 'downloads',
            run: () => actions.openDownloadsShortcut(),
        },
        savedPlaylistsNavigationCommand(ctx),
        {
            id: 'open-settings',
            group: 'global',
            icon: 'settings',
            labelKey: 'WORKSPACE.SHELL.COMMANDS.OPEN_SETTINGS_LABEL',
            descriptionKey:
                'WORKSPACE.SHELL.COMMANDS.OPEN_SETTINGS_DESCRIPTION',
            priority: 50,
            visible: route.kind !== 'settings',
            run: () => {
                void ctx.router.navigate(['/workspace', 'settings']);
            },
        },
        {
            id: 'open-sources',
            group: 'global',
            icon: 'library_books',
            labelKey: 'WORKSPACE.SHELL.COMMANDS.OPEN_SOURCES_LABEL',
            descriptionKey: 'WORKSPACE.SHELL.COMMANDS.OPEN_SOURCES_DESCRIPTION',
            priority: 60,
            visible: route.kind !== 'sources',
            run: () => {
                void ctx.router.navigate(['/workspace', 'sources']);
            },
        },
        {
            id: 'open-dashboard',
            group: 'global',
            icon: 'dashboard',
            labelKey: 'WORKSPACE.SHELL.COMMANDS.OPEN_DASHBOARD_LABEL',
            descriptionKey:
                'WORKSPACE.SHELL.COMMANDS.OPEN_DASHBOARD_DESCRIPTION',
            priority: 70,
            visible: showDashboard && route.kind !== 'dashboard',
            run: () => {
                void ctx.router.navigate(['/workspace', 'dashboard']);
            },
        },
        {
            id: 'add-playlist',
            group: 'global',
            icon: 'add_circle_outline',
            labelKey: 'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_LABEL',
            descriptionKey: 'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_DESCRIPTION',
            priority: 80,
            run: () => actions.openAddPlaylistDialog(),
        },
        {
            id: 'add-playlist-m3u',
            group: 'global',
            icon: SOURCE_TYPE_ICONS.m3u,
            labelKey: 'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_M3U_LABEL',
            descriptionKey:
                'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_M3U_DESCRIPTION',
            keywords: ['m3u', 'm3u8', 'file', 'url', 'add', 'import'],
            priority: 79,
            run: () => actions.openAddPlaylistDialog('url'),
        },
        {
            id: 'add-playlist-xtream',
            group: 'global',
            icon: SOURCE_TYPE_ICONS.xtream,
            labelKey: 'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_XTREAM_LABEL',
            descriptionKey:
                'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_XTREAM_DESCRIPTION',
            keywords: ['xtream', 'codes', 'iptv', 'add', 'import'],
            priority: 78,
            run: () => actions.openAddPlaylistDialog('xtream'),
        },
        {
            id: 'add-playlist-stalker',
            group: 'global',
            icon: SOURCE_TYPE_ICONS.stalker,
            labelKey: 'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_STALKER_LABEL',
            descriptionKey:
                'WORKSPACE.SHELL.COMMANDS.ADD_PLAYLIST_STALKER_DESCRIPTION',
            keywords: ['stalker', 'portal', 'mac', 'ministra', 'add'],
            priority: 77,
            run: () => actions.openAddPlaylistDialog('stalker'),
        },
    ];
}
