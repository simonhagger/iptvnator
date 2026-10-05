import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Watch progress in app chrome reads one theme token, so a title's bar on a
// rail card, in the hero and in a catalog grid is the same colour. Live
// programme progress keeps the live accent (see the UI guidelines).
function styles(file: string): string {
    return readFileSync(resolve(__dirname, file), 'utf8');
}

/** The declarations of the first `selector { … }` rule, nesting excluded. */
function ruleBody(source: string, selector: RegExp): string {
    return (
        source.match(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`))?.[1] ??
        ''
    );
}

describe('dashboard watch-progress colour', () => {
    it('uses the shared cover capsule and its watch-progress token for rail artwork', () => {
        const rail = styles('dashboard-rail.component.html');
        const indicators = styles(
            '../../../../../../portal/shared/ui/src/lib/components/content-cover/content-cover-indicators.component.ts'
        );
        const capsule = styles(
            '../../../../../../ui/components/src/lib/progress-capsule/progress-capsule.component.ts'
        );
        expect(rail).toContain('<app-content-cover-indicators');
        expect(indicators).toContain('<app-progress-capsule');
        expect(ruleBody(capsule, /&__fill/)).toMatch(
            /background:\s*var\(--app-progress-color\);/
        );
    });

    it('fills the hero resume bar with the token and live bars with the live accent', () => {
        const hero = styles('dashboard-hero.component.scss');
        const bar = hero.slice(hero.indexOf('.hero__progress {'));

        expect(ruleBody(bar, /\bi/)).toMatch(
            /background:\s*var\(--app-progress-color\);/
        );
        expect(ruleBody(bar, /&--live i/)).toMatch(
            /background:\s*var\(--app-live-color\b/
        );
    });
});
