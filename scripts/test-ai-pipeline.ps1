# NovaesWeb CRM AI - Teste Ponta a Ponta de Inteligencia Artificial
$ErrorActionPreference = "Continue"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " NovaesWeb CRM AI - Teste de Pipeline da IA" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Testar OmniRoute Direto
Write-Host "`n[1/3] Testando OmniRoute (Porta 20128)..." -ForegroundColor Yellow
try {
    $omniHealth = Invoke-RestMethod -Uri "http://127.0.0.1:20128/api/health" -Method Get -TimeoutSec 5
    Write-Host "  -> OmniRoute Status: OK (Timestamp: $($omniHealth.timestamp))" -ForegroundColor Green
} catch {
    Write-Host "  -> [ERRO] OmniRoute nao respondeu: $_" -ForegroundColor Red
}

# 2. Testar Inferencia direta no OmniRoute via auto/best-chat
Write-Host "`n[2/3] Testando Inferencia Direta no OmniRoute (auto/best-chat)..." -ForegroundColor Yellow
$apiKey = "sk-9208b8c0f2bfd069-e12668-5717db14"
$bodyChat = @{
    model = "auto/best-chat"
    messages = @(
        @{ role = "user"; content = "Diga apenas: 'OMNIROUTE E NOVAESWEB PRONTOS!'" }
    )
} | ConvertTo-Json

try {
    $chatRes = Invoke-RestMethod -Uri "http://127.0.0.1:20128/v1/chat/completions" -Method Post `
        -Headers @{ Authorization = "Bearer $apiKey" } `
        -ContentType "application/json" `
        -Body $bodyChat `
        -TimeoutSec 20

    $reply = $chatRes.choices[0].message.content
    Write-Host "  -> Resposta do OmniRoute (Modelo: $($chatRes.model)):" -ForegroundColor Green
    Write-Host "     `"$reply`"" -ForegroundColor Gray
} catch {
    Write-Host "  -> [ERRO] Inferencia no OmniRoute falhou: $_" -ForegroundColor Red
}

# 3. Testar via CRM AI App (Porta 3040)
Write-Host "`n[3/3] Testando Chamada via CRM AI App (/api/ai/test)..." -ForegroundColor Yellow
$crmToken = "1d175f822fc53f2707af52d58ef814ddb6872e873d04b4ba73898e66b4451aaf"
$bodyCrm = @{
    question = "Quais sao os servicos de criacao de sites que a NovaesWeb oferece?"
} | ConvertTo-Json

try {
    $crmRes = Invoke-RestMethod -Uri "http://127.0.0.1:3040/api/ai/test" -Method Post `
        -Headers @{ "x-crm-lab-admin-token" = $crmToken } `
        -ContentType "application/json" `
        -Body $bodyCrm `
        -TimeoutSec 25

    Write-Host "  -> Resposta do CRM AI:" -ForegroundColor Green
    Write-Host "     `"$($crmRes.answer)`"" -ForegroundColor Gray
    Write-Host "`n[SUCESSO] Pipeline de IA validado ponta a ponta!" -ForegroundColor Green
} catch {
    Write-Host "  -> [ERRO] Chamada pelo CRM AI falhou: $_" -ForegroundColor Red
}
