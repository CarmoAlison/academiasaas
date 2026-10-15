# Academia SaaS

SaaS multi-tenant para gestão de academias — React 18+ · Vite · React Router v6 · TanStack Query · Supabase (Auth, Postgres, RLS, Storage) · CSS Modules.

## Setup

### 1. Banco de dados (Supabase)

No **SQL Editor** do seu projeto Supabase, execute os arquivos de `src/database/` **nesta ordem**:

| # | Arquivo | Conteúdo |
|---|---------|----------|
| 1 | `schema.sql` | Tabelas, índices e bucket `avatars` |
| 2 | `functions.sql` | Helpers de RLS (`has_permission`, `is_member`…) e RPCs (criar academia/aluno/equipe, reset de senha, reservas, dashboards, logs) |
| 3 | `rls.sql` | Row Level Security de todas as tabelas + storage |
| 4 | `triggers.sql` | Auditoria automática, `updated_at`, perfis padrão por academia, proteções |
| 5 | `seed.sql` | Permissões globais, planos SaaS, super admin e academia demo (idempotente) |

Depois, **sempre** execute em ordem os arquivos de `src/database/migrations/`. Em banco novo, rode todos; em banco existente, só os que ainda não rodou. Todas podem ser executadas mais de uma vez sem problema. A partir da 006, as novidades existem **apenas** nas migrações.

| Migração | O que faz |
|---|---|
| `001_logs_fk_academies.sql` | FK dos logs → academias (corrige a auditoria) |
| `002_recibos.sql` | Recibos: numeração, personalização por academia, logo e RPC `get_receipt` |
| `003_assinatura_recibo.sql` | Assinatura no recibo: imagem PNG ou nome em letra cursiva acima da linha |
| `004_recibo_saas.sql` | Recibo das faturas do SaaS (Super Admin → academia) e tela "Assinatura do sistema" do Admin |
| `005_treino_semanal.sql` | Treino semanal: ficha com dias da semana, salvo em um lançamento; aluno marca cada dia |
| `006_seguranca.sql` | Bloqueio de login após 5 erros, troca de senha segura, logs com limite/deduplicação e limpeza automática |
| `007_desempenho.sql` | Regras de acesso mais rápidas, índices e views para listas paginadas no servidor (alunos, pagamentos, treinos) |
| `008_regras_negocio.sql` | Validade do plano (duração em meses) e renovações, inadimplência automática com bloqueio de reservas, limite de alunos do plano SaaS, mesmo CPF como aluno e equipe, configurações da academia |
| `009_aulas_checkin_whatsapp.sql` | Lista de espera, prazo de cancelamento e limite semanal de aulas; check-in por QR Code dinâmico ou manual, frequência e alunos sumidos; registro de envios do WhatsApp; upload de vídeos dos exercícios |
| `010_contrato_identidade_relatorios.sql` | Contrato digital com aceite eletrônico; logo e cor da academia no sistema; relatórios com filtros e exportação (permissões `relatorios.ver`/`relatorios.exportar`); checklist de primeiro acesso |
| `011_suporte_avisos_papeis.sql` | Papéis da equipe do SaaS (Administrador, Suporte, Financeiro) aplicados no banco; avisos em faixa para as academias; central de suporte com chamados |
| `012_checkin_qr_5min.sql` | QR Code de check-in passa a trocar a cada 5 minutos |
| `013_chamados_tempo_real.sql` | Chamados em tempo real (mensagens e status chegam na hora via Supabase Realtime) |
| `014_planos_adicionais_ofertas.sql` | Planos Básico, Mult e Business; adicionais (ex.: Pagamentos online); ciclo anual com desconto; ofertas com vagas e região; faturas com detalhamento; limite de unidades por plano |
| `015_resumo_financeiro_criterios.sql` | Resumo do financeiro com os dois critérios (data do pagamento x vencimento; vencidos x inadimplentes com tolerância) |
| `016_logo_modo_escuro.sql` | Logo da academia para o modo escuro (logo do modo claro já existia) |
| `017_modulos_academia.sql` | Módulos por academia: catálogo editável, módulos por plano, ajuste por academia e bloqueio no banco |
| `018_super_admin_gestao.sql` | Gestão do Super Admin: novas métricas do dashboard, visão geral das academias, busca global, anexos e respostas prontas nos chamados, avisos por plano/módulo, perfil e alertas |
| `019_gestao_academia.sql` | Gestão da academia: dados e endereço editáveis pelo admin, multa/juros/PIX, horário de funcionamento (check-in só com a academia aberta), aniversariantes e histórico do aluno |
| `020_evolucao_aluno.sql` | Evolução do aluno: marcação por exercício e carga usada (gráfico de evolução), meta semanal, sequência de semanas e conquistas |
| `021_limites_do_plano.sql` | Limites de unidades e de alunos do plano valem também para o Super Admin dentro da academia; uso de unidades no `academy_usage` |
| `022_lixeira.sql` | Lixeira geral: o que a academia exclui (mensalidades, alunos, equipe, planos, unidades, exercícios, treinos, aulas, perfis) some e para de contar; Super Admin vê, restaura ou apaga; após 15 dias é apagado de vez com tudo ligado |
| `023_uma_ficha_por_aluno.sql` | Cada aluno tem uma ficha de treino só (o banco recusa a segunda); o nome da ficha deixa de ser pedido |
| `024_catraca.sql` | Catraca Control iD (iDFace + iDBlock Next): equipamentos (Super Admin, senha criptografada), modo online/push via Edge Function `catraca`, cadastro facial, liberação manual, regras de bloqueio por academia, permissões e módulo adicional |
| `025_catraca_fotos.sql` | Catraca: permissão de leitura nas fotos do cadastro facial (corrige "Você não tem permissão" ao enviar a foto) |
| `026_contrato_lgpd.sql` | Termo de LGPD (com consentimento do reconhecimento facial) no fim de todo contrato e aceite obrigatório ao entrar na área do aluno |
| `027_catraca_resposta.sql` | Catraca: resposta da identificação no formato da Control iD (portal_id numérico) — corrige "Entrou" no log sem a catraca girar |
| `028_catraca_digital.sql` | Catraca: biometria por digital (método "Biometria (digital)" no cadastro da catraca, cadastro da digital pela ficha do aluno via remote_enroll, rosto só para catracas faciais, "Digital" no log e termo de LGPD com a digital) |

### 2. Frontend

```bash
cp .env.example .env   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

> **Deploy na Vercel:** veja o passo a passo em [DEPLOY.md](DEPLOY.md).

### 3. Usuários do seed

Login = CPF · senha = 6 primeiros dígitos do CPF (troca obrigatória no 1º acesso).

| Perfil | CPF | Senha |
|---|---|---|
| Super Admin | 123.456.789-09 | 123456 |
| Admin (Academia Demo) | 111.444.777-35 | 111444 |
| Instrutor | 390.533.447-05 | 390533 |
| Aluno | 529.982.247-25 | 529982 |

> **Troque a senha do Super Admin imediatamente em produção.**

## Arquitetura

### Autenticação por CPF

- O Supabase Auth usa o e-mail interno `{cpf}@academia.internal`. O usuário digita apenas o CPF.
- Os usuários são criados no servidor por RPCs `security definer` (`create_academy`, `create_student`, `create_staff`, `create_super_admin`), sem service key no frontend.
- **Um usuário Auth por CPF, um `profile` por academia.** A mesma pessoa pode estar em várias academias. Com mais de um vínculo, ela escolhe a academia após o login (`/selecionar-academia`).
- Consequência: a senha é **única por CPF**, e um reset feito por qualquer academia vale para todas.
- Reset pelo admin (`reset_password`) volta para os 6 primeiros dígitos e força a troca no próximo acesso.

### Multi-tenant e permissões

- Toda tabela de domínio tem `academy_id`. O isolamento é garantido por RLS, não pelo frontend.
- Permissões granulares `recurso.acao` (ex.: `alunos.criar`) ficam na tabela `permissions`, e os perfis (`roles`) são criados por academia.
- O perfil **Admin** tem tudo. **Instrutor** começa sem nada. **Aluno** só vê os próprios dados.
- No frontend: `ProtectedRoute` (sessão + troca de senha), `RoleGuard` (área) e `PermissionGuard` (permissão).
- Super Admin pode **"acessar como"** qualquer academia (banner de aviso; tudo auditado).

### Auditoria

- `audit_logs`: trigger em INSERT/UPDATE/DELETE (inclui `soft_delete`), com JSON antes/depois, usuário e IP (header `x-forwarded-for`).
- `access_logs`: login/logout via RPC `log_access`.
- `errors`: erros do frontend (ErrorBoundary + `window.onerror` + `unhandledrejection`) via RPC `log_error`.

### Recibos

- Ao quitar um pagamento, o trigger `payments_receipt` gera o **número sequencial por academia** e registra quem recebeu.
- O admin personaliza o recibo em **Financeiro → Personalizar recibo** (logo, cor, estilo, textos, assinatura, o que exibir), com pré-visualização ao vivo.
- A academia e o aluno veem o recibo no sistema e baixam/compartilham em **PDF** (`@react-pdf/renderer`, carregado sob demanda).
- Os dados vêm da RPC `get_receipt`, que só libera o recibo ao próprio aluno ou a quem tem `financeiro.ver`, e apenas para pagamentos quitados.

### Estrutura

```
src/
  components/   ui/ (design system), shell/ (sidebar, topbar, bottom nav), audit/, auth/, profile/, charts/, feedback/
  contexts/     AuthContext, TenantContext
  hooks/        useAuth, usePermissions, useForm, useMutationToast, useSupabase…
  services/     supabaseClient + um service por domínio
  routes/       AppRoutes, ProtectedRoute, RoleGuard, PermissionGuard
  pages/        auth/ · super-admin/ · admin/ · client/   (áreas isoladas)
  database/     schema.sql · functions.sql · rls.sql · triggers.sql · seed.sql
  styles/       variables.css, global.css
```

Cada área tem seu layout e seu arquivo de rotas (`SuperAdminRoutes`, `AdminRoutes`, `ClientRoutes`). O que é comum às áreas fica em `components/`.
#   a c a d e m i a s a a s  
 