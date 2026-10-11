import { isStalkerSeriesItem } from '@iptvnator/shared/interfaces';
import {
    ContentCoverIndicators,
    PortalCatalogSortMode,
    resolveProviderCoverRating,
} from '@iptvnator/portal/shared/util';

export interface CategoryContentItem {
    id?: number | string;
    is_series?: number | string | boolean;
    movie_id?: number | string;
    xtream_id?: number | string;
    series_id?: number | string;
    stream_id?: number | string;
    category_id?: number | string;
    rating?: string | number;
    rating_imdb?: string | number;
    rating_kinopoisk?: string | number;
    [key: string]: unknown;
}

/** Provider progress is already bulk-loaded by the catalogue facade. */
export function categoryContentCoverIndicators(
    item: CategoryContentItem,
    progress: ContentCoverIndicators,
    provider: 'xtream' | 'stalker',
    contentType: string | null | undefined,
    favorite: boolean | undefined
): ContentCoverIndicators {
    return {
        ...progress,
        favorite,
        rating: resolveProviderCoverRating(item),
        progressScope:
            contentType === 'series' ||
            (provider === 'stalker' && isStalkerSeriesItem(item))
                ? 'episode'
                : 'title',
    };
}

const sortLabelKeys: Readonly<Record<PortalCatalogSortMode, string>> = {
    'date-desc': 'WORKSPACE.SORT_DATE_DESC',
    'date-asc': 'WORKSPACE.SORT_DATE_ASC',
    'name-asc': 'WORKSPACE.SORT_NAME_ASC',
    'name-desc': 'WORKSPACE.SORT_NAME_DESC',
    'rating-desc': 'WORKSPACE.SORT_TOP_RATED',
    'rating-asc': 'WORKSPACE.SORT_LOWEST_RATED',
};

export function categorySortLabelKey(
    mode: PortalCatalogSortMode | null
): string {
    return mode ? sortLabelKeys[mode] : 'WORKSPACE.SORT_CUSTOM';
}
