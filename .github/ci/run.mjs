import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { verifyRuntime } from './verify-runtime.mjs';
import { windowsFiles, provenanceSubjects } from './files.mjs';

// Check before importing any network client. The SDK implementation is installed
// from our lockfile; none of the upstream Actions' embedded bundles is executed.
console.log(verifyRuntime());
const core = await import('@actions/core');
try {
  const root = process.env.GITHUB_WORKSPACE || process.cwd();
  switch (core.getInput('operation', { required: true })) {
    case 'upload': {
      const { DefaultArtifactClient } = await import('@actions/artifact');
      const result = await new DefaultArtifactClient().uploadArtifact(
        'Context-Anywhere-Windows-Setup', await windowsFiles(root), resolve(root, 'installer/dist'),
        { compressionLevel: 0 }
      );
      if (!result.id) throw new Error('GitHub did not return an artifact ID');
      core.setOutput('artifact-id', result.id);
      const url = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/artifacts/${result.id}`;
      core.setOutput('artifact-url', url);
      await core.summary.addLink('Download Windows setup', url).write();
      break;
    }
    case 'attest': {
      const { attestProvenance } = await import('@actions/attest');
      const result = await attestProvenance({ subjects: await provenanceSubjects(root), token: core.getInput('github-token', { required: true }) });
      if (!result.attestationID) throw new Error('GitHub did not store the build attestation');
      const bundlePath = join(process.env.RUNNER_TEMP, 'context-anywhere-provenance.json');
      await writeFile(bundlePath, JSON.stringify(result.bundle) + '\n');
      core.setOutput('bundle-path', bundlePath);
      core.setOutput('attestation-id', result.attestationID);
      await core.summary.addLink('Build provenance', `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/attestations/${result.attestationID}`).write();
      break;
    }
    default: throw new Error('Unsupported release service operation');
  }
} catch (error) {
  core.setFailed(error);
}
