# NovaesWeb CRM AI — pesquisa de provedores gratuitos e laboratório Master

Pesquisa verificada em 04/11/2026. **Plano gratuito em nuvem não significa API ilimitada ou adequada para atendimento comercial.**

## Escolhas e fontes oficiais

| Provedor | Uso sugerido | Gratuito e limites | Modalidade |
|---|---|---|---|
| GroqCloud | Principal para texto rápido; imagem via modelos específicos | Limites por organização e modelo, verificar na própria conta | Texto, imagem em modelos suportados |
| Google Gemini API | Teste com fotos, vídeos e áudio SEM dados pessoais de clientes | Cotas por modelo e projeto; serviço não pago pode utilizar dados para melhoria, com revisão humana | Texto/imagem/áudio/vídeo |
| OpenRouter | Agregar muitos modelos; teste da rota `openrouter/free` | 25+ modelos gratuitos, mas variantes `:free` compartilham 20 RPM/50 RPD por conta sem créditos; até 1000 RPD após US$10 de créditos comprados | Depende do modelo; roteador pode filtrar imagem |
| Cloudflare Workers AI | Reserva independente | 10.000 Neurons/dia gratuitos. Modelos específicos podem exigir plano pago | Texto/visão em modelos específicos |
| Mistral API | Reserva independente após validação | Modo grátis com cota e limites | Conferir modelo habilitado |
| Ollama local + Qwen3-VL | Infra própria sem cobrança de requisições por provedor | Requer CPU/GPU/RAM, energia e uptime; modelo 4B cerca de 3.3 GB em disco | Texto e imagens, vídeo exige validação do adaptador |

Fontes:
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/vision
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://ai.google.dev/gemini-api/docs/video-understanding
- https://ai.google.dev/gemini-api/terms
- https://openrouter.ai/collections/free-models
- https://openrouter.ai/pt-BR/openrouter/free
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key
- https://ollama.com/library/qwen3-vl
- https://docs.litellm.ai/docs/proxy/architecture

## Painel novo — /admin/ai-providers

- Catálogo de provedores com referência à documentação oficial.
- `GET /api/crm/admin/ai-lab`: Master/Administrador autenticado consegue ler somente estado da configuração, sem chaves e sem alegar saúde que não foi medida.
- `POST /api/crm/admin/ai-lab/test`: teste **somente texto**, atrás de login Master, lista de IDs aprovados, opt-in explícito, limite Redis por operador (5/min e 20/dia), prazo máximo de 15s. Envia requisição ao gateway configurado; não envia WhatsApp.
- O teste é DESLIGADO por padrão e não aceita modelos que não estejam na whitelist. Nem nomes de modelos nem rótulos `:free` garantem que uma conta não será cobrada: confirmar o plano e restrições diretamente no provedor.
- Sem integração de foto/vídeo, nenhuma transcrição ou mídia do WhatsApp, sem failover multinuvem homologado e sem laboratório WhatsApp ainda. O número exclusivo `novaesweb-ia-teste` será ligado apenas no GOLF após confirmar configurações e contratos.
- Laboratório não permite ao cliente configurar chaves de provedores, mudar o gateway por HTTP nem colocar endpoint arbitrário. O Master só recebe nomes de rotas aprovadas, nunca chaves.

## Configuração local para GOLF

```dotenv
CRM_AI_LAB_TEST_ENABLED=false
CRM_AI_LAB_FREE_MODEL_IDS=
```

Quando as rotas gratuitas estiverem configuradas no OmniRoute, o operador poderá permitir testes apenas para IDs efetivamente liberados, por exemplo `CRM_AI_LAB_FREE_MODEL_IDS=rota-gratuita-confirmada`. **O exemplo não é ID real.** Nunca adicionar rotas com cobrança automática.

### Arquitetura proposta de failover

1. Receber evento na Evolution com autenticação e escopo da empresa.
2. Classificar texto/foto/áudio/vídeo; baixar mídias com limites de tamanho/tempo, validação de MIME, antivírus/inspeção e armazenamento com prazo curto. Ainda NÃO implementado.
3. Consultar conhecimento publicado e permissões da empresa; nenhuma resposta inventada sobre produtos ou preços.
4. Selecionar entre modelos autorizados conforme capacidade e regras de privacidade. Não enviar dados pessoais a planos cujo tratamento de dados seja inadequado.
5. Testar primário; em 429/timeouts seguir para segundo e terceiro, obedecendo quotas, timeout total e limite de custo.
6. Se todos indisponíveis, deixar atendimento pendente para humano, sem loop e sem duplicar WhatsApp.
7. Registrar modelo real, tokens, rota de fallback, falhas e custo, se informados confiavelmente.
8. Na Central Master: habilitar/desabilitar provedores permitidos, testar **sem WhatsApp**, testar número isolado **com autorização**, acompanhar disponibilidade e limites.

O gateway OmniRoute instalado atualmente é a primeira opção a inspecionar. Não instalar LiteLLM em paralelo sem benefício objetivo: o LiteLLM tem fallback/roteamento e amplia a integração futura, mas também é um serviço extra para manter.

## Privacidade e licenças

A API Gemini gratuita usa conteúdos submetidos para melhoria e pode envolver revisores humanos, segundo os termos. Não encaminhar conversas pessoais/confidenciais de clientes à cota gratuita. Confirmar DPA/LGPD, uso comercial, termos de modelo, regionalidade e retenção antes de ativar um provedor para lojas.

A opção local é a mais próxima de 'ilimitada' por número de requisições, mas capacidade e disponibilidade são limitadas pelo hardware e infraestrutura. Mesmo nela, não prometer respostas ilimitadas em um plano comercial.

## Critérios de homologação

- Conta e API de cada provedor autorizadas, limites efetivos verificados e captura de tela local de configuração sem segredos.
- Modelo testa texto, imagem e vídeo apenas se declarado compatível; nenhum resultado inventado.
- Troca automática em 429 e timeout, roteamento explícito somente entre provedores autorizados, sem gastos inesperados.
- Configurações por tenant e monitoramento real; se não há modelo elegível disponível, atendimento humano pendente.
- Webhook e WhatsApp de laboratório isolados de clientes, sem mensagens automáticas até a fila confiável ser homologada.
