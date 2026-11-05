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
# Query the exact instance by its documented endpoint; array responses vary between releases.
try {
  $detail = Invoke-RestMethod -Uri ("http://127.0.0.1:8080/instance/connectionState/" + $instance) -Headers @{apikey=$key} -TimeoutSec 12
  $returnedName = if ($detail.instance -and $detail.instance.instanceName) { [string]$detail.instance.instanceName } else { "" }
  $state = if ($detail.instance -and $detail.instance.state) { [string]$detail.instance.state }
    elseif ($detail.state) { [string]$detail.state }
    else { "" }
  if ($returnedName -and $returnedName -ne $instance) {
    Write-Host "[ERRO] A Evolution retornou nome diferente; nada alterado." -ForegroundColor Red
    exit 1
  }
  if ($state -ne "open") {
    Write-Host ("[ERRO] Instancia nao esta aberta. Estado: " + $state + ". Nada alterado.") -ForegroundColor Red
    exit 1
  }
} catch {
  Write-Host "[ERRO] Falha ao consultar a instancia pelo endpoint proprio. Verifique conexao/autenticacao da Evolution. Nada alterado." -ForegroundColor Red
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
