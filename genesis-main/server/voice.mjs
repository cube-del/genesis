import { spawn } from 'node:child_process';
import path from 'node:path';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { buildVisualRecipe } from '../public/visual-recipe.js';

// Pass diary data through UTF-8 stdin. Uses SSML with natural pauses & prosody,
// prefers OneCore Russian voices (Pavel/Irina matched to day atmosphere), and
// falls back cleanly to System.Speech SAPI.
const command = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
$entry = [Console]::In.ReadToEnd() | ConvertFrom-Json
$done = $false
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime]
  $null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime]
  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
  function AwaitWinRT($op, $resultType) {
    $t = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
    $t.Wait()
    return $t.Result
  }
  $ws = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
  $ru = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Language -like 'ru*' }
  if ($ru) {
    $want = if ($entry.gender -eq 'male') { 'Male' } else { 'Female' }
    $pick = ($ru | Where-Object { $_.Gender.ToString() -eq $want } | Select-Object -First 1)
    if (-not $pick) { $pick = $ru | Select-Object -First 1 }
    $ws.Voice = $pick
    $stream = AwaitWinRT ($ws.SynthesizeSsmlToStreamAsync([string]$entry.ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $size = [uint32]$stream.Size
    if ($size -gt 44) {
      $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
      $null = AwaitWinRT ($reader.LoadAsync($size)) ([uint32])
      $bytes = New-Object byte[] $size
      $reader.ReadBytes($bytes)
      [System.IO.File]::WriteAllBytes([string]$entry.path, $bytes)
      $reader.Dispose()
      $done = $true
    }
    $stream.Dispose()
  }
  $ws.Dispose()
} catch { $done = $false }

if (-not $done) {
  Add-Type -AssemblyName System.Speech
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try {
    $ru = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq 'ru' }
    if (-not $ru) { exit 3 }
    $want = if ($entry.gender -eq 'male') { 'Male' } else { 'Female' }
    $selected = ($ru | Where-Object { $_.VoiceInfo.Gender.ToString() -eq $want } | Select-Object -First 1)
    if (-not $selected) { $selected = $ru | Select-Object -First 1 }
    $synth.SelectVoice($selected.VoiceInfo.Name)
    $synth.Rate = [int]$entry.rate
    $synth.SetOutputToWaveFile([string]$entry.path)
    try { $synth.SpeakSsml([string]$entry.ssml) }
    catch { $synth.Speak([string]$entry.speech) }
  } finally { $synth.Dispose() }
}
`;

function spokenText(day) {
  const full = String(day.text || day.quote || '').replace(/\s+/gu, ' ').trim();
  if (full.length <= 560) return full;
  const slice = full.slice(0, 560);
  const stop = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
  return (stop > 140 ? slice.slice(0, stop + 1) : slice.replace(/\s+\S*$/u, '')).trim() || String(day.quote || '');
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function buildSsml(text, voice) {
  const ratePct = Math.round(Math.max(82, Math.min(114, (voice.rate || 0.96) * 100))) + '%';
  const pitchDelta = Math.round(((voice.pitch || 1) - 1) * 100);
  const pitchAttr = (pitchDelta >= 0 ? '+' : '') + Math.max(-8, Math.min(6, pitchDelta)) + '%';
  // Insert soft natural breathing pauses at sentence boundaries and long dashes.
  const body = escapeXml(text)
    .replace(/([.!?…]+)\s+/gu, '$1<break time="360ms"/> ')
    .replace(/([,;:])\s+/gu, '$1<break time="140ms"/> ')
    .replace(/\s+[—–]\s+/gu, '<break time="180ms"/> — ');
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ru-RU"><prosody rate="${ratePct}" pitch="${pitchAttr}">${body}</prosody></speak>`;
}

// Gentle warm mastering pass on 16-bit PCM WAV: softens harsh SAPI sibilance,
// adds warm low-mid body, a subtle intimate room tail, and smooth fades.
function masterVoiceWav(buf, warmth = 0.6) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return buf;
  let offset = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4), size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') fmt = { audioFormat: buf.readUInt16LE(offset + 8), ch: buf.readUInt16LE(offset + 10), rate: buf.readUInt32LE(offset + 12), bits: buf.readUInt16LE(offset + 22) };
    if (id === 'data') { dataOff = offset + 8; dataLen = Math.min(size, buf.length - dataOff); break; }
    offset += 8 + size + (size & 1);
  }
  if (!fmt || fmt.audioFormat !== 1 || fmt.bits !== 16 || fmt.ch < 1 || dataOff < 0 || dataLen < 64) return buf;
  const frames = Math.floor(dataLen / (2 * fmt.ch));
  const rate = fmt.rate;
  const out = Buffer.from(buf);
  const cutoffHz = Math.round(6200 - warmth * 2000);
  const lpA = (1 / rate) / ((1 / (2 * Math.PI * cutoffHz)) + (1 / rate));
  const hpA = (1 / (2 * Math.PI * 80)) / ((1 / (2 * Math.PI * 80)) + (1 / rate));
  const d1 = Math.round(rate * .029), d2 = Math.round(rate * .053), d3 = Math.round(rate * .083);
  const fadeIn = Math.min(frames, Math.round(rate * .08));
  const fadeOut = Math.min(frames, Math.round(rate * .18));

  for (let c = 0; c < fmt.ch; c++) {
    const dry = new Float32Array(frames);
    let hpY = 0, hpX = 0, lpY = 0, bodyY = 0;
    const bodyA = (1 / rate) / ((1 / (2 * Math.PI * 300)) + (1 / rate));
    for (let i = 0; i < frames; i++) {
      const x = buf.readInt16LE(dataOff + (i * fmt.ch + c) * 2) / 32768;
      // Remove DC/sub-80Hz rumble
      hpY = hpA * (hpY + x - hpX);
      hpX = x;
      // Soften harsh metallic highs
      lpY += lpA * (hpY - lpY);
      // Warm low-mid body presence
      bodyY += bodyA * (lpY - bodyY);
      dry[i] = lpY + bodyY * (.18 + warmth * .14);
    }
    // Subtle warm room reflection so voice feels intimate rather than dry/robotic
    const wet = new Float32Array(dry);
    for (let i = 0; i < frames; i++) {
      let r = 0;
      if (i >= d1) r += dry[i - d1] * .09;
      if (i >= d2) r += dry[i - d2] * .06;
      if (i >= d3) r += wet[i - d3] * .045;
      wet[i] = dry[i] + r * (.7 + warmth * .45);
    }
    let peak = 0;
    for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(wet[i]));
    const norm = peak > 0.01 ? Math.min(1.4, 0.84 / peak) : 1;
    for (let i = 0; i < frames; i++) {
      let env = 1;
      if (i < fadeIn) env *= i / fadeIn;
      if (i > frames - fadeOut) env *= (frames - i) / fadeOut;
      const sample = Math.tanh(wet[i] * norm * 1.08) * 0.92 * env;
      out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(sample * 32767))), dataOff + (i * fmt.ch + c) * 2);
    }
  }
  return out;
}

let unavailable = false;
export async function synthesizeVoice(folder, day) {
  if (!day.voice || process.platform !== 'win32' || unavailable) return false;
  const filename = path.join(folder, 'voiceover.wav');
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const { voice } = buildVisualRecipe(day);
  const speech = spokenText(day);
  const ssml = buildSsml(speech, voice);
  const exitCode = await new Promise(resolve => {
    const processHandle = spawn(executable, ['-NoLogo', '-NonInteractive', '-NoProfile', '-Command', command], {
      windowsHide: true, stdio: ['pipe', 'ignore', 'ignore']
    });
    const deadline = setTimeout(() => processHandle.kill(), 16000);
    processHandle.once('error', () => { clearTimeout(deadline); resolve(-1); });
    processHandle.once('close', code => { clearTimeout(deadline); resolve(code); });
    processHandle.stdin.on('error', () => {});
    processHandle.stdin.end(JSON.stringify({ path: filename, speech, ssml, rate: voice.sapiRate, gender: voice.gender }));
  });
  if (exitCode === 0 && (await stat(filename).catch(() => null))?.size > 44) {
    try {
      const raw = await readFile(filename);
      await writeFile(filename, masterVoiceWav(raw, voice.warmth));
    } catch { /* Keep raw WAV if post-processing fails. */ }
    return true;
  }
  if (exitCode === 3 || exitCode === -1) unavailable = true;
  await rm(filename, { force: true }).catch(() => {});
  return false;
}
