# Painel do cliente — organização da configuração da IA

## Escopo

Mudança local solicitada pelo proprietário: melhorar a leitura, a identidade visual e o percurso de configuração do cliente. O CRM incorporado ao Master reutiliza a mesma experiência. Não altera catálogo, cobrança, contas ou habilitação de envios reais. O arquivo `PROJECT_CONTEXT.md`, já presente e não rastreado, foi preservado.

## Percurso

1. Conectar um WhatsApp liberado pelo plano por QR Code.
2. Cadastrar as informações reais da empresa.
3. Definir instruções de comportamento da IA.
4. Revisar e salvar horários.
5. Testar respostas no simulador.
6. Conferir manualmente as configurações antes de revisar a ativação.

O guia aparece em todos os planos. Seus controles de navegação ficam fora do formulário bloqueado, sem permitir contornar permissões. Bloqueios comerciais oferecem a solicitação de upgrade existente; manutenção e suspensão não são apresentadas como necessidade de compra.


As confirmações de conhecimento, instruções e horários usam os dados efetivamente persistidos retornados em `setupEvidence`. Texto digitado não conclui etapas. O teste só é confirmado após uma resposta bem-sucedida do simulador para a configuração salva. A confirmação manual da revisão não ativa a IA nem envia WhatsApp. Alterações de configuração invalidam o teste e a revisão; a revisão é local à sessão.

## Identidade e clareza

- Roxo na estrutura, vermelho nas ações principais, rosa em detalhes e dourado na revisão final.
- Fundos neutros e contraste alto; cores semânticas de sucesso e erro são preservadas.
- Guia adaptável ao celular; ações levam à seção e ao campo correspondentes.
- Formulário de informações separado das instruções de comportamento.
- Ajuda de preenchimento e mensagens de salvamento que não prometem envio de mensagens.

### Refinamento da paleta e navegação

O menu foi extraído para `WorkspaceNavigation`, com cores decorativas uniformes (roxo e rosa), destaque ativo vermelho, superfícies neutras e estados semânticos separados. Os cartões operacionais seguem a mesma hierarquia e são botões acessíveis pelo teclado, em vez de blocos clicáveis sem semântica.

A busca de seções funciona localmente, ignora acentos e não consulta dados dos clientes nem uma IA. Há retorno de ausência de resultados, botão para limpar e atalhos Enter (quando houver um único resultado) e Escape (limpar). Apenas filtrar o menu preserva o texto ainda não salvo. A disposição lateral em telas grandes e a adaptação em telas menores foram mantidas conforme confirmação do proprietário; a tentativa de guia lateral foi cancelada e desfeita.

## Limites verificados

- Artigo de conhecimento: 20.000 caracteres, título de até 200.
- O campo principal de informações da empresa passa a usar o mesmo limite de 20.000 caracteres, validado também no servidor, sem truncar textos existentes.
- Instruções de comportamento: não havia limite específico declarado; a interface mostra a contagem sem inventar um máximo.
- O limite é de caracteres JavaScript, incluindo espaços e quebras de linha, e não de linhas. A contagem segue o mesmo critério do formulário e da validação existente.
- A proteção de tamanho do pedido de artigos foi ajustada para suportar a codificação UTF-8 de textos com acentos e emoji dentro do limite de caracteres.
- Falha ao gravar o conhecimento não pode retornar sucesso na API de configuração.

## Validação

- Build de produção e verificação de tipos: aprovados.
- ESLint: zero erros (avisos preexistentes não foram tratados como parte do redesenho).
- Navegador na versão compilada: 9/9 testes aprovados, incluindo cliente/Master em 390 e 1440 px, gravação simulada, contadores, falha de simulação, confirmação manual e bloqueio por plano.
- Suíte de regras: 169/171 aprovados na primeira execução; os dois testes de horários que exigiam registrar a nova dependência compartilhada foram corrigidos e passaram na repetição dos cinco testes afetados. Não restaram falhas observadas.
- Capturas com dados simulados identificados em `screenshots/setup-*.png`.
- Prévia local da versão compilada em `http://127.0.0.1:3050/cliente`. O Docker na porta 3040 não foi atualizado.

Os testes de navegador usam APIs simuladas e empresas de teste identificadas, sem envio real. A validação visual não comprova conexão com celular ou atendimento em produção. A versão no Docker deve ser atualizada separadamente após aprovação do proprietário.

Limitação preservada: o processamento atual considera até 20 artigos publicados mais recentes, enquanto o editor lista até 100. Esta alteração de layout não implementa busca de conhecimento ou um novo mecanismo de publicação.
