import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MAX_SAVED_VOD_NAME_LENGTH } from '@iptvnator/shared/interfaces/saved-vod-validation';
import { TranslatePipe } from '@ngx-translate/core';
import { MockPipe } from 'ng-mocks';
import { SavedVodPlaylistNameDialogComponent } from './saved-vod-playlist-name-dialog.component';

describe('saved playlist naming dialog', () => {
    const close = jest.fn();
    let component: SavedVodPlaylistNameDialogComponent;
    beforeEach(async () => {
        close.mockReset();
        await TestBed.configureTestingModule({
            imports: [SavedVodPlaylistNameDialogComponent],
            providers: [
                {
                    provide: MAT_DIALOG_DATA,
                    useValue: {
                        title: 'Rename',
                        actionLabel: 'Save',
                        initialName: 'Existing list',
                    },
                },
                { provide: MatDialogRef, useValue: { close } },
            ],
        })
            .overrideComponent(SavedVodPlaylistNameDialogComponent, {
                remove: { imports: [TranslatePipe] },
                add: {
                    imports: [MockPipe(TranslatePipe, (key: string) => key)],
                },
            })
            .compileComponents();
        component = TestBed.runInInjectionContext(
            () => new SavedVodPlaylistNameDialogComponent()
        );
    });

    it('starts with the existing name and returns a trimmed name', () => {
        expect(component.name.value).toBe('Existing list');
        component.name.setValue('  Evening films  ');
        component.submit();
        expect(close).toHaveBeenCalledWith('Evening films');
    });

    it.each(['', '   ', '\n\t', 'x'.repeat(MAX_SAVED_VOD_NAME_LENGTH + 1)])(
        'keeps invalid names in the dialog for correction',
        (name) => {
            component.name.setValue(name);
            component.submit();
            expect(component.name.invalid).toBe(true);
            expect(component.name.touched).toBe(true);
            expect(close).not.toHaveBeenCalled();
        }
    );

    it('accepts the persisted name limit after trimming', () => {
        const name = 'x'.repeat(MAX_SAVED_VOD_NAME_LENGTH);
        component.name.setValue(`  ${name}  `);
        component.submit();
        expect(close).toHaveBeenCalledWith(name);
    });

    it('disables submission for whitespace and submits valid input through the form', () => {
        const fixture = TestBed.createComponent(
            SavedVodPlaylistNameDialogComponent
        );
        fixture.detectChanges();
        const input: HTMLInputElement =
            fixture.nativeElement.querySelector('input');
        const submit: HTMLButtonElement =
            fixture.nativeElement.querySelector('[type="submit"]');
        input.value = '   ';
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        expect(submit.disabled).toBe(true);
        input.value = '  Next weekend  ';
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        expect(submit.disabled).toBe(false);
        fixture.nativeElement
            .querySelector('form')
            .dispatchEvent(new Event('submit', { cancelable: true }));
        expect(close).toHaveBeenCalledWith('Next weekend');
    });
});
