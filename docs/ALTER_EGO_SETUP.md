# Alter Ego: Supabase, Vercel e iPhone

Base: openGym, commit `e348fc17c42c7e9a211c5972e573ad3698190ee2`.
Licenças e atribuições originais permanecem em LICENSE e NOTICE.md.

## Estado da integração

O backend Supabase é selecionado quando `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY` estão configuradas no build. Sem essas variáveis,
o backend original do openGym permanece disponível.

Implementado: login por e-mail/senha, sessão persistente (Keychain no iPhone),
histórico/rotinas/medidas/configurações em PostgreSQL, revisão atômica para evitar
sobrescrita entre dispositivos e reaproveitamento da fila offline e conciliação
do openGym. O treino em andamento permanece no aparelho; o registro concluído
é sincronizado. O espelho de arquivo nativo também é mantido.

Limites desta primeira integração: fotos e vídeos próprios ainda não são enviados
ao Supabase Storage; permanecem locais e precisam de backup com mídia. Passkeys,
pareamento do servidor original, painel de administração, notificações web push,
atividade detalhada e AI Coach do servidor original não foram migrados. Recursos
nativos e assinatura iOS só podem ser validados no Mac/iPhone. O catálogo de
exercícios é incluído no pacote mobile e na publicação web.

## 1. Configurar o projeto Supabase (uma vez)

Projeto: `https://wyniywjpxonqudumpxzr.supabase.co`.

1. Abra SQL Editor → New query no painel desse projeto.
2. Cole e execute o conteúdo completo de
   `supabase/migrations/202610220001_fitness_state.sql`.
3. Em Authentication → Users → Add user → Create new user, crie sua conta com
   e-mail e senha, confirmando o e-mail pelo painel quando aplicável. Não envie a
   senha no chat nem a coloque no repositório. Não criamos uma conta automaticamente.
4. Em Authentication → Sign In / Providers, mantenha e-mail/senha habilitado e
   desabilite novos cadastros públicos se só você usará o aplicativo.

A tabela tem RLS e só permite leitura do próprio usuário. Escritas passam por uma
função que identifica o dono a partir do JWT e verifica a revisão dentro de uma
transação. Não é necessária `service_role` no frontend. RLS automático por si só
não substitui a execução da migração e seus grants/policies.

## 2. Preparar o Mac

Instale Xcode pela App Store, abra e conclua seus componentes. Com Node 24,
Git e CocoaPods instalados:

```sh
git clone https://github.com/DOMMDMM/FITNESS.git alter-ego
cd alter-ego/frontend
cp .env.example .env.local
npm ci
npm run build:mobile
npx cap open ios
```

Se já houver um checkout, preserve suas alterações locais e atualize-o; não execute
o clone sobre uma pasta existente. O `.env.example` inclui apenas a URL e a chave
pública do projeto. Nunca adicione chaves administrativas.

No Xcode, selecione App → Signing & Capabilities → Automatically manage signing,
selecione seu Personal Team e use um Bundle Identifier exclusivo. Mantenha esse
mesmo identificador nas atualizações. Conecte o iPhone, aceite confiar no Mac,
ative Modo de Desenvolvedor se solicitado, selecione o aparelho e clique Run.
O build iOS não foi executado no ambiente Linux.

Abra o app e entre com o e-mail e a senha criados no Supabase. Não é necessário
túnel, pareamento nem manter o Mac ligado. A assinatura gratuita deve ser renovada
no Xcode a cada sete dias; os dados sincronizados no Supabase não expiram com ela.
Não desinstale o app enquanto houver dados sem sincronizar.

## 3. Vercel

Importe DOMMDMM/FITNESS, mantendo Root Directory na raiz do repositório; o
`vercel.json` configura instalação, build e cópia do catálogo. Cadastre as duas
variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os valores de
`frontend/.env.example`. Não configure `VITE_MOBILE` na Vercel.
Um deploy é necessário depois de mudar as variáveis, pois o Vite as inclui no build.

## 4. Verificação com sua conta

1. Entre no iPhone, conclua um treino e aguarde o status de sincronização.
2. Entre com a mesma conta na versão web e confirme que o treino aparece.
3. No iPhone, ative modo avião, conclua outro treino, feche e reabra o app.
4. Confirme que o treino continua localmente; desative modo avião e confirme que
   chega à versão web sem apagar o anterior.
5. Exporte um backup e guarde fora do aplicativo. O plano gratuito do Supabase não
   deve ser tratado como garantia de backup, disponibilidade ou capacidade ilimitada.

Essa verificação real depende de migração aplicada, conta criada, deploy e iPhone;
os testes locais não estabelecem que essas etapas já aconteceram.

## Desenvolvimento e testes

```sh
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
npm run build
VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= npm test -- --maxWorkers=2
```

As variáveis vazias no comando de testes mantêm as suítes do backend original
isoladas de um `.env.local`. Os testes específicos do Supabase injetam seu cliente
e exercitam a migração em PostgreSQL local via PGlite, sem tocar no projeto remoto.
Use o checkout existente; cada tarefa cloud já é isolada. Não crie worktree sem
solicitação explícita.
