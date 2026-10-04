import type {
    OnBeforeSendHeadersListenerDetails,
    OnHeadersReceivedListenerDetails,
} from 'electron';
import { StreamCorsScope } from './stream-cors.service';

const source = 'https://provider.example/live/user/secret/123.ts';
const request = (url = source, changes = {}) =>
    ({
        id: 1,
        referrer: '',
        timestamp: 0,
        url,
        method: 'GET',
        resourceType: 'xhr',
        webContentsId: 7,
        requestHeaders: { Origin: 'http://localhost:4200' },
        ...changes,
    }) as OnBeforeSendHeadersListenerDetails;
const response = (url = source, changes = {}) =>
    ({
        id: 1,
        method: 'GET',
        resourceType: 'xhr',
        referrer: '',
        timestamp: 0,
        statusLine: 'HTTP/1.1 302 Found',
        url,
        statusCode: 302,
        webContentsId: 7,
        responseHeaders: { Location: ['https://cdn.example/channel.ts'] },
        ...changes,
    }) as OnHeadersReceivedListenerDetails;

describe('active stream CORS scope', () => {
    it.each(['stream.M3U8', 'stream.m3u', 'stream?format=hls'])(
        'grants same-directory video and captions after %s loads',
        (name) => {
            const playlist = `https://provider.example/live/${name}`;
            scope.configure(playlist, 7);
            scope.beforeRequest(request(playlist));
            scope.response(response(playlist, { statusCode: 200 }));
            scope.finish(1);
            for (const [index, file] of [
                'chunk.ts',
                'captions.vtt',
            ].entries()) {
                const url = `https://provider.example/live/${file}`;
                const id = index + 2;
                scope.beforeRequest(request(url, { id }));
                expect(
                    scope.response(response(url, { id }))?.[
                        'Access-Control-Allow-Origin'
                    ]
                ).toBeDefined();
            }
        }
    );
    let scope: StreamCorsScope;
    beforeEach(() => {
        scope = new StreamCorsScope();
        scope.configure(source, 7);
    });

    it('repairs a missing redirect header without changing status or Location', () => {
        scope.beforeRequest(request());
        expect(scope.response(response())).toEqual({
            Location: ['https://cdn.example/channel.ts'],
            'Access-Control-Allow-Origin': ['http://localhost:4200'],
        });
    });
    it('tracks the same request across origins, including an opaque redirect origin', () => {
        scope.beforeRequest(request());
        scope.beforeRequest(
            request('https://cdn.example/channel.ts', {
                requestHeaders: { Origin: 'null' },
            })
        );
        expect(
            scope.response(
                response('https://cdn.example/channel.ts', { statusCode: 200 })
            )?.['Access-Control-Allow-Origin']
        ).toEqual(['null']);
    });
    it.each([
        request('https://provider.example/player_api.php'),
        request('https://unrelated.example/movie.ts'),
        request(source, { webContentsId: 8 }),
        request(source, { resourceType: 'script' }),
        request(source, { method: 'POST' }),
    ])('does not grant unrelated requests %#', (details) => {
        scope.beforeRequest(details);
        expect(scope.response(response())).toBeUndefined();
    });
    it('does not overwrite explicit provider CORS policy', () => {
        scope.beforeRequest(request());
        expect(
            scope.response(
                response(source, {
                    responseHeaders: {
                        'access-control-allow-origin': [
                            'https://other.example',
                        ],
                    },
                })
            )
        ).toBeUndefined();
    });
    it('revokes in-flight grants on source replacement and close', () => {
        scope.beforeRequest(request());
        scope.configure('https://provider.example/other.ts', 7);
        expect(scope.response(response())).toBeUndefined();
        scope.beforeRequest(request('https://provider.example/other.ts'));
        scope.configure();
        expect(scope.response(response())).toBeUndefined();
    });
    it('forgets completed requests', () => {
        scope.beforeRequest(request());
        scope.finish(1);
        expect(scope.response(response())).toBeUndefined();
    });
    it('allows HLS child media in the successful playlist directory only', () => {
        const playlist = 'https://provider.example/live/user/secret/123.m3u8';
        scope.configure(playlist, 7);
        scope.beforeRequest(request(playlist));
        scope.response(response(playlist, { statusCode: 200 }));
        scope.finish(1);
        scope.beforeRequest(
            request('https://provider.example/live/user/secret/chunk.ts', {
                id: 2,
            })
        );
        expect(
            scope.response(
                response('https://provider.example/live/user/secret/chunk.ts', {
                    id: 2,
                })
            )?.['Access-Control-Allow-Origin']
        ).toBeDefined();
        scope.beforeRequest(
            request('https://provider.example/private/chunk.ts', { id: 3 })
        );
        expect(
            scope.response(
                response('https://provider.example/private/chunk.ts', { id: 3 })
            )
        ).toBeUndefined();
    });
});
