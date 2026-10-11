import type { VodMoreMenuItem } from './vod-more-menu.model';

/** One action label/icon across movie details and individual episode menus. */
export const SAVED_VOD_ADD_MENU_ITEM = {
    id: 'add-to-saved-playlist',
    labelKey: 'SAVED_VOD_PLAYLISTS.ADD_TITLE',
    icon: 'playlist_add',
} as const satisfies VodMoreMenuItem;
