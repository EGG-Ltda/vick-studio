# Classes de acesso personalizadas

## Uso

Em **Funcionalidades por perfil**, a lista apresenta Admin, Operacional e as classes personalizadas. Use **Nova classe** para informar nome, descrição, nível de atuação, alcance dos dados e funcionalidades por módulo. Selecionar uma ação exige suas permissões de consulta e demais dependências. O nome da classe não concede poderes.

O Master tem acesso completo e não depende de uma classe configurável. Admin e Operacional continuam existindo, com os mesmos usuários, permissões e exceções anteriores. Clientes do agendamento público não participam dessas classes administrativas.

Na criação/edição em **Usuários**, selecione a classe de acesso. A ação **Classe de acesso** permite reatribuir um usuário sem alterar senha, status ou invalidar a sessão. A criação de contas continua exclusiva do Master. Admin autorizado reatribui somente funcionários dentro da delegação.

## Hierarquia e alcance

- Master configura todas as classes, inclusive as administrativas, seus alcances e os limites do Admin.
- Para autorizar Admin a criar/gerenciar classes operacionais, habilite **Criar, configurar e atribuir classes de funcionários delegadas pelo Master**, com as dependências indicadas.
- Master marca quais classes operacionais podem ser gerenciadas pelo Admin e quais permissões podem ser delegadas. Em uma nova classe criada pelo Admin, o teto inicial vem dos limites delegados no perfil Operacional e dos acessos efetivos do próprio Admin.
- Admin não altera classes administrativas, o próprio acesso ou qualquer Master. Também não muda o alcance de uma classe para todos os dados do salão.
- O alcance **Somente os próprios registros** restringe agenda, clientes, comandas, financeiro e comissões aos vínculos do funcionário. Ações administrativas globais ficam indisponíveis nesse alcance. Um usuário sem vínculo de funcionário não ganha registros de outro profissional.
- O alcance **Todos os registros autorizados do salão** é definido exclusivamente pelo Master. Ainda é necessário habilitar explicitamente cada funcionalidade. O nível operacional, por si só, nunca concede gestão de usuários ou classes.

## Sessões, exceções e auditoria

O backend lê a classe e suas permissões a cada solicitação. O frontend atualiza a sessão periodicamente, ao recuperar foco e após rejeições de autorização. Não é necessário fazer novo login para aplicar alterações de classe.

Exceções individuais existentes são preservadas e só têm efeito dentro do teto da classe atual, respeitando as dependências. Revogar o teto da classe impede imediatamente um acesso, mesmo com exceção individual positiva. A edição de exceções envia a identificação e a versão da classe para detectar uma reatribuição ocorrida enquanto o formulário estava aberto.

Criação/edição de classes e atribuições são registradas em `access_audit`, sem senhas ou hashes. O editor da classe apresenta o histórico recente. As classes originais não podem ser desativadas. Classes com qualquer usuário vinculado, inclusive desabilitado, exigem reatribuição explícita antes de desativação ou mudança de nível. Não existe exclusão de classes pela API.

## Migração

Aplicar `014_custom_access_classes.sql` pelo comando habitual `npm run db:migrate --prefix server`, com a conexão do ambiente configurada. A migração vincula as contas existentes às classes originais sem substituir as tabelas de permissões ou as exceções individuais. O perfil fixo interno é mantido como nível de hierarquia; a autorização efetiva usa a classe e o alcance dos dados.

As rotas antigas de configuração dos perfis originais continuam compatíveis. Classes personalizadas utilizam `/access/classes`; opções de atribuição ficam em `/access/classes/options`, e a atribuição acontece em `PUT /access/users/:id/class`.

## Validação

Os cenários de `server/tests/classes.cases.cjs` cobrem acesso financeiro isolado, alcance próprio e global, dependências, delegação, proteção do Master, sessão sem novo login, preservação de exceções, auditoria e concorrência entre atribuição e desativação. Fazem parte da suíte `npm run test:dependencies --prefix server`, usando banco descartável.
