import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { TranslateModule } from '@ngx-translate/core';
import { SeriesPlaybackQueueService } from '@iptvnator/portal/shared/data-access';
import type { UpNextRailItem } from './up-next-rail.util';

@Component({
    selector: 'app-series-queue',
    imports: [
        MatButtonModule,
        MatCheckboxModule,
        MatIconModule,
        MatSelectModule,
        MatFormFieldModule,
        TranslateModule,
    ],
    providers: [SeriesPlaybackQueueService],
    templateUrl: './series-queue.component.html',
    styleUrl: './series-queue.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeriesQueueComponent {
    readonly items = input.required<UpNextRailItem[]>();
    readonly scope = input.required<string>();
    readonly loadedOnly = input(false);
    readonly initialQueue = input<readonly number[] | null>(null);
    readonly launchFailure = input(0);
    readonly launchConfirmation = input(0);
    private initializedScope: string | null = null;
    readonly playRequested = output<UpNextRailItem>();
    readonly queue = inject(SeriesPlaybackQueueService);
    readonly expanded = signal(false);
    readonly selected = signal<number | null>(null);
    readonly current = computed(
        () => this.items().find((item) => item.isPlaying) ?? null
    );
    readonly upcoming = computed(() =>
        this.queue
            .state()
            .upcoming.map((id) => this.items().find((item) => item.id === id))
            .filter((item): item is UpNextRailItem => !!item)
    );
    readonly nextItem = computed(() => this.upcoming()[0] ?? null);

    constructor() {
        effect(() => {
            this.launchConfirmation();
            untracked(() =>
                this.queue.launchConfirmed(this.current()?.id ?? null)
            );
        });
        effect(() => {
            this.launchFailure();
            untracked(() => this.queue.launchFailed());
        });
        effect(() => {
            const scope = this.scope();
            const items = this.items();
            const current = this.current();
            const initial = this.initialQueue();
            untracked(() => {
                if (this.selected() === current?.id) this.selected.set(null);
                if (current)
                    this.queue.sync(
                        scope,
                        items.map((item) => item.id),
                        current.id
                    );
                else this.queue.cancel();
                if (
                    current &&
                    initial?.includes(current.id) &&
                    this.initializedScope !== scope &&
                    initial.every((id) => items.some((item) => item.id === id))
                ) {
                    this.queue.fromHere(initial, current.id);
                    this.initializedScope = scope;
                }
            });
        });
    }

    ended(): void {
        this.queue.ended((id) => this.play(id));
    }
    next(): void {
        this.queue.playNow((id) => this.play(id));
    }
    cancel(): void {
        this.queue.cancel();
    }

    play(id: number): void {
        const item = this.items().find((entry) => entry.id === id);
        if (item) this.playRequested.emit(item);
    }

    enqueue(placement: 'next' | 'last'): void {
        const id = this.selected();
        if (id !== null && this.items().some((item) => item.id === id)) {
            this.queue.enqueue(id, placement);
        }
    }

    fromHere(seasonOnly = false): void {
        const item =
            this.items().find((entry) => entry.id === this.selected()) ??
            this.current();
        if (!item) return;
        const catalogue = this.items().filter(
            (entry) => !seasonOnly || entry.seasonNumber === item.seasonNumber
        );
        const first = seasonOnly ? catalogue[0] : item;
        if (!first) return;
        this.queue.requestFromHere(
            catalogue.map((entry) => entry.id),
            first.id
        );
        this.play(first.id);
    }
}
