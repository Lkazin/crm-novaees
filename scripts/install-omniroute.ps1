# NovaesWeb CRM AI - OmniRoute installer for Windows + Docker Desktop
# Uses an isolated container and a named volume. Does not modify existing services.
$ErrorActionPreference = "Stop"
$container = "novaes-omniroute"
$volume = "novaes-omniroute-data"
$port = 20128
$image = "diegosouzapw/omniroute:latest"

function Stop-WithMessage([string] $message) {
  Write-Host "[ERRO] $message" -ForegroundColor Red
  exit 1
}

Write-Host "NovaesWeb | Instalador isolado do OmniRoute" -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Stop-WithMessage "Docker nao encontrado. Abra o Docker Desktop e instale o Docker antes de prosseguir."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Stop-WithMessage "Docker Desktop nao esta em execucao."
}

$existing = docker ps -a --filter "name=^/$container$" --format "{{.Names}}"
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "Nao foi possivel consultar os containers." }
if ($existing -eq $container) {
  $running = docker inspect --format "{{.State.Running}}" $container
  if ($running -eq "true") {
    Write-Host "[OK] O OmniRoute ja esta em execucao." -ForegroundColor Green
    Write-Host "Painel: http://localhost:$port"
    exit 0
  }
  Write-Host "Existe um container parado chamado $container. Nenhuma alteracao sera feita nele." -ForegroundColor Yellow
  Write-Host "Revise-o antes de iniciar: docker inspect $container"
  exit 1
}

# Respect all existing containers and any service already bound to the port.
$occupied = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($occupied) {
  Stop-WithMessage "Porta $port em uso. Nada foi criado; resolva o conflito sem derrubar outros containers."
}

Write-Host "[1/3] Baixando imagem oficial..." -ForegroundColor Cyan
docker pull $image
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "Falha ao baixar imagem do OmniRoute." }

Write-Host "[2/3] Criando volume de dados isolado..." -ForegroundColor Cyan
docker volume create $volume | Out-Null
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "Falha ao criar volume Docker." }

Write-Host "[3/3] Iniciando OmniRoute..." -ForegroundColor Cyan
docker run -d --name $container --restart unless-stopped --stop-timeout 40 --memory 2g -e OMNIROUTE_MEMORY_MB=1024 -p "127.0.0.1:${port}:20128" -v "${volume}:/app/data" $image | Out-Null
if ($LASTEXITCODE -ne 0) { Stop-WithMessage "Falha ao iniciar container; verifique docker logs $container" }

Write-Host "[OK] Container iniciado. Aguardando o servidor responder..." -ForegroundColor Green
$ready = $false
foreach ($attempt in 1..20) {
  try {
    $response = Invoke-WebRequest "http://127.0.0.1:$port/" -TimeoutSec 4 -UseBasicParsing
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {}
  Start-Sleep -Seconds 2
}

if ($ready) {
  Write-Host "[OK] O servidor respondeu em http://localhost:$port" -ForegroundColor Green
  Start-Process "http://localhost:$port"
} else {
  Write-Host "[ATENCAO] Container iniciado, mas o painel ainda nao respondeu." -ForegroundColor Yellow
  Write-Host "Diagnostico: docker logs --tail 80 $container"
}
Write-Host "Nao configuramos provedores nem chaves automaticamente."
Write-Host "Status: docker ps --filter name=$container"
