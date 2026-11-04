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
# Consultar e validar sem exibir payloads que possam incluir tokens.
try {
  # Same collection pattern as configure-evolution-key-local.ps1 (already validated on Windows).
  $items = @(Invoke-RestMethod -Uri "http://127.0.0.1:8080/instance/fetchInstances" -Headers @{apikey=$key} -TimeoutSec 12)
} catch {
  $code = "indisponivel"
  if ($_.Exception.Response) { $code = [string][int]$_.Exception.Response.StatusCode }
  Write-Host "[ERRO] Nao consegui consultar a Evolution (HTTP: $code). Nada alterado." -ForegroundColor Red
  exit 1
}
# Invoke-RestMethod already enumerates returned JSON arrays; do not rewrap the array.
$found = @($items | Where-Object {
  $name = if ($_.name) { [string]$_.name }
          elseif ($_.instance -and $_.instance.instanceName) { [string]$_.instance.instanceName }
          elseif ($_.instanceName) { [string]$_.instanceName }
          elseif ($_.instance -is [string]) { [string]$_.instance }
          else { "" }
  $name -eq $instance
})
if ($found.Count -ne 1) {
  Write-Host "[ERRO] Instancia esperada nao encontrada de forma unica (ocorrencias: $($found.Count))." -ForegroundColor Red
  Write-Host "A Evolution retornou $($items.Count) registro(s). Nomes disponiveis:" -ForegroundColor Yellow
  foreach ($item in $items) {
    if ($item.name) { Write-Host (" - " + [string]$item.name) }
    elseif ($item.instance -and $item.instance.instanceName) { Write-Host (" - " + [string]$item.instance.instanceName) }
    elseif ($item.instanceName) { Write-Host (" - " + [string]$item.instanceName) }
    elseif ($item.instance -is [string]) { Write-Host (" - " + [string]$item.instance) }
  }
  if ($items.Count -gt 0) {
    $fieldNames = @($items[0].PSObject.Properties.Name | Where-Object { $_ -match "^(name|instance|instanceName|connectionStatus|status|state|id)$" })
    Write-Host ("Campos reconhecidos no primeiro registro: " + ($fieldNames -join ", "))
  }
  Write-Host "Nenhum arquivo foi alterado."
  exit 1
}
$state = if($found[0].connectionStatus){[string]$found[0].connectionStatus}
  elseif($found[0].instance -and $found[0].instance.status){[string]$found[0].instance.status}
  elseif($found[0].status){[string]$found[0].status}
  else { "" }
if ($state -ne "open") {
  Write-Host "[ATENCAO] Status da instancia pela listagem: '$state'. Confirmando pelo endpoint proprio..." -ForegroundColor Yellow
  try {
    $detail = Invoke-RestMethod -Uri ("http://127.0.0.1:8080/instance/connectionState/" + $instance) -Headers @{apikey=$key} -TimeoutSec 12
    $confirmed = if ($detail.instance -and $detail.instance.state) {[string]$detail.instance.state}
      elseif($detail.state){[string]$detail.state}
      else { "" }
    if ($confirmed -eq "open") { $state = "open" }
    else { Write-Host "[ERRO] Estado nao confirmado como open (obtido: '$confirmed'). Nada alterado."; exit 1 }
  } catch {
    Write-Host "[ERRO] Nao foi possivel confirmar conexao pelo endpoint proprio. Nada alterado."; exit 1
  }
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
