import { spawn } from 'node:child_process';
import path from 'node:path';
import { rm, stat } from 'node:fs/promises';

// Pass diary data through UTF-8 stdin. Neither the path nor the entry becomes shell code.
const command = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
$entry = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $selected = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq 'ru' } | Select-Object -First 1
  if (-not $selected) { exit 3 }
  $synth.SelectVoice($selected.VoiceInfo.Name)
  $synth.Rate = [int]$entry.rate
  $synth.SetOutputToWaveFile([string]$entry.path)
  $synth.Speak([string]$entry.quote)
} finally { $synth.Dispose() }
`;

let unavailable = false;
export async function synthesizeVoice(folder, day) {
  if (!day.voice || process.platform !== 'win32' || unavailable) return false;
  const filename = path.join(folder, 'voiceover.wav');
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const exitCode = await new Promise(resolve => {
    const processHandle = spawn(executable, ['-NoLogo', '-NonInteractive', '-NoProfile', '-Command', command], {
      windowsHide: true, stdio: ['pipe', 'ignore', 'ignore']
    });
    const deadline = setTimeout(() => processHandle.kill(), 6500);
    processHandle.once('error', () => { clearTimeout(deadline); resolve(-1); });
    processHandle.once('close', code => { clearTimeout(deadline); resolve(code); });
    processHandle.stdin.on('error', () => {});
    processHandle.stdin.end(JSON.stringify({ path: filename, quote: day.quote, rate: day.energy > .7 ? 1 : -1 }));
  });
  if (exitCode === 0 && (await stat(filename).catch(() => null))?.size > 44) return true;
  if (exitCode === 3 || exitCode === -1) unavailable = true;
  await rm(filename, { force: true }).catch(() => {});
  return false;
}
