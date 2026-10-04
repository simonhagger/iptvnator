import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
    MAT_DIALOG_DATA,
    MatDialogModule,
    MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MAX_SAVED_VOD_NAME_LENGTH } from '@iptvnator/shared/interfaces';
import { TranslatePipe } from '@ngx-translate/core';

export interface SavedVodPlaylistNameDialogData {
    readonly title: string;
    readonly actionLabel: string;
    readonly initialName?: string;
}

/** Shared by create, rename, duplicate and add-to-new-playlist surfaces. */
@Component({
    selector: 'app-saved-vod-playlist-name-dialog',
    imports: [
        ReactiveFormsModule,
        MatButtonModule,
        MatDialogModule,
        MatFormFieldModule,
        MatInputModule,
        TranslatePipe,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <form [formGroup]="form" (ngSubmit)="submit()">
            <h2 mat-dialog-title>{{ data.title }}</h2>
            <mat-dialog-content>
                <mat-form-field>
                    <mat-label>{{
                        'SAVED_VOD_PLAYLISTS.NAME' | translate
                    }}</mat-label>
                    <input
                        matInput
                        cdkFocusInitial
                        autocomplete="off"
                        data-test-id="saved-vod-name"
                        [formControl]="name"
                    />
                    <mat-hint align="end"
                        >{{ name.value.trim().length }} /
                        {{ maxNameLength }}</mat-hint
                    >
                    <mat-error>{{
                        'SAVED_VOD_PLAYLISTS.NAME_ERROR'
                            | translate: { max: maxNameLength }
                    }}</mat-error>
                </mat-form-field>
            </mat-dialog-content>
            <mat-dialog-actions align="end">
                <button type="button" mat-button mat-dialog-close>
                    {{ 'CANCEL' | translate }}
                </button>
                <button
                    type="submit"
                    mat-flat-button
                    data-test-id="saved-vod-name-save"
                    [disabled]="name.invalid"
                >
                    {{ data.actionLabel }}
                </button>
            </mat-dialog-actions>
        </form>
    `,
    styles: `
        mat-form-field {
            width: 100%;
        }
    `,
})
export class SavedVodPlaylistNameDialogComponent {
    readonly data = inject<SavedVodPlaylistNameDialogData>(MAT_DIALOG_DATA);
    private readonly dialog = inject(
        MatDialogRef<SavedVodPlaylistNameDialogComponent, string | undefined>
    );
    readonly maxNameLength = MAX_SAVED_VOD_NAME_LENGTH;
    readonly name = new FormControl(this.data.initialName ?? '', {
        nonNullable: true,
        validators: (control) => {
            const length = (control.value as string).trim().length;
            return length > 0 && length <= MAX_SAVED_VOD_NAME_LENGTH
                ? null
                : { invalidName: true };
        },
    });
    readonly form = new FormGroup({ name: this.name });

    submit(): void {
        if (this.name.invalid) {
            this.name.markAsTouched();
            return;
        }
        this.dialog.close(this.name.value.trim());
    }
}
