# Vick Studio Server

## Finance module

Apply `db/migrations/002_finance.sql` after the initial database schema and before
starting this version. Back up existing databases first. The migration preserves
existing records and can be reapplied.

Set `MASTER_USER_ID` in the server environment. Other users require
`finance.read`, plus `finance.write` for entries and reversals or `finance.export`
for Excel downloads. Assign permissions through `app_user_permissions`.

The frontend module is available at `/dashboard/financeiro`. It reports explicitly
completed treatment items and registered product sales. Historical prices and
discounts are stored in integer cents. Discounts apply to individual items; split
any attendance-wide discount between those items before recording completion.
Reversals preserve audit history and exclude the original entry from totals.

Legacy appointments are not automatically marked as completed. Worked hours
require actual start/end timestamps. Payment receipts and balances are not
reported because legacy transactions do not provide reliable reconciliation.

## Finance integration tests

Install dependencies and run `npm run build`. To run the PostgreSQL integration
suite, set `FINANCE_TEST_DATABASE_URL` to an empty, disposable database named
`finance_test`, then run `npm run test:finance`. The suite refuses to overwrite
an existing schema and checks authorization, historical prices, filters,
pagination, reversals, product sales and Excel totals.

## Senha temporária — issue #45

Com `DATABASE_CONNECTION_STRING` definida no ambiente, execute `npm run db:migrate`
antes de iniciar a API. Com um arquivo `.env`, também é possível executar
`node --env-file=.env scripts/migrate.cjs`. A imagem Docker inclui o comando
de migração, que pode ser executado dentro do container com as mesmas variáveis.

A migração preserva senhas existentes e acrescenta `is_admin`,
`must_change_password` e `password_version`. Novos usuários cadastrados pela API
começam com senha temporária. O cadastro existente do MASTER continua definido
por `MASTER_USER_ID`. A permissão ADMIN é indicada por `app_users.is_admin` e
deve ser atribuída por quem administra o banco, sem alteração desse campo pelos
formulários comuns de usuário.

Em Usuários, ADMIN e MASTER podem usar **Redefinir senha** em uma conta ativa.
ADMIN redefine apenas contas comuns. MASTER também pode redefinir contas ADMIN.
Essa operação não aceita a própria conta. A senha é definida e confirmada no
modal, armazenada com bcrypt e deve ser comunicada ao funcionário por um canal
privado.

O funcionário entra com a senha temporária e é direcionado a `/alterar-senha`.
A API permite consultar a sessão, sair e trocar a senha, enquanto bloqueia os
demais endpoints protegidos. A nova senha deve ser diferente da temporária.
Cada redefinição ou troca incrementa a versão das credenciais, invalidando tokens
anteriores de acesso e renovação. Atualizações concorrentes usam essa versão
na condição do UPDATE, permitindo uma única conclusão da troca.

Para testar, defina `TEST_DATABASE_CONNECTION_STRING` apontando para um PostgreSQL
local com permissão para criar bancos e execute `npm run test:password-reset`.
O teste cria um banco isolado, testa a migração sobre contas antigas e exercita
autorização, bloqueio, invalidação de sessões, concorrência e uso único. Ao terminar,
remove somente o banco temporário criado pelo próprio teste.
