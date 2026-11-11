$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$outputPath = Join-Path $PSScriptRoot "minimi-demo-narration.wav"
$narration = @"
Minimi is a research chat built for questions that do not stop after the first answer. It combines current web search with memory of earlier conversations. Imagine your team shortlisted CRM tools for twenty people. Now ask what changed. Minimi retrieves the matching thread: the date, decision, and useful details. It uses that history as context, not as proof. For facts, the model searches the web and compares fresh information with your earlier notes. Pricing pages, release notes, and product documentation become clickable sources beside the answer. Open each link to check the details. Your conversation stays on this device and remains available after a restart. Ask a question today. Continue the thread next week. Minimi: web search, conversation memory, and citations, built for the next question.
"@

$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
try {
  $synth.SelectVoice("Microsoft Zira Desktop")
  $synth.Rate = 0
  $synth.Volume = 94
  $synth.SetOutputToWaveFile($outputPath)
  $synth.Speak($narration)
  $synth.SetOutputToNull()
} finally {
  $synth.Dispose()
}

$wave = [IO.File]::ReadAllBytes($outputPath)
$sampleRate = [BitConverter]::ToInt32($wave, 24)
$offset = 12
$dataSize = 0
while ($offset + 8 -le $wave.Length) {
  $chunkId = [Text.Encoding]::ASCII.GetString($wave, $offset, 4)
  $chunkSize = [BitConverter]::ToInt32($wave, $offset + 4)
  if ($chunkId -eq "data") { $dataSize = $chunkSize; break }
  $offset += 8 + $chunkSize
}
$byteRate = [BitConverter]::ToInt32($wave, 28)
Write-Output ("Narration generated: {0:N1} seconds at {1} Hz" -f ($dataSize / $byteRate), $sampleRate)
