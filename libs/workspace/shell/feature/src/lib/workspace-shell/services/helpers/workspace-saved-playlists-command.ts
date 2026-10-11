import type { WorkspaceCommandContribution } from '@iptvnator/portal/shared/util';
import type { CommandBuilderContext } from './workspace-shell-command-builders';

export function savedPlaylistsNavigationCommand(
    ctx: Pick<CommandBuilderContext, 'route' | 'router'>
): WorkspaceCommandContribution {
    return {
        id: 'open-saved-playlists',
        group: 'global',
        icon: 'playlist_play',
        labelKey: 'SAVED_VOD_PLAYLISTS.TITLE',
        descriptionKey: 'SAVED_VOD_PLAYLISTS.DESCRIPTION',
        priority: 35,
        visible: ctx.route.kind !== 'saved-playlists',
        run: () => {
            void ctx.router.navigate(['/workspace', 'saved-playlists']);
        },
    };
}
