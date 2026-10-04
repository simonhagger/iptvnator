import type { ValidatorFn } from '@angular/forms';
import { MAX_SAVED_VOD_NAME_LENGTH } from '@iptvnator/shared/interfaces';

/** Form adapters share the persisted trimmed-name limit. */
export const savedVodPlaylistNameValidator: ValidatorFn = (control) => {
    const length =
        typeof control.value === 'string' ? control.value.trim().length : 0;
    return length > 0 && length <= MAX_SAVED_VOD_NAME_LENGTH
        ? null
        : { invalidName: true };
};
