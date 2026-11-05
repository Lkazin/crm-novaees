# NovaesWeb CRM AI - Assistente de instalacao local do laboratorio
# Execute na pasta do repositorio: powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-crm-ai-local.ps1
# A chave do OmniRoute e lida apenas neste computador. NUNCA e enviada ao GitHub.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Fail([string]$Message) {
    Write-Host "[ERRO] $Message" -ForegroundColor Red
    exit 1
}
function New-Secret() {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [BitConverter]::ToString($bytes).Replace("-", "").ToLowerInvariant()
}
function SecureToPlain($Secure) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
function Get-EnvValue([string]$Raw,[string]$Key) {
    foreach ($line in ($Raw -split "\r?\n")) {
        if ($line -match ("^" + [regex]::Escape($Key) + "=(.*)$")) { return $Matches[1] }
    }
    return $null
}
function Set-EnvValue([string]$Raw,[string]$Key,[string]$Value) {
    if ($Value -match "[\r\n]") { throw "Valor invalido em $Key" }
    $pattern = "(?m)^" + [regex]::Escape($Key) + "=.*$"
    $updated = $Key + "=" + $Value
    if ([regex]::IsMatch($Raw,$pattern)) {
        return [regex]::Replace($Raw,$pattern,[System.Text.RegularExpressions.MatchEvaluator]{ param($m) $updated })
    }
    return $Raw.TrimEnd() + [Environment]::NewLine + $updated + [Environment]::NewLine
}
function Write-PrivateFile([string]$Path,[string]$Text) {
    [System.IO.File]::WriteAllText($Path,$Text,(New-Object System.Text.UTF8Encoding($false)))
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root
$envPath = Join-Path $root ".env.ai-lab"
$templatePath = Join-Path $root ".env.ai-lab.example"
$composePath = Join-Path $root "docker-compose.ai-lab.yml"

Write-Host "=== NovaesWeb CRM AI - instalacao local ===" -ForegroundColor Cyan
if (!(Test-Path $templatePath) -or !(Test-Path $composePath)) { Fail "Arquivos do laboratorio nao encontrados. Confira a branch feat/whatsapp-ai-lab." }
if (!(Get-Command docker -ErrorAction SilentlyContinue)) { Fail "Docker nao encontrado." }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker Desktop nao esta pronto." }
$omni = docker inspect --format "{{.State.Running}}" novaes-omniroute 2>$null
if ($LASTEXITCODE -ne 0 -or $omni -ne "true") { Fail "OmniRoute nao esta rodando. Abra-o primeiro." }
try {
    $check = Invoke-WebRequest "http://127.0.0.1:20128/" -TimeoutSec 7 -UseBasicParsing
    if ($check.StatusCode -ge 500) { Fail "OmniRoute respondeu com erro HTTP $($check.StatusCode)." }
} catch { Fail "Nao foi possivel acessar OmniRoute em http://localhost:20128." }

# No existing CRM lab is changed without seeing the current state.
$existingApp = docker ps -a --filter "name=^/novaesweb-crm-ai-lab-crm-ai-app-1$" --format "{{.Names}}"
if ($LASTEXITCODE -ne 0) { Fail "Falha ao consultar os containers." }
if ($existingApp) {
    Write-Host "[INFO] Ja existe um container de laboratorio; o Compose pode recriar apenas os servicos deste projeto." -ForegroundColor Yellow
}
if (!(Test-Path $envPath)) {
    $raw = [IO.File]::ReadAllText($templatePath)
} else {
    $raw = [IO.File]::ReadAllText($envPath)
    Write-Host "[INFO] Configuracao local existente sera atualizada apenas nas variaveis do laboratorio." -ForegroundColor Yellow
}
$admin = Get-EnvValue $raw "CRM_LAB_ADMIN_TOKEN"
if (!$admin -or $admin.Length -lt 32 -or $admin -match "REPLACE|USE_ANOTHER|YOUR_") { $admin = New-Secret }
$webhook = Get-EnvValue $raw "CRM_WEBHOOK_SECRET"
if (!$webhook -or $webhook.Length -lt 32 -or $webhook -match "REPLACE|USE_ANOTHER|YOUR_") { $webhook = New-Secret }

# Read the key from the local env file, avoiding clipboard problems with hidden input.
# Never print, log, or send the value to GitHub.
$key = Get-EnvValue $raw "AI_API_KEY"
if (!$key -or $key.Length -lt 12 -or $key -match '^(REPLACE|YOUR_|COLE_AQUI|SUA_CHAVE)' -or $key -match "[\r\n]") {
    Write-Host "[INFO] A chave ainda nao esta configurada no arquivo local." -ForegroundColor Yellow
    Write-Host "No Bloco de Notas, substitua AI_API_KEY pelo valor secreto da chave novaesw. Salve e feche o arquivo." -ForegroundColor Cyan
    if (!(Test-Path $envPath)) { Write-PrivateFile $envPath $raw }
    Start-Process -FilePath "notepad.exe" -ArgumentList ('"' + $envPath + '"') -Wait
    $raw = [IO.File]::ReadAllText($envPath)
    $key = Get-EnvValue $raw "AI_API_KEY"
}
if ([string]::IsNullOrWhiteSpace($key) -or $key.Length -lt 12 -or $key -match '^(REPLACE|YOUR_|COLE_AQUI|SUA_CHAVE)' -or $key -match "[\r\n]") {
    Fail "Chave nao configurada no arquivo .env.ai-lab. Edite AI_API_KEY localmente e rode novamente."
}
Write-Host "[OK] Chave encontrada no arquivo local, sem exibir o valor." -ForegroundColor Green

$model = Read-Host "Identificador do modelo/rota configurada no OmniRoute (Enter = auto)"
if ([string]::IsNullOrWhiteSpace($model)) { $model = "auto" }
$model = $model.Trim()
if ($model -notmatch "^[A-Za-z0-9_:/.-]{1,140}$") { Fail "Modelo/rota invalido." }

# Only AI connection is enabled. WhatsApp sending stays OFF until explicit validation.
$vals = [ordered]@{
    "AI_OPENAI_BASE_URL" = "http://host.docker.internal:20128/v1"
    "AI_API_KEY" = $key
    "AI_MODEL" = $model
    "AI_REPLY_ENABLED" = "false"
    "CRM_LAB_ADMIN_TOKEN" = $admin
    "CRM_WEBHOOK_SECRET" = $webhook
}
foreach($name in $vals.Keys) { $raw = Set-EnvValue $raw $name $vals[$name] }
$key = $null
Write-PrivateFile $envPath $raw
Write-Host "[OK] Credenciais salvas SOMENTE em .env.ai-lab (ignorado pelo Git)." -ForegroundColor Green
Write-Host "[1/3] Validando Docker Compose..." -ForegroundColor Cyan
docker compose -f $composePath --project-name novaesweb-crm-ai-lab config --quiet
if ($LASTEXITCODE -ne 0) { Fail "Falha na configuracao Compose. Nao foi iniciado." }
Write-Host "[2/3] Criando laboratorio isolado..." -ForegroundColor Cyan
docker compose -f $composePath --project-name novaesweb-crm-ai-lab up --build -d
if ($LASTEXITCODE -ne 0) { Fail "Falha ao iniciar laboratorio. Verifique o erro acima." }

Write-Host "[3/3] Verificando endpoints locais..." -ForegroundColor Cyan
$healthy = $false
for($i=0;$i -lt 24;$i++) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:3040/api/ai/health" -Method Get -TimeoutSec 5
        if ($health.component -eq "crm-ai-lab") { $healthy = $true; break }
    } catch {}
    Start-Sleep -Seconds 2
}
if (!$healthy) {
    Write-Host "[ATENCAO] O aplicativo nao respondeu ainda. Diagnostico:" -ForegroundColor Yellow
    Write-Host "docker compose -f docker-compose.ai-lab.yml --project-name novaesweb-crm-ai-lab logs --tail 60 crm-ai-app"
    exit 1
}
Write-Host "[OK] Aplicativo local no ar: http://localhost:3040" -ForegroundColor Green
Write-Host "Executando uma pergunta real na IA SEM ENVIAR WHATSAPP..." -ForegroundColor Cyan
try {
    $resp = Invoke-RestMethod -Uri "http://127.0.0.1:3040/api/ai/test" -Method Post -ContentType "application/json" -Headers @{"x-crm-lab-admin-token"=$admin} -Body '{"question":"Responda apenas: Ola, NovaesWeb!"}' -TimeoutSec 35
    if ($resp.deliveredToWhatsApp -eq $false -and $resp.answer) {
        Write-Host "[OK] IA respondeu via gateway! WhatsApp continua DESLIGADO." -ForegroundColor Green
        Write-Host "Resposta: $($resp.answer)"
    } else {
        Write-Host "[ATENCAO] Resposta inesperada da API, nao habilite WhatsApp." -ForegroundColor Yellow
    }
} catch {
    Write-Host "[ATENCAO] CRM iniciou, mas nao foi possivel confirmar resposta de IA. Revise rota/modelo/creditos no OmniRoute." -ForegroundColor Yellow
    Write-Host "Nao ative respostas automaticas antes de resolver."
}
Write-Host "Status do laboratorio:"
docker compose -f $composePath --project-name novaesweb-crm-ai-lab ps
