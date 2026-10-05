import {
    DestroyRef,
    Injectable,
    effect,
    inject,
    signal,
    type Signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { normalizeSavedVodCandidates } from '@iptvnator/shared/interfaces/saved-vod-validation';
import type { SavedVodCandidate } from '@iptvnator/shared/interfaces';
import { SavedVodAddDialogComponent } from './saved-vod-add-dialog.component';

/** Provide per detail owner. Navigation closes only the dialog this owner opened. */
@Injectable()
export class SavedVodAddDialogLauncherService {
    private readonly dialog = inject(MatDialog);
    private readonly destroyRef = inject(DestroyRef);
    private readonly owner = signal<Signal<string> | null>(null);
    private active: MatDialogRef<SavedVodAddDialogComponent> | null = null;
    private openedOwner = '';
    private alive = true;

    constructor() {
        effect(() => {
            const key = this.owner()?.() ?? '';
            if (this.active && key !== this.openedOwner) this.active.close();
        });
        this.destroyRef.onDestroy(() => {
            this.alive = false;
            this.active?.close();
            this.active = null;
        });
    }

    bindOwner(owner: Signal<string>): void {
        this.owner.set(owner);
    }

    open(candidates: readonly SavedVodCandidate[]): void {
        const key = this.owner()?.() ?? '';
        if (!this.alive || this.active || !key || !candidates.length) return;
        let snapshot: SavedVodCandidate[];
        try {
            // Copy allowlisted fields so later host mutations cannot change the request.
            snapshot = normalizeSavedVodCandidates(candidates);
        } catch {
            return;
        }
        this.openedOwner = key;
        const ref = this.dialog.open(SavedVodAddDialogComponent, {
            data: { candidates: snapshot },
            width: '520px',
            maxWidth: 'calc(100vw - 32px)',
            restoreFocus: true,
        });
        this.active = ref;
        ref.afterClosed()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                if (this.active === ref) this.active = null;
            });
    }
}
