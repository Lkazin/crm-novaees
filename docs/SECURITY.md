# Segurança — regras obrigatórias

- Repositório inicialmente **público**: transformá-lo em privado antes de receber código sensível, embora **segredos nunca devam ser versionados**, nem em repo privado.
- Usar arquivo `.env.example` apenas com placeholders; valores reais em armazenamento seguro de segredos.
- Supabase: service role e secret keys apenas no servidor; publishable key pode aparecer no navegador, sob RLS correta.
- Aplicar RLS a toda tabela exposta e políticas específicas por tenant; nenhum acesso interempresa.
- Autorização baseada em memberships confiáveis, não em `user_metadata` que o usuário possa editar.
- Validar origem/autorização dos webhooks, fazer deduplicação de mensagens e limitar taxa.
- Criptografar credenciais persistidas e restringir acesso a sessões e backups.
- Registrar auditoria de quem acessou conversas e alterou configuração.
- Proteger dados pessoais em logs; definir retenção, exclusão e responsabilidades LGPD.
- Envio automático somente com canal autorizado e políticas compatíveis; avaliar WhatsApp Business Platform oficial para produção.
- Antes de produção: revisão de permissões, testes de isolamento, recuperação, backups, custos e consentimento.
