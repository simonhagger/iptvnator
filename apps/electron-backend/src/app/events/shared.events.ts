import { ipcMain } from 'electron';
import {
    configureRequestHeaderOverride,
    releaseStreamHeaderOverride,
    releaseRendererStreamHeaderOverride,
    type StreamCredentialHeaders,
} from '../services/request-header-overrides.service';

export default class SharedEvents {
    static bootstrapSharedEvents(): Electron.IpcMain {
        return ipcMain;
    }
}

function sanitizeCredentials(value: unknown): StreamCredentialHeaders | null {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    const { cookie, authorization } = value as Record<string, unknown>;
    return {
        authorization:
            typeof authorization === 'string' ? authorization : undefined,
        cookie: typeof cookie === 'string' ? cookie : undefined,
    };
}

const observedOwners = new WeakSet<Electron.WebContents>();
function observeStreamOwner(owner: Electron.WebContents): void {
    if (observedOwners.has(owner)) return;
    observedOwners.add(owner);
    const revoke = () => releaseRendererStreamHeaderOverride(owner.id);
    owner.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) revoke();
    });
    owner.on('render-process-gone', revoke);
    owner.once('destroyed', revoke);
}

ipcMain.handle(
    'set-user-agent',
    (event, userAgent, referer, scopeUrl, credentials, operation) => {
        if (operation === 'release') {
            releaseStreamHeaderOverride(scopeUrl, event.sender.id);
            return true;
        }
        if (typeof scopeUrl === 'string') observeStreamOwner(event.sender);
        setUserAgent(
            userAgent,
            referer,
            scopeUrl,
            sanitizeCredentials(credentials),
            event.sender.id
        );
        return true;
    }
);

/**
 * Sets scoped request headers for the currently selected stream.
 * @param userAgent user agent to use
 * @param referer referer to use
 * @param scopeUrl stream URL used to limit the override to the active origin
 * @param credentials portal Cookie/Authorization for auth-gated streams;
 *   applied only to the exact origin of `scopeUrl` and only while the
 *   scoped override is active
 */
export function setUserAgent(
    userAgent?: string | null,
    referer?: string | null,
    scopeUrl?: string | null,
    credentials?: StreamCredentialHeaders | null,
    ownerWebContentsId?: number
): void {
    configureRequestHeaderOverride(
        userAgent,
        referer,
        scopeUrl,
        credentials,
        ownerWebContentsId
    );
}
