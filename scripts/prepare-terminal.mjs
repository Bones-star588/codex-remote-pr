import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// node-pty 1.1.0 ships macOS prebuilt helpers without executable permissions.
// https://github.com/microsoft/node-pty/issues/850
if (process.platform === 'darwin') {
  const require = createRequire(import.meta.url);
  const packageDirectory = path.dirname(require.resolve('node-pty/package.json'));
  const helper = path.join(packageDirectory, 'prebuilds', `darwin-${process.arch}`, 'spawn-helper');
  if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
}
