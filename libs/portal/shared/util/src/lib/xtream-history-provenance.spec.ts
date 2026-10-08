import { resolveXtreamRecentHistoryType } from './xtream-history-provenance';

describe('Xtream raw history provenance', () => {
    it('retains explicit episode ownership', () => {
        expect(resolveXtreamRecentHistoryType('episode')).toBe('episode');
    });

    it.each(['series', 'movie', 'vod', 'live', undefined, null, '', 0, {}])(
        'does not invent parent or episode provenance from %p',
        (rawType) => {
            expect(resolveXtreamRecentHistoryType(rawType)).toBeUndefined();
        }
    );
});
