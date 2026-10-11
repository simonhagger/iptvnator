import type { SavedVodPlaylist } from '@iptvnator/shared/interfaces';
import { handleWorkerRequest } from './worker-events.utils';

handleWorkerRequest('DB_LIST_SAVED_VOD_PLAYLISTS', () => ({}));
handleWorkerRequest('DB_GET_SAVED_VOD_PLAYLIST', (id: string) => ({ id }));
handleWorkerRequest(
    'DB_SAVE_SAVED_VOD_PLAYLIST',
    (playlist: SavedVodPlaylist, expectedRevision: number | null) => ({
        playlist,
        expectedRevision,
    })
);
handleWorkerRequest(
    'DB_DELETE_SAVED_VOD_PLAYLIST',
    (id: string, expectedRevision: number) => ({ id, expectedRevision })
);
