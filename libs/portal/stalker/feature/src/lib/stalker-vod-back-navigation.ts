import type { Location } from '@angular/common';
import type { Router } from '@angular/router';
import {
    consumeStalkerReturnMarker,
    resolveStalkerBackNavigation,
} from '@iptvnator/portal/shared/util';

/** Closing the detail is unconditional; only the navigation uses the marker. */
export function leaveStalkerVodDetail(deps: {
    readonly item: Parameters<typeof resolveStalkerBackNavigation>[1];
    readonly close: () => void;
    readonly location: Pick<Location, 'back'>;
    readonly router: Pick<Router, 'navigateByUrl'>;
}): void {
    const back = resolveStalkerBackNavigation(window.history.state, deps.item);
    deps.close();
    if (back.kind === 'history-back') {
        // Retire once so browser Forward cannot replay an earlier handoff.
        consumeStalkerReturnMarker();
        deps.location.back();
    } else if (back.kind === 'navigate') {
        void deps.router.navigateByUrl(back.url);
    }
}
