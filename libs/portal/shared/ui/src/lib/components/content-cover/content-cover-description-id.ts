let nextDescriptionId = 0;

/** View-instance IDs only; no persisted or provider identity is derived here. */
export function createContentCoverDescriptionId(): string {
    return `content-cover-description-${nextDescriptionId++}`;
}
