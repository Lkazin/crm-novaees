# NovaesWeb CRM AI: local-only deployment and smoke-test.
# Touches ONLY novaesweb-crm-ai-lab compose project; no changes to Evolution/OmniRoute.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root
function Stop-Bad([string]$why) { Write-Host "[ERRO] $why" -ForegroundColor Red; exit 1 }
$envPath = Join-Path $root ".env.ai-lab"
$composePath = Join-Path $root "docker-compose.ai-lab.yml"
if (!(Test-Path $envPath)) { Stop-Bad ".env.ai-lab nao existe. Rode setup-crm-ai-local.ps1 primeiro." }
$rows = [IO.File]::ReadAllLines($envPath)
function ReadKey([string]$name) {
  $row = $rows | Where-Object { $_.StartsWith($name+"=") } | Select-Object -First 1
  if (!$row) { return "" }
  return [string]$row.Substring($name.Length+1).Trim()
}
if ((ReadKey "AI_REPLY_ENABLED") -ne "false") { Stop-Bad "Respostas automaticas devem continuar desligadas nesta verificacao." }
$admin = ReadKey "CRM_LAB_ADMIN_TOKEN"
if ($admin.Length -lt 32) { Stop-Bad "Token administrativo local ainda nao configurado." }
if (!(Get-Command docker -ErrorAction SilentlyContinue)) { Stop-Bad "Docker nao encontrado" }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Stop-Bad "Docker Desktop nao esta rodando" }
Write-Host "=== NovaesWeb CRM AI: atualizacao segura ===" -ForegroundColor Cyan
Write-Host "[1/5] Verificando servicos existentes..."
$omni = docker inspect --format '{{.State.Running}}' novaes-omniroute 2>$null
$evo = docker inspect --format '{{.State.Running}}' evolution_api 2>$null
if ($omni -ne "true") { Stop-Bad "OmniRoute parado; nao vamos alterá-lo." }
if ($evo -ne "true") { Stop-Bad "Evolution parada; nao vamos alterá-la." }
Write-Host "[OK] OmniRoute e Evolution rodando sem alteracoes."
Write-Host "[2/5] Validando compose isolado..."
docker compose -f $composePath --project-name novaesweb-crm-ai-lab config --quiet
if ($LASTEXITCODE -ne 0) { Stop-Bad "Compose invalido" }
Write-Host "[3/5] Atualizando somente CRM e Redis isolados..."
docker compose -f $composePath --project-name novaesweb-crm-ai-lab up --build -d
if ($LASTEXITCODE -ne 0) { Stop-Bad "Falha no Docker build. Consultar logs do CRM." }
Write-Host "[4/5] Consultando CRM..."
$ready = $false
for ($i=0; $i -lt 25; $i++) {
  try {
    $health = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3040/api/ai/health" -TimeoutSec 5
    if ($health.component -eq "crm-ai-lab") { $ready=$true; break }
  } catch {}
  Start-Sleep -Seconds 2
}
if (!$ready) { Stop-Bad "CRM nao respondeu em localhost:3040. Consulte docker compose logs --tail 80 crm-ai-app." }
$headers = @{"x-crm-lab-admin-token"=$admin}
try {
  $inbox = Invoke-RestMethod -Uri "http://127.0.0.1:3040/api/crm/inbox" -Headers $headers -TimeoutSec 10
  Write-Host ("[OK] Caixa privada consultada; conversas registradas: " + @($inbox.conversations).Count)
} catch { Stop-Bad "Caixa privada nao respondeu. Confira Redis e token administrativo." }
try {
  $status = Invoke-RestMethod -Uri "http://127.0.0.1:3040/api/crm/status" -Headers $headers -TimeoutSec 12
  Write-Host ("[INFO] Instancia: " + $status.instance + "; Estado: " + $status.channel)
  Write-Host ("[INFO] Captura: " + $status.captureEnabled + "; Auto-reply: " + $status.repliesEnabled)
} catch { Write-Host "[ATENCAO] Status da Evolution ainda nao validado; nao habilite envio." -ForegroundColor Yellow }
Write-Host "[5/5] Testando IA sem WhatsApp..."
try {
  $answer = Invoke-RestMethod -Uri "http://127.0.0.1:3040/api/ai/test" -Method Post -ContentType "application/json" -Headers $headers -Body '{"question":"Responda em portugues: teste tecnico NovaesWeb CRM AI"}' -TimeoutSec 35
  if ($answer.deliveredToWhatsApp -eq $false -and $answer.answer) { Write-Host "[OK] Geracao da IA confirmada. NENHUMA mensagem enviada ao WhatsApp." -ForegroundColor Green }
  else { Write-Host "[ATENCAO] Resposta do provedor nao confirmada." -ForegroundColor Yellow }
} catch { Write-Host "[ATENCAO] Teste de IA falhou; verificar OmniRoute e rotas de modelos." -ForegroundColor Yellow }
Write-Host "Painel local: http://localhost:3040"
Write-Host "Atendimento automatico permaneceu DESLIGADO." -ForegroundColor Yellow
