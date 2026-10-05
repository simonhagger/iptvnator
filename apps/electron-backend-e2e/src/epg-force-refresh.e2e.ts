import {
    closeElectronApp,
    createMutableTextServer,
    expect,
    launchElectronApp,
    type MutableTextServer,
    openSettings,
    openSettingsSection,
    saveSettings,
    test,
} from './electron-test-fixtures';

function guide(channel: string, title: string): string {
    const timestamp = (date: Date) =>
        `${date.toISOString().replace(/\D/g, '').slice(0, 14)} +0000`;
    const start = timestamp(new Date(Date.now() - 15 * 60 * 1000));
    const stop = timestamp(new Date(Date.now() + 45 * 60 * 1000));
    return `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="${channel}"><display-name>${channel}</display-name></channel>
  <programme start="${start}" stop="${stop}" channel="${channel}">
    <title>${title}</title>
  </programme>
</tv>`;
}

for (const mode of ['single source', 'all sources'] as const) {
    test(`@epg @electron refreshes fresh XMLTV data from Settings for ${mode}`, async ({
        dataDir,
    }) => {
        const channels =
            mode === 'all sources' ? ['force-one', 'force-two'] : ['force-one'];
        const servers: MutableTextServer[] = [];
        let launched: Awaited<ReturnType<typeof launchElectronApp>> | undefined;
        try {
            for (const channel of channels) {
                servers.push(
                    await createMutableTextServer(
                        guide(channel, `${channel} original`),
                        {
                            contentType: 'application/xml; charset=utf-8',
                            resourcePath: '/guide.xml',
                        }
                    )
                );
            }
            const app = await launchElectronApp(dataDir);
            launched = app;
            const titles = () =>
                app.mainWindow.evaluate(
                    async (ids) =>
                        Promise.all(
                            ids.map(async (id) =>
                                (
                                    await window.electron.getChannelPrograms(id)
                                ).map((program) => program.title)
                            )
                        ),
                    channels
                );
            await openSettings(app.mainWindow);
            await openSettingsSection(app.mainWindow, 'epg');
            for (const [index, server] of servers.entries()) {
                await app.mainWindow
                    .getByRole('button', { name: 'Add EPG source' })
                    .click();
                await app.mainWindow
                    .locator('.epg-source-row input')
                    .nth(index)
                    .fill(server.resourceUrl);
            }
            // Exercise actual saved settings and the parser/database worker.
            await saveSettings(app.mainWindow);
            const originals = channels.map((channel) => [
                `${channel} original`,
            ]);
            await expect.poll(titles, { timeout: 30000 }).toEqual(originals);

            servers.forEach((server, index) =>
                server.setBody(
                    guide(channels[index], `${channels[index]} updated`)
                )
            );
            const automatic = await app.mainWindow.evaluate(
                (urls) => window.electron.fetchEpg(urls),
                servers.map((server) => server.resourceUrl)
            );
            expect(automatic.success).toBe(true);
            expect(automatic.skipped).toEqual(
                servers.map((server) => server.resourceUrl)
            );
            expect(await titles()).toEqual(originals);

            if (mode === 'single source') {
                await app.mainWindow.getByTestId('epg-source-refresh').click();
            } else {
                await app.mainWindow
                    .getByRole('button', { name: 'Refresh all', exact: true })
                    .click();
            }
            await expect
                .poll(titles, { timeout: 30000 })
                .toEqual(channels.map((channel) => [`${channel} updated`]));
            await expect(
                app.mainWindow.locator(
                    '.epg-progress-panel .import-item.status-complete'
                )
            ).toHaveCount(channels.length);
        } finally {
            try {
                if (launched) await closeElectronApp(launched);
            } finally {
                await Promise.all(servers.map((server) => server.close()));
            }
        }
    });
}
