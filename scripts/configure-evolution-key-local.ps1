# Configure the Evolution API key for the local NovaesWeb CRM AI lab.
# Reads from the EXISTING evolution_api container, never prints credentials.
# No mutation to Evolution, webhooks, connected WhatsApp, or other services.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root
$path = Join-Path $root ".env.ai-lab"
if (!(Test-Path $path)) { Write-Host "[ERRO] Arquivo .env.ai-lab nao existe."; exit 1 }
$raw = [System.IO.File]::ReadAllText($path)
if ($raw -notmatch '(?m)^AI_REPLY_ENABLED=false\s*$') {
    Write-Host "[BLOQUEADO] Desative AI_REPLY_ENABLED antes de configurar o laboratorio." -ForegroundColor Red
    exit 1
}
function Value([string]$name) {
    $match = [regex]::Match($raw, '(?m)^' + [regex]::Escape($name) + '=(.*)$')
    if (!$match.Success) { return "" }
    return $match.Groups[1].Value.Trim()
}
function SetValue([string]$name,[string]$value) {
    if ($value -match '[\r\n]') { throw "Valor invalido" }
    $p = '(?m)^' + [regex]::Escape($name) + '=.*$'
    if ([regex]::IsMatch($script:raw,$p)) {
        $script:raw = [regex]::Replace($script:raw,$p,[System.Text.RegularExpressions.MatchEvaluator]{param($m) "$name=$value"})
    } else {
        $script:raw = $script:raw.TrimEnd() + [Environment]::NewLine + "$name=$value" + [Environment]::NewLine
    }
}
Write-Host "=== Evolution API -> CRM AI (somente configuracao local) ===" -ForegroundColor Cyan
try {
    $envJson = docker inspect --format '{{json .Config.Env}}' evolution_api 2>$null
    if ($LASTEXITCODE -ne 0 -or !$envJson) { throw "container nao encontrado" }
    $vars = ConvertFrom-Json -InputObject ($envJson -join "")
    $entries = @($vars | Where-Object { $_ -match '^AUTHENTICATION_API_KEY=' })
    if ($entries.Count -ne 1) { throw "AUTHENTICATION_API_KEY nao encontrada ou duplicada no container" }
    $apiKey = [string]$entries[0].Substring('AUTHENTICATION_API_KEY='.Length)
    if ($apiKey.Length -lt 12) { throw "chave muito curta ou ausente" }
    Write-Host "[OK] Chave de API encontrada no container existente, sem exibir valor." -ForegroundColor Green
} catch {
    Write-Host "[PENDENTE] Nao consegui ler automaticamente a chave do container." -ForegroundColor Yellow
    Write-Host "Abra .env.ai-lab e preencha EVOLUTION_API_KEY com a chave da Evolution (nao a do Groq)."
    exit 1
}
try {
    $instances = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:8080/instance/fetchInstances' -Headers @{apikey=$apiKey} -TimeoutSec 12
} catch {
    Write-Host "[PENDENTE] Chave localizada, mas a Evolution recusou a consulta. Nenhum arquivo foi modificado." -ForegroundColor Yellow
    exit 1
}
$records = @($instances | Where-Object { $null -ne $_ })
Write-Host ("[OK] Evolution autenticada. Instancias: " + $records.Count) -ForegroundColor Green
foreach ($it in $records) {
    $name = if ($it.name) { [string]$it.name } elseif ($it.instance -and $it.instance.instanceName) { [string]$it.instance.instanceName } else { "(sem nome)" }
    $state = if ($it.connectionStatus) { [string]$it.connectionStatus } elseif ($it.instance -and $it.instance.status) { [string]$it.instance.status } else { "desconhecido" }
    Write-Host (" - {0}: {1}" -f $name,$state)
}
SetValue "EVOLUTION_API_KEY" $apiKey
$apiKey = $null
[System.IO.File]::WriteAllText($path,$raw,(New-Object System.Text.UTF8Encoding($false)))
Write-Host "[OK] Chave salva somente no .env.ai-lab local." -ForegroundColor Green
Write-Host "[SEGURANCA] Nenhuma instancia foi selecionada automaticamente. Nenhum envio foi habilitado."
Write-Host "A lista acima nao prova que uma instancia seja exclusiva para testes."
Write-Host "Nao use um WhatsApp de clientes reais para essa homologacao." -ForegroundColor Yellow
