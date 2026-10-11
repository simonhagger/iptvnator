/**
 * Only an explicit episode wire type establishes history provenance.
 * Legacy `series` rows may name a parent or a directly played episode;
 * leaving them unmarked preserves parent-first, episode-fallback resolution.
 */
export function resolveXtreamRecentHistoryType(
    rawType: unknown
): 'episode' | undefined {
    return rawType === 'episode' ? 'episode' : undefined;
}
