import {
    ChangeDetectionStrategy,
    Component,
    input,
    output,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslatePipe } from '@ngx-translate/core';
import type { ContentCoverAction } from '@iptvnator/portal/shared/util';

/** Keep this a sibling of the cover's link/button, never an interactive descendant. */
@Component({
    selector: 'app-content-cover-actions',
    imports: [MatIconButton, MatIcon, MatMenuModule, TranslatePipe],
    template: `
        @if (actions().length) {
            <button
                type="button"
                mat-icon-button
                [matMenuTriggerFor]="menu"
                [attr.aria-label]="
                    'COVER.MORE_ACTIONS' | translate: { title: title() }
                "
                [attr.data-test-id]="testId() ?? 'content-cover-actions'"
            >
                <mat-icon>more_vert</mat-icon>
            </button>
            <mat-menu #menu="matMenu">
                @for (action of actions(); track action.id) {
                    @if (action.separatorBefore) {
                        <div class="separator" role="separator"></div>
                    }
                    <button
                        mat-menu-item
                        type="button"
                        [disabled]="action.disabled"
                        [class.app-destructive-button]="action.destructive"
                        [attr.data-test-id]="
                            'content-cover-action-' + action.id
                        "
                        (click)="select(action)"
                    >
                        <mat-icon>{{ action.icon }}</mat-icon>
                        <span>{{
                            action.labelKey
                                ? (action.labelKey | translate)
                                : action.label
                        }}</span>
                    </button>
                }
            </mat-menu>
        }
    `,
    styles: `
        :host {
            position: absolute;
            top: 6px;
            right: 6px;
            z-index: 2;
            app-region: no-drag;
        }
        button {
            app-region: no-drag;
        }
        button[mat-icon-button] {
            color: var(--app-on-surface);
            background: var(--app-widget-bg);
            border: 1px solid var(--app-widget-border);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
            width: 32px;
            height: 32px;
            padding: 4px;
        }
        button:focus-visible {
            outline: 2px solid var(--app-selection-color);
            outline-offset: 2px;
        }
        .separator {
            border-top: 1px solid var(--app-widget-border);
            margin: 4px 0;
        }
    `,
    host: {
        '(click)': '$event.stopPropagation()',
        '(keydown)': 'isolateActivation($event)',
    },
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContentCoverActionsComponent {
    readonly title = input.required<string>();
    readonly actions = input<readonly ContentCoverAction[]>([]);
    readonly testId = input<string | null>(null);
    readonly actionSelected = output<ContentCoverAction>();

    protected isolateActivation(event: KeyboardEvent): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.stopPropagation();
        }
    }

    protected select(action: ContentCoverAction): void {
        if (!action.disabled) this.actionSelected.emit(action);
    }
}
