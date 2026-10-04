import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    effect,
    inject,
    signal,
    untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
    MAT_DIALOG_DATA,
    MatDialogModule,
    MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MAX_SAVED_VOD_NAME_LENGTH } from '@iptvnator/shared/interfaces';
import {
    SavedVodAddDialogController,
    type SavedVodAddResult,
    type SavedVodCandidate,
} from '@iptvnator/portal/shared/data-access';
import { TranslatePipe } from '@ngx-translate/core';
import { savedVodPlaylistNameValidator } from '../saved-vod-playlist-name-dialog/saved-vod-playlist-name.validator';

export interface SavedVodAddDialogData {
    /** Title snapshots and typed provider references only; never stream URLs. */
    readonly candidates: readonly SavedVodCandidate[];
}

@Component({
    selector: 'app-saved-vod-add-dialog',
    imports: [
        ReactiveFormsModule,
        MatButtonModule,
        MatCheckboxModule,
        MatDialogModule,
        MatFormFieldModule,
        MatInputModule,
        MatRadioModule,
        MatSelectModule,
        TranslatePipe,
    ],
    providers: [SavedVodAddDialogController],
    templateUrl: './saved-vod-add-dialog.component.html',
    styleUrl: './saved-vod-add-dialog.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SavedVodAddDialogComponent {
    readonly data = inject<SavedVodAddDialogData>(MAT_DIALOG_DATA);
    readonly state = inject(SavedVodAddDialogController);
    private readonly dialog = inject(
        MatDialogRef<SavedVodAddDialogComponent, SavedVodAddResult | undefined>
    );
    private alive = true;
    private exposed = false;
    readonly mode = signal<'existing' | 'new'>('existing');
    readonly maxNameLength = MAX_SAVED_VOD_NAME_LENGTH;
    readonly name = new FormControl('', {
        nonNullable: true,
        validators: savedVodPlaylistNameValidator,
    });
    readonly duplicates = new FormControl(false, { nonNullable: true });
    readonly form = new FormGroup({
        name: this.name,
        duplicates: this.duplicates,
    });

    constructor() {
        inject(DestroyRef).onDestroy(() => {
            this.discard();
        });
        this.dialog
            .beforeClosed()
            .pipe(takeUntilDestroyed())
            .subscribe(() => this.discard());
        effect(() => {
            if (!this.state.initialized()) return;
            if (this.state.parentalLock.active()) {
                if (this.exposed) untracked(() => this.cancel());
            } else {
                this.exposed = true;
            }
        });
        effect(() => {
            if (this.state.busy())
                this.duplicates.disable({ emitEvent: false });
            else this.duplicates.enable({ emitEvent: false });
        });
        void this.initialize();
    }

    async initialize(): Promise<void> {
        await this.state.initialize();
        if (this.alive && this.state.canRead() && !this.state.lists().length)
            this.mode.set('new');
    }

    async unlock(): Promise<void> {
        if (await this.state.parentalLock.requestUnlock())
            await this.initialize();
    }

    async submit(): Promise<void> {
        if (this.mode() === 'new' && this.name.invalid) {
            this.name.markAsTouched();
            return;
        }
        const result = await this.state.add(this.data.candidates, {
            ...(this.mode() === 'new'
                ? { newName: this.name.value.trim() }
                : {}),
            allowDuplicates: this.duplicates.value,
        });
        if (this.alive && result) this.dialog.close(result);
    }

    cancel(): void {
        if (!this.alive) return;
        this.discard();
        this.dialog.close();
    }

    private discard(): void {
        if (!this.alive) return;
        this.alive = false;
        this.state.dispose();
    }
}
