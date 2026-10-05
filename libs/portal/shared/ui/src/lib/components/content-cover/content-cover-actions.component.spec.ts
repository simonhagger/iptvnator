import { OverlayContainer } from '@angular/cdk/overlay';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import type { ContentCoverAction } from '@iptvnator/portal/shared/util';
import { ContentCoverActionsComponent } from './content-cover-actions.component';

const actions: readonly ContentCoverAction[] = [
    { id: 'details', icon: 'info', labelKey: 'COVER.DETAILS' },
    { id: 'favorite', icon: 'favorite', label: 'Add to favorites' },
    {
        id: 'remove',
        icon: 'delete',
        label: 'Remove',
        disabled: true,
        destructive: true,
        separatorBefore: true,
    },
];

describe('ContentCoverActionsComponent', () => {
    let fixture: ComponentFixture<ContentCoverActionsComponent>;
    let overlay: HTMLElement;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [
                ContentCoverActionsComponent,
                NoopAnimationsModule,
                TranslateModule.forRoot(),
            ],
        }).compileComponents();
        const translate = TestBed.inject(TranslateService);
        translate.setTranslation('en', {
            COVER: {
                DETAILS: 'Open details',
                MORE_ACTIONS: 'More actions for {{title}}',
            },
        });
        translate.use('en');
        overlay = TestBed.inject(OverlayContainer).getContainerElement();
        fixture = TestBed.createComponent(ContentCoverActionsComponent);
        fixture.componentRef.setInput('title', 'Cover movie');
        fixture.componentRef.setInput('actions', actions);
        fixture.detectChanges();
    });

    function requiredElement<T extends HTMLElement>(
        parent: HTMLElement,
        selector: string
    ): T {
        const result = parent.querySelector<T>(selector);
        if (!result) throw new Error(`Expected cover element: ${selector}`);
        return result;
    }
    const trigger = () =>
        requiredElement<HTMLButtonElement>(fixture.nativeElement, 'button');
    const row = (id: string) =>
        requiredElement<HTMLButtonElement>(
            overlay,
            `[data-test-id="content-cover-action-${id}"]`
        );
    async function open(): Promise<void> {
        trigger().click();
        fixture.detectChanges();
        await fixture.whenStable();
    }
    async function finishMenuClose(): Promise<void> {
        fixture.detectChanges();
        // Material completes even disabled animations on a zero-delay timer
        // outside Angular; whenStable alone does not wait for that callback.
        await new Promise<void>((resolve) => setTimeout(resolve));
        await fixture.whenStable();
    }

    it('names the trigger for its content and preserves optional host test hooks', () => {
        expect(trigger().getAttribute('aria-label')).toBe(
            'More actions for Cover movie'
        );
        expect(trigger().getAttribute('data-test-id')).toBe(
            'content-cover-actions'
        );
        fixture.componentRef.setInput(
            'testId',
            'dashboard-favorite-vod-rail-card-actions'
        );
        fixture.detectChanges();
        expect(trigger().getAttribute('data-test-id')).toBe(
            'dashboard-favorite-vod-rail-card-actions'
        );
    });

    it('hides the trigger while there are no available actions', () => {
        fixture.componentRef.setInput('actions', []);
        fixture.detectChanges();
        expect(
            (fixture.nativeElement as HTMLElement).querySelector('button')
        ).toBeNull();
    });

    it('honours disabled actions and emits only the chosen enabled action', async () => {
        const selected = jest.fn();
        fixture.componentInstance.actionSelected.subscribe(selected);
        await open();
        expect(row('details').textContent).toContain('Open details');
        expect(row('remove').disabled).toBe(true);
        expect(row('remove').classList).toContain('app-destructive-button');
        expect(overlay.querySelector('[role="separator"]')).not.toBeNull();
        row('remove').click();
        row('remove').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(selected).not.toHaveBeenCalled();
        row('favorite').click();
        await finishMenuClose();
        expect(selected).toHaveBeenCalledTimes(1);
        expect(selected).toHaveBeenCalledWith(actions[1]);
        expect(overlay.querySelector('[role="menu"]')).toBeNull();
    });

    it('isolates trigger click and keyboard events from a surrounding cover activation', async () => {
        const host = fixture.nativeElement as HTMLElement;
        const parent = host.parentElement;
        if (!parent) throw new Error('Expected cover host parent');
        const clicked = jest.fn();
        const keyed = jest.fn();
        parent.addEventListener('click', clicked);
        parent.addEventListener('keydown', keyed);
        try {
            trigger().dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
            );
            trigger().dispatchEvent(
                new KeyboardEvent('keydown', { key: ' ', bubbles: true })
            );
            await open();
            expect(clicked).not.toHaveBeenCalled();
            expect(keyed).not.toHaveBeenCalled();
            expect(trigger().closest('[role="button"],a')).toBeNull();
        } finally {
            parent.removeEventListener('click', clicked);
            parent.removeEventListener('keydown', keyed);
        }
    });

    it('closes on Escape and restores focus to the trigger without selecting an action', async () => {
        const selected = jest.fn();
        fixture.componentInstance.actionSelected.subscribe(selected);
        trigger().focus();
        await open();
        row('details').focus();
        expect(document.activeElement).toBe(row('details'));
        requiredElement<HTMLElement>(overlay, '[role="menu"]').dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                keyCode: 27,
                bubbles: true,
            })
        );
        await finishMenuClose();
        expect(overlay.querySelector('[role="menu"]')).toBeNull();
        expect(document.activeElement).toBe(trigger());
        expect(selected).not.toHaveBeenCalled();
    });

    it('allows Escape from the trigger to reach the overlay dispatcher', async () => {
        const selected = jest.fn();
        fixture.componentInstance.actionSelected.subscribe(selected);
        await open();
        trigger().focus();
        trigger().dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Escape',
                keyCode: 27,
                bubbles: true,
            })
        );
        await finishMenuClose();
        expect(overlay.querySelector('[role="menu"]')).toBeNull();
        expect(document.activeElement).toBe(trigger());
        expect(selected).not.toHaveBeenCalled();
    });
});
