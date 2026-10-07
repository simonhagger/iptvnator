import { app } from 'electron';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { initializeDistributionProfile } from './distribution-profile';

initializeDistributionProfile({
    app,
    env: process.env,
    homeDirectory: homedir(),
    readMetadata: (file) => JSON.parse(readFileSync(file, 'utf8')),
    ensureDirectory: (directory) => {
        mkdirSync(directory, { recursive: true });
    },
});
