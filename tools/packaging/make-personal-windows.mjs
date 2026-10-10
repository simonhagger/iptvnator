import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { resolvePackageVerificationConfig } from './package-verification-config.mjs';

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(import.meta.url);
const defaultOutputPath = 'dist/personal/windows-x64';

/** Keep dependency discovery in the workspace; only the copied metadata is staged. */
export function createPersonalWindowsBuildOptions(
    workspaceRoot,
    metadataDirectory,
    outputPath = defaultOutputPath
) {
    const { electronBuilderConfig, packagedPackageMetadata } =
        resolvePackageVerificationConfig(
            workspaceRoot,
            'electron-builder.personal.json',
            outputPath
        );
    const project = JSON.parse(
        fs.readFileSync(
            path.join(workspaceRoot, 'apps/electron-backend/project.json'),
            'utf8'
        )
    );
    const options = project.targets.make.options;
    const sourcePath = path.resolve(workspaceRoot, options.sourcePath);
    const sourceMetadata = JSON.parse(
        fs.readFileSync(
            path.join(sourcePath, options.name, 'package.json'),
            'utf8'
        )
    );
    const metadata = { ...sourceMetadata, ...packagedPackageMetadata };
    const { Platform, Arch } = require('electron-builder');
    return {
        metadata,
        buildOptions: {
            projectDir: workspaceRoot,
            publish: 'never',
            // An empty target list allows inherited configuration to add ia32.
            targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
            config: {
                ...electronBuilderConfig,
                // The selected overlay is already flattened. Builder inheritance
                // concatenates target/file-association arrays rather than replacing.
                extends: null,
                directories: {
                    ...electronBuilderConfig.directories,
                    output: path.resolve(workspaceRoot, outputPath),
                },
                extraMetadata: packagedPackageMetadata,
                files: [
                    ...electronBuilderConfig.files,
                    ...options.files.map((file) => ({
                        ...file,
                        from: path.resolve(sourcePath, file.from),
                    })),
                    {
                        from: path.join(sourcePath, options.frontendProject),
                        to: options.frontendProject,
                        filter: ['**/!(*.+(js|css).map)'],
                    },
                    {
                        from: path.join(sourcePath, options.name),
                        to: options.name,
                        filter: ['main.js', '?(*.)preload.js', 'assets'],
                    },
                    // Builder transforms only its appDir/package.json. The Nx
                    // custom backend-to-root copy bypasses that transformer.
                    {
                        from: metadataDirectory,
                        to: '',
                        filter: ['package.json'],
                    },
                ],
            },
        },
    };
}

export async function makePersonalWindows({
    workspaceRoot = process.cwd(),
    outputPath = defaultOutputPath,
    build = require('electron-builder').build,
    temporaryRoot = path.join(workspaceRoot, 'dist/personal'),
} = {}) {
    fs.mkdirSync(temporaryRoot, { recursive: true });
    const ownedTemporaryRoot = fs.realpathSync(temporaryRoot);
    const metadataDirectory = fs.mkdtempSync(
        path.join(ownedTemporaryRoot, 'iptvnator-personal-package-')
    );
    try {
        const { metadata, buildOptions } = createPersonalWindowsBuildOptions(
            workspaceRoot,
            metadataDirectory,
            outputPath
        );
        fs.writeFileSync(
            path.join(metadataDirectory, 'package.json'),
            `${JSON.stringify(metadata, null, 2)}\n`
        );
        const configPath = path.join(metadataDirectory, 'builder.json');
        fs.writeFileSync(
            configPath,
            `${JSON.stringify(buildOptions.config, null, 2)}\n`
        );
        // A config object still merges with auto-discovered electron-builder.json.
        // An explicit file selects only the flattened config, with no parent merge.
        return await build({ ...buildOptions, config: configPath });
    } finally {
        // mkdtemp owns this exact directory, including failure before builder launch.
        removeOwnedMetadataDirectory(metadataDirectory, ownedTemporaryRoot);
    }
}

function removeOwnedMetadataDirectory(directory, ownedRoot) {
    if (path.dirname(path.resolve(directory)) !== ownedRoot)
        throw new Error(
            'Personal metadata staging escaped its owned directory.'
        );
    fs.rmSync(directory, { recursive: true, force: true });
}

function parseArguments(args) {
    let outputPath = defaultOutputPath;
    for (let index = 0; index < args.length; index++) {
        const argument = args[index];
        if (argument.startsWith('--outputPath='))
            outputPath = argument.slice('--outputPath='.length);
        else if (argument === '--outputPath') outputPath = args[++index];
        else
            throw new Error(
                `Unsupported personal packaging argument: ${argument}`
            );
    }
    if (!outputPath)
        throw new Error('Personal packaging outputPath is required.');
    return { outputPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
    try {
        await makePersonalWindows(parseArguments(process.argv.slice(2)));
    } catch (error) {
        process.stderr.write(
            `${error instanceof Error ? error.message : error}\n`
        );
        process.exitCode = 1;
    }
}
