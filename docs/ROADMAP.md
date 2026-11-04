# Plano de entrega

## Etapa 0 — Diagnóstico (somente leitura)
Listar containers, serviços, versões, portas, redes e volumes do Docker Desktop; confirmar qual OmniRoute/FreeLLMAPI está instalado. Não alterar os serviços atuais.

## Etapa 1 — Fundação
Criar estrutura isolada, configurações de exemplo, validação de ambiente, infraestrutura de testes, autenticação e modelo de autorização.

## Etapa 2 — Banco
Preparar migrations versionadas, RLS por tenant, grants explicitamente necessários à Data API, teste de segregação e auditoria. Nunca aplicar no banco existente do Master.

## Etapa 3 — Um canal WhatsApp de teste
Conectar instância autorizada pela Evolution, validar webhook, idempotência, armazenamento e caixa de entrada básica.

## Etapa 4 — Um agente funcional
Perguntas sobre horário, serviços e preço com base cadastrada; limites de custo; tratamento de incerteza; atendimento humano e pausa.

## Etapa 5 — Painel Master e painel do cliente
Criar empresas, agentes, permissões, relatórios mínimos; habilitar acesso do cliente apenas após testes.

## Etapa 6 — Homologação
Duas empresas fictícias independentes, carga limitada, falhas de rede, auditoria, segurança, custos e conformidade. Somente depois planejar a venda e hospedagem na nuvem.

**Regra:** uma etapa só é concluída com testes e evidências verificáveis.
