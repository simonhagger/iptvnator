import type {
    OnBeforeSendHeadersListenerDetails,
    OnHeadersReceivedListenerDetails,
} from 'electron';

type Request = { origin: string; url: string };

/** Only the playback owner can seed requests; redirect grants never become global. */
export class StreamCorsScope {
    private source: URL | null = null;
    private owner: number | undefined;
    private requests = new Map<number, Request>();
    private playlists = new Set<string>();

    release(url: string | null | undefined, owner: number): boolean {
        if (this.owner !== owner || !url) return false;
        try {
            if (this.source?.href !== new URL(url).href) return false;
        } catch {
            return false;
        }
        this.configure();
        return true;
    }

    configure(url?: string | null, owner?: number): void {
        this.source = null;
        this.owner = owner;
        this.requests.clear();
        this.playlists.clear();
        if (!url || !owner) return;
        try {
            const parsed = new URL(url);
            if (['http:', 'https:'].includes(parsed.protocol))
                this.source = parsed;
        } catch {
            /* Invalid scopes remain disabled. */
        }
    }

    beforeRequest(details: OnBeforeSendHeadersListenerDetails): void {
        if (
            !this.source ||
            details.webContentsId !== this.owner ||
            details.method !== 'GET' ||
            !['xhr', 'media'].includes(details.resourceType)
        )
            return;
        let url: URL;
        try {
            url = new URL(details.url);
        } catch {
            return;
        }
        if (!['http:', 'https:'].includes(url.protocol)) return;
        const tracked = this.requests.get(details.id);
        const segment = [...this.playlists].some((parent) => {
            const base = new URL(parent);
            return (
                url.origin === base.origin &&
                url.pathname.startsWith(
                    base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1)
                ) &&
                /\.(m3u8|ts|m4s|mp4|aac|key)$/i.test(url.pathname)
            );
        });
        if (!tracked && url.href !== this.source.href && !segment) return;
        const originHeader = Object.entries(details.requestHeaders).find(
            ([name]) => name.toLowerCase() === 'origin'
        )?.[1];
        // Redirected fetches may use an opaque "null" origin. No credentials grant.
        this.requests.set(details.id, {
            url: url.href,
            origin: originHeader || tracked?.origin || 'null',
        });
    }

    response(
        details: OnHeadersReceivedListenerDetails
    ): Record<string, string[]> | undefined {
        const request = this.requests.get(details.id);
        if (!request || details.webContentsId !== this.owner) return;
        if (
            details.statusCode >= 200 &&
            details.statusCode < 300 &&
            new URL(details.url).pathname.endsWith('.m3u8')
        )
            this.playlists.add(details.url);
        const headers = { ...details.responseHeaders };
        if (
            Object.keys(headers).some(
                (key) => key.toLowerCase() === 'access-control-allow-origin'
            )
        )
            return;
        headers['Access-Control-Allow-Origin'] = [request.origin];
        return headers;
    }

    finish(id: number): void {
        this.requests.delete(id);
    }
}
