import { test as base, expect } from './fixtures';

/**
 * Portal specs intercept this backend's registration/proxy requests. Keep
 * production PWA builds on the same mock path, including new tabs and reloads.
 * Service workers must not consume requests before Playwright can route them.
 * Real backend and offline/PWA specs retain the general fixtures instead.
 */
export const test = base.extend({
    serviceWorkers: 'block',
    context: async ({ context }, use) => {
        await context.addInitScript((backendUrl: string) => {
            const browserWindow = window as Window & {
                __IPTVNATOR_CONFIG__?: { BACKEND_URL?: string };
            };
            browserWindow.__IPTVNATOR_CONFIG__ = {
                ...browserWindow.__IPTVNATOR_CONFIG__,
                BACKEND_URL: backendUrl,
            };
        }, 'http://localhost:3000');
        await use(context);
    },
});

export { expect };
