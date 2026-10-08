import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import {
    CollectionContentType,
    ContentCoverAction,
    UnifiedCollectionItem,
    collectionRowIdentity,
    contentCoverIdentity,
} from '@iptvnator/portal/shared/util';
import { ContentCardComponent } from '../content-card/content-card.component';
import { foldSearchText } from '@iptvnator/shared/interfaces';

@Component({
    selector: 'app-unified-grid-tab',
    templateUrl: './unified-grid-tab.component.html',
    styleUrl: './unified-grid-tab.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ContentCardComponent, MatIconModule, TranslatePipe],
})
export class UnifiedGridTabComponent {
    readonly items = input.required<UnifiedCollectionItem[]>();
    readonly mode = input<'favorites' | 'recent'>('favorites');
    readonly contentType = input<CollectionContentType>('movie');
    readonly searchTerm = input('');
    readonly pendingFavoriteKeys = input<ReadonlySet<string>>(new Set());
    readonly favoriteActionsDisabled = input(false);

    readonly removeItem = output<UnifiedCollectionItem>();
    readonly itemSelected = output<UnifiedCollectionItem>();
    readonly favoriteToggled = output<UnifiedCollectionItem>();

    private readonly normalizedSearchTerm = computed(() =>
        foldSearchText(this.searchTerm().trim())
    );
    /**
     * Search results are identified by the name the user typed, so a
     * filtered grid keeps its titles even under the posters-only wall.
     */
    readonly hasActiveSearch = computed(
        () => this.normalizedSearchTerm().length > 0
    );

    readonly filteredItems = computed(() => {
        const term = this.normalizedSearchTerm();
        const all = this.items();
        return term
            ? all.filter((i) => foldSearchText(i.name).includes(term))
            : all;
    });

    onCardClick(item: UnifiedCollectionItem): void {
        if (item.coverDetailTarget !== null) this.itemSelected.emit(item);
    }

    onRemove(item: UnifiedCollectionItem): void {
        if (!this.removeActionDisabled(item)) this.removeItem.emit(item);
    }

    removeActionDisabled(item: UnifiedCollectionItem): boolean {
        return (
            this.mode() === 'favorites' &&
            (this.favoriteActionsDisabled() ||
                this.pendingFavoriteKeys().has(contentCoverIdentity(item)) ||
                item.coverIndicators?.favorite !== true)
        );
    }

    coverActions(item: UnifiedCollectionItem): readonly ContentCoverAction[] {
        const favorite = item.coverIndicators?.favorite;
        if (
            this.mode() !== 'recent' ||
            favorite === undefined ||
            item.coverFavoriteTarget === null
        )
            return [];
        return [
            {
                id: 'favorite',
                favoriteState: favorite,
                icon: favorite ? 'favorite' : 'favorite_border',
                labelKey: favorite
                    ? 'PORTALS.REMOVE_FROM_FAVORITES'
                    : 'PORTALS.ADD_TO_FAVORITES',
                disabled:
                    this.favoriteActionsDisabled() ||
                    this.pendingFavoriteKeys().has(
                        contentCoverIdentity(item.coverFavoriteTarget ?? item)
                    ),
            },
        ];
    }

    onCoverAction(
        item: UnifiedCollectionItem,
        action: ContentCoverAction
    ): void {
        if (action.id === 'favorite' && !action.disabled)
            this.favoriteToggled.emit(item);
    }

    trackByUid(_: number, item: UnifiedCollectionItem): string {
        return collectionRowIdentity(item);
    }
}
