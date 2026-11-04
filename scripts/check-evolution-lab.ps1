# NovaesWeb CRM AI - diagnostico seguro da Evolution API
# Consulta apenas o estado da instancia e simula um webhook sem envio real.
# Nao altera Evolution, conexoes, webhooks existentes ou outros containers.
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root
$envPath = Join-Path $root ".env.ai-lab"
if (!(Test-Path $envPath)) { Write-Host "[ERRO] Configure primeiro .env.ai-lab"; exit 1 }
$lines = [IO.File]::ReadAllLines($envPath)
function EnvValue([string]$name) {
    foreach($l in $lines) {
        if ($l.StartsWith($name + "=")) { return $l.Substring($name.Length + 1).Trim() }
    }
    return ""
}
function Label([string]$name,[string]$value) { Write-Host ("{0}: {1}" -f $name,$value) }
function HttpJson([string]$uri,[hashtable]$headers=@{}) {
    return Invoke-RestMethod -Method Get -Uri $uri -Headers $headers -TimeoutSec 12
}
Write-Host "=== NovaesWeb CRM AI / preflight Evolution (somente leitura) ===" -ForegroundColor Cyan
$reply = EnvValue "AI_REPLY_ENABLED"
if ($reply -ne "false") { Write-Host "[BLOQUEADO] AI_REPLY_ENABLED nao esta false. Desligue o envio antes do preflight."; exit 1 }
$secret = EnvValue "CRM_WEBHOOK_SECRET"
if ($secret.Length -lt 32 -or $secret -match "REPLACE|YOUR_|USE_ANOTHER") { Write-Host "[ERRO] Segredo do webhook nao configurado."; exit 1 }
$number = (EnvValue "AI_TEST_ALLOWED_NUMBER") -replace "\D",""
if ($number -notmatch "^\d{10,15}$" -or $number -eq "5511999998888") {
    Write-Host "[ATENCAO] Numero de teste ainda parece ser o exemplo; configure SEU numero autorizado antes de ativar WhatsApp." -ForegroundColor Yellow
}
try {
    $health = HttpJson "http://127.0.0.1:3040/api/ai/health"
    if ($health.component -ne "crm-ai-lab") { throw "Resposta inesperada" }
    Label "CRM" "online em 3040"
} catch {
    Write-Host "[ERRO] CRM nao esta disponivel em localhost:3040."; exit 1
}
try {
    $api = HttpJson "http://127.0.0.1:8080/"
    Label "Evolution" "API acessivel em localhost:8080"
} catch {
    # Unauthorized root/404 still means a server may be there. Probe without printing sensitive response.
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:8080/" -Method Get -UseBasicParsing -TimeoutSec 8
        Label "Evolution" "HTTP $($r.StatusCode)"
    } catch {
        if ($_.Exception.Response) { Label "Evolution" "HTTP $([int]$_.Exception.Response.StatusCode)" }
        else { Write-Host "[ERRO] Nao alcanco Evolution API na porta 8080."; exit 1 }
    }
}
$key = EnvValue "EVOLUTION_API_KEY"
if ([string]::IsNullOrWhiteSpace($key) -or $key -match "^(YOUR_|REPLACE|COLE_AQUI)") {
    Write-Host "[PENDENTE] EVOLUTION_API_KEY nao foi preenchida no .env.ai-lab." -ForegroundColor Yellow
    Write-Host "A chave do OmniRoute e diferente da chave da Evolution."
} else {
    try {
        $instances = HttpJson "http://127.0.0.1:8080/instance/fetchInstances" @{apikey=$key}
        $records = @($instances)
        Write-Host ("Instancias retornadas: {0}" -f $records.Count)
        foreach ($it in $records) {
            $instName = if ($it.name) { [string]$it.name } elseif ($it.instance.instanceName) { [string]$it.instance.instanceName } else { "(sem nome)" }
            $state = if ($it.connectionStatus) { [string]$it.connectionStatus } elseif ($it.instance.status) { [string]$it.instance.status } else { "nao informado" }
            Write-Host (" - {0}: {1}" -f $instName,$state)
        }
        $configured = EnvValue "EVOLUTION_INSTANCE"
        if ($configured -eq "crmtest") {
            Write-Host "[ATENCAO] EVOLUTION_INSTANCE=crmtest e nome de exemplo. Compare com a lista acima." -ForegroundColor Yellow
        } else {
            Label "Instancia configurada" $configured
        }
    } catch {
        Write-Host "[PENDENTE] Evolution nao aceitou consulta de instancias com a chave local. Confira EVOLUTION_API_KEY." -ForegroundColor Yellow
    }
}
$instance = EnvValue "EVOLUTION_INSTANCE"
if (!$instance) { $instance = "crmtest" }
$payload = @{
  event="messages.upsert"; instance=$instance
  data=@{
    key=@{ id="PRECHECK-LOCAL-001"; remoteJid=("$number@s.whatsapp.net"); fromMe=$false }
    message=@{ conversation="Simulacao local sem envio" }
  }
} | ConvertTo-Json -Depth 8 -Compress
try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:3040/api/evolution/webhook" -Method Post -ContentType "application/json" -Headers @{"x-crm-webhook-secret"=$secret} -Body $payload -TimeoutSec 12
    if ($r.status -eq "disabled" -or $r.status -eq "ignored") {
        Label "Webhook de laboratorio" ("HTTP OK; status=" + $r.status + " (sem envio)")
    } else {
        Write-Host "[ATENCAO] Resposta inesperada do webhook; nao ative o envio." -ForegroundColor Yellow
    }
} catch {
    Write-Host "[PENDENTE] Webhook local recusou o payload. Conferir configuracao/servidor."; 
}
Write-Host ""
Write-Host "Diagnostico concluido. Nenhum webhook da Evolution foi alterado e nenhuma mensagem foi enviada." -ForegroundColor Green
Write-Host "NAO ative AI_REPLY_ENABLED antes de configurar uma instancia de teste, numero permitido e autenticacao do webhook."
