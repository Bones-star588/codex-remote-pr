import readline from 'node:readline';

import { authFilePath, setPassword } from '../auth.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

try {
  const envPassword = process.env.CODEX_REMOTE_PASSWORD?.trim();
  const password = envPassword || (await question('New access password (6+ chars): ')).trim();
  const confirm = envPassword || (await question('Confirm password: ')).trim();
  if (password !== confirm) {
    throw new Error('Passwords do not match.');
  }
  await setPassword(password);
  console.log(`Password saved to ${authFilePath()}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  rl.close();
}
