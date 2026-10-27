import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const port = Number(process.argv[2] || 4546);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose an unused port from 1024 to 65535.');
const filename = new URL('../.env', import.meta.url);
let text = await fs.readFile(filename, 'utf8').catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return '';
});
text = text.split(/\r?\n/).filter(line => !/^LAN_PORT=/.test(line)).join('\n').trimEnd();
await fs.writeFile(filename, `${text}\nLAN_PORT=${port}\n`, { encoding: 'utf8', mode: 0o600 });
if (process.platform === 'win32') {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command',
    `$ErrorActionPreference = 'Stop'; $rule = Get-NetFirewallRule -DisplayName 'Codex Remote LAN' -ErrorAction SilentlyContinue; if ($rule) { $rule | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -LocalPort ${port} | Out-Null } else { New-NetFirewallRule -DisplayName 'Codex Remote LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${port} -RemoteAddress LocalSubnet -Profile Any | Out-Null }`],
  { windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) console.warn('Firewall setup requires administrator rights. Run this command as administrator if LAN access is blocked.');
}
console.log(`LAN listener configured on port ${port}. Restart Remote, then open a LAN address from the connection menu.`);
