import type { Router } from '@angular/router';
import { parseWorkspaceShellRoute } from '@iptvnator/workspace/shell/util';
import { savedPlaylistsNavigationCommand } from './workspace-saved-playlists-command';

describe('saved playlist navigation command', () => {
    it('opens the global page without a provider or imported source', () => {
        const navigate = jest.fn().mockResolvedValue(true);
        const command = savedPlaylistsNavigationCommand({
            route: parseWorkspaceShellRoute('/workspace/sources'),
            router: { navigate } as unknown as Router,
        });

        expect(command.visible).toBe(true);
        expect(command.group).toBe('global');
        command.run({ query: '' });
        expect(navigate).toHaveBeenCalledWith([
            '/workspace',
            'saved-playlists',
        ]);
    });

    it('omits navigation to the page that is already open', () => {
        const command = savedPlaylistsNavigationCommand({
            route: parseWorkspaceShellRoute('/workspace/saved-playlists'),
            router: { navigate: jest.fn() } as unknown as Router,
        });
        expect(command.visible).toBe(false);
    });
});
