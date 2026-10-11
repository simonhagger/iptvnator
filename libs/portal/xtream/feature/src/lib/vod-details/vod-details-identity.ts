import type { XtreamVodDetails } from '@iptvnator/shared/interfaces';

type XtreamVodIdentityItem = XtreamVodDetails & {
    readonly id?: number | string;
    readonly stream_id?: number | string;
    readonly xtream_id?: number | string;
};

/** Provider content ID takes precedence over the local catalog row ID. */
export function resolveVodIdentity(item: XtreamVodDetails): number | null {
    const candidate = item as XtreamVodIdentityItem;
    const value =
        item.movie_data?.stream_id ??
        candidate.xtream_id ??
        candidate.stream_id ??
        candidate.id;
    const id = typeof value === 'string' ? Number(value) : value;
    return typeof id === 'number' && Number.isSafeInteger(id) && id > 0
        ? id
        : null;
}
