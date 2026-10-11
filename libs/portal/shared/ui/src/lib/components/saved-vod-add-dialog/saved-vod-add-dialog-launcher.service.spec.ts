import { Component, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import type { SavedVodCandidate } from '@iptvnator/shared/interfaces';
import { SavedVodAddDialogLauncherService } from './saved-vod-add-dialog-launcher.service';

@Component({ template: '', providers: [SavedVodAddDialogLauncherService] })
class OwnerComponent {
    readonly owner = signal('xtream:source:1');
    readonly launcher = inject(SavedVodAddDialogLauncherService);
    constructor() {
        this.launcher.bindOwner(this.owner);
    }
}

describe('SavedVodAddDialogLauncherService', () => {
    const draft: SavedVodCandidate = {
        title: 'A movie',
        reference: {
            provider: 'xtream',
            sourceId: 'source',
            kind: 'movie',
            contentId: '1',
        },
    };
    let closed: Subject<void>;
    let close: jest.Mock;
    let open: jest.Mock;
    beforeEach(() => {
        closed = new Subject();
        close = jest.fn();
        open = jest.fn(() => ({ close, afterClosed: () => closed }));
        TestBed.configureTestingModule({
            providers: [{ provide: MatDialog, useValue: { open } }],
        });
    });

    it('opens one owned dialog with an allowlisted immutable request snapshot', () => {
        const fixture = TestBed.createComponent(OwnerComponent);
        fixture.detectChanges();
        const raw = {
            ...draft,
            password: 'secret',
            reference: { ...draft.reference, url: 'private' },
        };
        fixture.componentInstance.launcher.open([raw]);
        raw.title = 'Changed';
        fixture.componentInstance.launcher.open([draft]);
        expect(open).toHaveBeenCalledTimes(1);
        expect(open.mock.calls[0][1].data).toEqual({ candidates: [draft] });
        expect(open.mock.calls[0][1].restoreFocus).toBe(true);
    });

    it('closes only its dialog when the bound content identity changes', () => {
        const fixture = TestBed.createComponent(OwnerComponent);
        fixture.detectChanges();
        fixture.componentInstance.launcher.open([draft]);
        fixture.componentInstance.owner.set('xtream:other:1');
        fixture.detectChanges();
        expect(close).toHaveBeenCalledTimes(1);
        closed.next();
        fixture.componentInstance.launcher.open([draft]);
        expect(open).toHaveBeenCalledTimes(2);
    });

    it('closes its dialog on destruction and ignores subsequent opens', () => {
        const fixture = TestBed.createComponent(OwnerComponent);
        const launcher = fixture.componentInstance.launcher;
        fixture.detectChanges();
        launcher.open([draft]);
        fixture.destroy();
        closed.next();
        launcher.open([draft]);
        expect(close).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenCalledTimes(1);
    });

    it('does not open for missing ownership, empty or invalid drafts', () => {
        const fixture = TestBed.createComponent(OwnerComponent);
        fixture.detectChanges();
        const { launcher, owner } = fixture.componentInstance;
        launcher.open([]);
        launcher.open([{ ...draft, title: '' }]);
        owner.set('');
        launcher.open([draft]);
        expect(open).not.toHaveBeenCalled();
    });
});
