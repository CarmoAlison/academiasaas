# Deploy na Vercel

O projeto já está configurado para a Vercel (`vercel.json`). Siga os passos abaixo.

## 1. Antes de tudo: banco de dados

No **SQL Editor** do Supabase, o banco precisa estar com todos os scripts aplicados:

- **Banco novo:** `src/database/schema.sql` → `functions.sql` → `rls.sql` → `triggers.sql` → `seed.sql`
- **Banco já existente:** as migrações de `src/database/migrations/` que ainda não rodou (`001_…`, `002_…`)

## 2. Variáveis de ambiente

Na Vercel, cadastre em **Project Settings → Environment Variables** (marque *Production* e *Preview*):

| Nome | Onde encontrar no Supabase |
|---|---|
| `VITE_SUPABASE_URL` | Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → `anon` `public` |

- São os mesmos valores do seu `.env` local. O `.env` **não** é enviado (está no `.gitignore` e no `.vercelignore`).
- A chave `anon` é pública por natureza. A segurança vem da RLS do banco.
- **Nunca** cadastre a chave `service_role`.
- As variáveis entram no momento do **build**. Se alterar alguma, faça **Redeploy**.
- Se faltar alguma variável, o build falha de propósito, com a mensagem *"Variáveis de ambiente ausentes"*. Assim um site quebrado nunca é publicado.

## 3. Publicar

### Opção A — pelo GitHub (recomendado: deploy automático a cada push)

1. Crie um repositório no GitHub e envie o projeto (pelo [GitHub Desktop](https://desktop.github.com) ou com `git`).
2. Na Vercel: **Add New… → Project → Import** o repositório.
3. A Vercel detecta **Vite** sozinha. Não altere Build Command nem Output Directory, porque o `vercel.json` já define.
4. Adicione as variáveis do passo 2 e clique em **Deploy**.

### Opção B — pela linha de comando (sem Git)

```bash
npx vercel login
npx vercel link                                   # cria/vincula o projeto
npx vercel env add VITE_SUPABASE_URL production   # cole o valor quando pedir
npx vercel env add VITE_SUPABASE_ANON_KEY production
npx vercel env add VITE_SUPABASE_URL preview
npx vercel env add VITE_SUPABASE_ANON_KEY preview
npx vercel --prod                                 # publica em produção
```

## 4. Ajustes no Supabase após o primeiro deploy

Em **Authentication**:

- **URL Configuration → Site URL:** coloque a URL do site (ex.: `https://seu-app.vercel.app` ou seu domínio).
- **Providers → Email:** deve estar **habilitado**. "Confirm email" pode ficar como estiver, porque os usuários já são criados confirmados.
- **Minimum password length:** mantenha em **6**. É o tamanho da senha padrão (6 primeiros dígitos do CPF).
- **Secure password change:** deixe **desligado**. A troca de senha do sistema já confirma a senha atual antes de trocar.

## 5. O que o `vercel.json` já faz

- **Rotas da SPA:** qualquer URL (`/admin/alunos/123`, `/client/aulas`…) abre o app, inclusive ao atualizar a página.
- **Cache:**
  - arquivos de `/assets` (com hash no nome) ficam em cache por 1 ano;
  - o `index.html` sempre busca a versão nova;
  - quem estava com o site aberto durante um deploy recarrega sozinho uma vez.
- **Cabeçalhos de segurança:** `Content-Security-Policy`, `X-Frame-Options: DENY` (impede o site dentro de iframes de terceiros), `nosniff`, `Referrer-Policy` e `Permissions-Policy`.
- **Sobre a CSP:**
  - só permite scripts do próprio site;
  - só permite conexões com `*.supabase.co`;
  - libera o Google Fonts e as imagens do Storage do Supabase;
  - `wasm-unsafe-eval` é necessário para gerar o **PDF do recibo** (o motor de layout é WebAssembly). Ele não libera `eval` de JavaScript.
- **Indexação:** `robots.txt` e a meta tag `noindex` impedem o Google de indexar o sistema, que é privado.

## 6. Domínio próprio

- **Do site:** Vercel → Project → **Settings → Domains**. Nada muda no código.
- **Domínio próprio no Supabase** (em vez de `*.supabase.co`): no `vercel.json`, troque `https://*.supabase.co` e `wss://*.supabase.co` pelo seu domínio em `img-src` e `connect-src`.

## 7. Checklist depois de publicar

- [ ] Login com o Super Admin do seed (CPF `123.456.789-09`) e **troca da senha padrão**
- [ ] Criar uma academia e entrar com o admin dela
- [ ] Atualizar a página (F5) numa rota interna, ex. `/admin/alunos`
- [ ] Registrar um pagamento → o recibo abre → **Baixar PDF**
- [ ] Área do aluno: ver o recibo, reservar uma aula
- [ ] Alternar tema claro/escuro
- [ ] Auditoria: os logs aparecem

## 8. Problemas comuns

| Sintoma | Causa / solução |
|---|---|
| Build falha com "Variáveis de ambiente ausentes" | Cadastre as variáveis (passo 2) e faça Redeploy |
| Tela de login com aviso "Supabase não configurado" | Variáveis vazias no build: confira os valores e faça Redeploy |
| "CPF ou senha incorretos" com a senha certa | Scripts do banco não aplicados no projeto Supabase dessa URL |
| Erro "Could not find a relationship…" na auditoria | Rode `migrations/001_logs_fk_academies.sql` |
| Recibo não abre / erro ao buscar recibo | Rode `migrations/002_recibos.sql` |
| Algo bloqueado no navegador (console fala em *Content Security Policy*) | Domínio externo novo: adicione-o na diretiva correspondente do `vercel.json` |
