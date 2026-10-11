import fs from 'node:fs';
import path from 'node:path';
import { buildElectronBuilderMetadata } from './generate-electron-builder-metadata.mjs';

/** Overlay verification uses the same inherited identity as electron-builder. */
export function resolvePackageVerificationConfig(
    workspaceRoot,
    overlayPath,
    outputPath
) {
    const readJson = (file) =>
        JSON.parse(fs.readFileSync(path.resolve(workspaceRoot, file), 'utf8'));
    const packageMetadata = readJson('package.json');
    const base = readJson('electron-builder.json');
    const overlay = overlayPath ? readJson(overlayPath) : {};
    const electronBuilderConfig = {
        ...base,
        ...overlay,
        extraMetadata: { ...base.extraMetadata, ...overlay.extraMetadata },
        win: { ...base.win, ...overlay.win },
        nsis: { ...base.nsis, ...overlay.nsis },
    };
    return {
        packageMetadata,
        electronBuilderConfig,
        packagedPackageMetadata: {
            ...buildElectronBuilderMetadata(
                packageMetadata,
                electronBuilderConfig
            ).extraMetadata,
            ...(overlay.extraMetadata ?? {}),
        },
        packageOutputRoots: outputPath
            ? [path.resolve(workspaceRoot, outputPath)]
            : ['dist/executables', 'dist/packages'].map((directory) =>
                  path.join(workspaceRoot, directory)
              ),
    };
}
