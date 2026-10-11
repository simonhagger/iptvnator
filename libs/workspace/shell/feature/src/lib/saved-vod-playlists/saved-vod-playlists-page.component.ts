import {
    ChangeDetectionStrategy,
    Component,
    inject,
    signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ParentalLockService } from '@iptvnator/services';
import { TranslatePipe } from '@ngx-translate/core';
import { SavedVodPlaylistsManagerComponent } from './saved-vod-playlists-manager.component';

/** Saved snapshots have no category index yet: withhold them while locked. */
@Component({
    selector: 'app-saved-vod-playlists-page',
    imports: [
        MatButtonModule,
        MatIconModule,
        TranslatePipe,
        SavedVodPlaylistsManagerComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (!ready()) {
            <div class="gate" role="status" aria-live="polite">
                @if (failed()) {
                    <p>{{ 'SAVED_VOD_PLAYLISTS.LOAD_FAILED' | translate }}</p>
                    <button mat-button (click)="initialize()">
                        {{ 'SAVED_VOD_PLAYLISTS.REFRESH' | translate }}
                    </button>
                } @else {
                    <p>{{ 'LOADING' | translate }}</p>
                }
            </div>
        } @else if (parentalLock.active()) {
            <div class="gate">
                <mat-icon aria-hidden="true">lock</mat-icon>
                <h1>{{ 'SAVED_VOD_PLAYLISTS.LOCKED_TITLE' | translate }}</h1>
                <p>
                    {{ 'SAVED_VOD_PLAYLISTS.LOCKED_DESCRIPTION' | translate }}
                </p>
                <button mat-flat-button (click)="unlock()">
                    {{ 'SAVED_VOD_PLAYLISTS.UNLOCK' | translate }}
                </button>
            </div>
        } @else {
            <app-saved-vod-playlists-manager />
        }
    `,
    styles: `
        :host {
            display: block;
            height: 100%;
            min-height: 0;
        }
        .gate {
            display: grid;
            justify-items: center;
            align-content: center;
            gap: 12px;
            height: 100%;
            padding: 24px;
            box-sizing: border-box;
            color: var(--app-on-surface);
            text-align: center;
        }
        h1,
        p {
            margin: 0;
        }
        h1 {
            font-size: 1.25rem;
            font-weight: 600;
        }
        p {
            max-width: 48ch;
            color: var(--app-eyebrow-color);
        }
        button {
            app-region: no-drag;
        }
    `,
})
export class SavedVodPlaylistsPageComponent {
    readonly parentalLock = inject(ParentalLockService);
    readonly ready = signal(false);
    readonly failed = signal(false);

    constructor() {
        void this.initialize();
    }

    async initialize(): Promise<void> {
        this.failed.set(false);
        try {
            await this.parentalLock.initialize();
            this.ready.set(true);
        } catch {
            this.failed.set(true);
        }
    }

    async unlock(): Promise<void> {
        await this.parentalLock.requestUnlock();
    }
}
