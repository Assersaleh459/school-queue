// Pauses other apps' media (music, videos) during announcements — only what is actually
// playing — and resumes exactly that afterwards. Uses Windows' media session list (the
// same as the volume pop-up) through a small PowerShell helper that stays running, so a
// call isn't delayed by PowerShell starting up. Players that don't register with Windows
// (e.g. old VLC) are simply left alone.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ASCII only: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
const SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$mgrType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + '`' + String.raw`1' })[0]
function Await($op, [type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); [void]$task.Wait(3000); $task.Result }
$mgr = Await ($mgrType::RequestAsync()) $mgrType
$held = @()
[Console]::Out.WriteLine('{"ready":true}')
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $cmd, $id = $line.Split(' ')
  try {
    $sessions = @($mgr.GetSessions())
    if ($cmd -eq 'pause') {
      $held = @()
      foreach ($s in $sessions) {
        if ("$($s.GetPlaybackInfo().PlaybackStatus)" -eq 'Playing' -and (Await ($s.TryPauseAsync()) ([bool]))) { $held += $s.SourceAppUserModelId }
      }
      $out = @{ id = $id; paused = $held.Count; apps = @($held) }
    } elseif ($cmd -eq 'resume') {
      $n = 0
      foreach ($s in $sessions) {
        if ($held -contains $s.SourceAppUserModelId -and "$($s.GetPlaybackInfo().PlaybackStatus)" -eq 'Paused' -and (Await ($s.TryPlayAsync()) ([bool]))) { $n++ }
      }
      $held = @()
      $out = @{ id = $id; resumed = $n }
    } else {
      $out = @{ id = $id; playing = @($sessions | Where-Object { "$($_.GetPlaybackInfo().PlaybackStatus)" -eq 'Playing' } | ForEach-Object { $_.SourceAppUserModelId }) }
    }
  } catch { $out = @{ id = $id; error = $_.Exception.Message } }
  [Console]::Out.WriteLine(($out | ConvertTo-Json -Compress))
}
`;

function createMediaControl(workDir) {
  if (process.platform !== 'win32') {
    return { pause: async () => ({ paused: 0 }), resume: async () => ({ resumed: 0 }), status: async () => ({ playing: [] }), warm() {}, stop() {} };
  }

  const scriptPath = path.join(workDir, 'media-control.ps1');
  let proc = null;
  let seq = 0;
  const pending = new Map();   // id → resolve

  function ensure() {
    if (proc) return;
    fs.writeFileSync(scriptPath, SCRIPT, 'ascii');
    proc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { windowsHide: true });
    readline.createInterface({ input: proc.stdout }).on('line', (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      const resolve = pending.get(String(msg.id));
      if (resolve) { pending.delete(String(msg.id)); resolve(msg); }
    });
    proc.on('exit', () => {
      proc = null;
      for (const resolve of pending.values()) resolve({ error: 'media helper stopped' });
      pending.clear();
    });
    proc.on('error', () => { proc = null; });
  }

  // Never throws and never hangs an announcement: worst case resolves after 4 s
  function send(cmd) {
    return new Promise((resolve) => {
      try { ensure(); } catch { return resolve({ error: 'media helper unavailable' }); }
      const id = String(++seq);
      const timer = setTimeout(() => { pending.delete(id); resolve({ error: 'timeout' }); }, 4000);
      pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
      proc.stdin.write(`${cmd} ${id}\n`);
    });
  }

  return {
    pause:  () => send('pause'),    // → { paused: <how many>, apps: [...] }
    resume: () => send('resume'),   // → { resumed: <how many> }
    status: () => send('status'),   // → { playing: [...] }
    warm:   () => { try { ensure(); } catch {} },
    stop:   () => { if (proc) proc.kill(); },
  };
}

module.exports = { createMediaControl };
