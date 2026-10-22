import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const pluginFiles = ['main.js', 'manifest.json', 'styles.css'];

export async function regularFiles(root, names) {
  const files = names.map(name => resolve(root, name));
  for (const file of files) {
    if (!(await lstat(file)).isFile()) throw new Error('Release input must be a regular file: ' + file);
  }
  return files;
}

export async function windowsFiles(root) {
  const { version } = JSON.parse(await readFile(resolve(root, 'installer/package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid installer version');
  return regularFiles(root, [`installer/dist/Context-Anywhere-${version}-win-x64.zip`, 'installer/dist/SHA256SUMS.txt']);
}

export async function provenanceSubjects(root) {
  const files = await regularFiles(root, pluginFiles);
  return Promise.all(files.map(async (file, index) => ({
    name: pluginFiles[index], digest: { sha256: createHash('sha256').update(await readFile(file)).digest('hex') }
  })));
}
