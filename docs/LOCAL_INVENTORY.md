# Inventário do ambiente local (somente leitura)

Executar no Windows/Antigravity, sem subir, parar ou recriar serviços:

- `docker version`
- `docker compose version`
- `docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"`
- `docker network ls`
- `docker volume ls`
- `node --version`, `npm --version`, `git --version`

Identificar instalações existentes: Evolution API, PostgreSQL, Redis, FreeLLMAPI, bridge e **qual projeto chamado OmniRoute** está instalado (nome não garante produto específico).

Não executar comandos que imprimam variáveis de ambiente, credenciais, tokens, sessões WhatsApp ou logs com mensagens de clientes. Redigir resultados sensíveis antes de compartilhar. Não executar `docker compose up`, `down`, `prune`, migrations ou comandos de escrita nesta etapa.

Entregar ao final: serviços reaproveitáveis, riscos, dependências, portas livres e proposta de isolamento.
