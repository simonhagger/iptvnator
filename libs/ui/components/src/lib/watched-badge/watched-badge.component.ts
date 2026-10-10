import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

@Component({
    selector: 'app-watched-badge',
    standalone: true,
    imports: [MatIcon],
    template: `
        @if (isWatched()) {
            <div
                class="watched-badge"
                [class.watched-badge--inline]="inline()"
                [attr.role]="label() ? 'img' : null"
                [attr.aria-label]="label()"
            >
                <mat-icon>{{ icon() }}</mat-icon>
            </div>
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [
        `
            .watched-badge {
                position: absolute;
                top: 8px;
                left: 8px;
                width: 24px;
                height: 24px;
                background: rgba(70, 211, 105, 0.9);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                backdrop-filter: blur(4px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);

                mat-icon {
                    font-size: 16px;
                    width: 16px;
                    height: 16px;
                    color: white;
                }
                &--inline {
                    position: static;
                    background: var(--app-widget-bg);
                    border: 1px solid var(--app-widget-border);
                    box-sizing: border-box;
                    mat-icon {
                        color: var(--app-on-surface);
                    }
                }
            }
        `,
    ],
})
export class WatchedBadgeComponent {
    readonly isWatched = input.required<boolean>();
    readonly icon = input<string>('check_circle');
    readonly inline = input(false);
    readonly label = input<string | null>(null);
}
