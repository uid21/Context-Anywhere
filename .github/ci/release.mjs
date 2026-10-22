import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { regularFiles, pluginFiles, windowsFiles } from './files.mjs';
import { verifyRuntime } from './verify-runtime.mjs';

export async function publish(kind, { root = process.cwd(), env = process.env, execute = spawnSync } = {}) {
  const tag = env.GITHUB_REF_NAME;
  const repo = env.GITHUB_REPOSITORY;
  if (!repo || !tag || !env.GH_TOKEN) throw new Error('Release context and GH_TOKEN are required');
  const setup = kind === 'windows';
  if (!setup && kind !== 'plugin') throw new Error('Unknown release kind');
  const metadata = JSON.parse(await readFile(resolve(root, setup ? 'installer/package.json' : 'manifest.json'), 'utf8'));
  if (tag !== (setup ? 'windows-setup-v' : '') + metadata.version) throw new Error('Release tag does not match package version');
  const files = [...(setup ? await windowsFiles(root) : []), ...await regularFiles(root, pluginFiles)];
  const notes = resolve(root, 'installer/RELEASE-NOTES.md');
  if (setup) await regularFiles(root, ['installer/RELEASE-NOTES.md']);
  const gh = args => execute('gh', args, { encoding: 'utf8', env, windowsHide: true });
  const checked = args => {
    const result = gh(args);
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || 'GitHub CLI failed');
    if (result.stdout) console.log(result.stdout.trim());
    return result;
  };
  // Authenticate with the runner's GitHub CLI (Go). No release Action bundle,
  // JavaScript HTTP client or Git credentials are involved in publication.
  const existing = gh(['api', `repos/${repo}/releases/tags/${encodeURIComponent(tag)}`]);
  if (existing.error) throw existing.error;
  if (existing.status === 0) {
    // Reruns may replace assets, but never turn an existing public release back
    // into a draft or silently publish a draft.
    const release = JSON.parse(existing.stdout);
    if (setup && (!release.draft || !release.prerelease)) throw new Error('Windows setup target is not an unpublished prerelease draft');
    checked(['release', 'upload', tag, ...files, '--repo', repo, '--clobber']);
  } else if (/\b404\b/.test(existing.stderr || '')) {
    checked(['release', 'create', tag, ...files, '--repo', repo, '--verify-tag',
      ...(setup ? ['--draft', '--prerelease', '--title', 'Context Anywhere Windows Setup', '--notes-file', notes] : ['--generate-notes'])]);
  } else {
    throw new Error(existing.stderr || 'Cannot check existing release');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  verifyRuntime();
  await publish(process.argv[2]);
}
