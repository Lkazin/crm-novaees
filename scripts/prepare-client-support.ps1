# Prepare the chosen Evolution instance for NovaesWeb CRM AI customer support.
# Does NOT enable automatic replies or overwrite an existing Evolution webhook.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root
$path = Join-Path $root ".env.ai-lab"
if (!(Test-Path $path)) { Write-Host "[ERRO] .env.ai-lab nao encontrado."; exit 1 }
$raw = [IO.File]::ReadAllText($path)
function EnvVal([string]$name) {
  $m = [regex]::Match($script:raw,'(?m)^'+[regex]::Escape($name)+'=(.*)$')
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  return ""
}
if ((EnvVal "AI_REPLY_ENABLED") -ne "false") {
  Write-Host "[BLOQUEADO] Desligue AI_REPLY_ENABLED antes de preparar a integracao." -ForegroundColor Red
  exit 1
}
$key = EnvVal "EVOLUTION_API_KEY"
if (!$key -or $key -match '^(YOUR_|REPLACE|COLE_AQUI)') {
  Write-Host "[ERRO] Chave da Evolution ainda nao configurada."; exit 1
}
$instance = "novaesweb-ia-teste"
try {
  $items = @(Invoke-RestMethod -Uri "http://127.0.0.1:8080/instance/fetchInstances" -Headers @{apikey=$key} -TimeoutSec 12)
  $found = @($items | Where-Object { $_.name -eq $instance -or ($_.instance -and $_.instance.instanceName -eq $instance) })
  if ($found.Count -ne 1) { throw "Instancia nao foi identificada unicamente" }
  $state = if($found[0].connectionStatus){[string]$found[0].connectionStatus}else{[string]$found[0].instance.status}
  if ($state -ne "open") { throw "Instancia nao conectada (estado: $state)" }
} catch {
  Write-Host "[ERRO] Nao foi possivel confirmar a instancia conectada. Nada alterado." -ForegroundColor Red
  exit 1
}
Write-Host "[OK] Instancia escolhida conectada: novaesweb-ia-teste" -ForegroundColor Green
$old = EnvVal "EVOLUTION_INSTANCE"
$updated = [regex]::Replace($raw,'(?m)^EVOLUTION_INSTANCE=.*$','EVOLUTION_INSTANCE=novaesweb-ia-teste')
if ($updated -eq $raw -and !$raw.Contains("EVOLUTION_INSTANCE=")) { $updated = $raw.TrimEnd()+"`r`nEVOLUTION_INSTANCE=novaesweb-ia-teste`r`n" }
[IO.File]::WriteAllText($path,$updated,(New-Object Text.UTF8Encoding($false)))
Write-Host "[OK] Instancia vinculada no arquivo local. WhatsApp automatico continua desligado." -ForegroundColor Green
try {
  $webhook = Invoke-RestMethod -Uri ("http://127.0.0.1:8080/webhook/find/" + $instance) -Headers @{apikey=$key} -TimeoutSec 12
  $configured = if ($webhook.webhook) { $webhook.webhook } else { $webhook }
  $target = [string]$configured.url
  if ($target) {
    Write-Host "[ATENCAO] A instancia ja possui um endereco de webhook configurado. Nao foi modificado." -ForegroundColor Yellow
    Write-Host "E preciso avaliar essa integracao antes de substituir ou adicionar o CRM."
  } else {
    Write-Host "[INFO] Nenhum endereco de webhook retornado pela API; requer validacao antes de configurar."
  }
} catch {
  Write-Host "[PENDENTE] A versao da Evolution nao confirmou o webhook atual. Nenhum webhook foi alterado." -ForegroundColor Yellow
}
Write-Host "[BLOQUEADO] Atendimento automatico ainda nao foi ativado."
Write-Host "Pendencias: webhook autenticado, alcance entre containers, numero real autorizado, caixa humana e fila de mensagens."
