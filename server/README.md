# Vick Studio Server

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

## Agendamento online e sinal

Aplicar `npm run db:migrate` com `DATABASE_CONNECTION_STRING` antes de iniciar
esta versão da API. A migração `002_online_booking.sql` usa as tabelas existentes
de clientes, pessoas, funcionários, procedimentos e agenda. Corrige-se também
no `db/init.sql` a chave primária de `salon_treatments`, necessária para criar
um banco do zero. A migração preserva as reservas antigas como `confirmed`.

A implementação não envia e-mails, conforme o escopo definido. O acompanhamento
acontece na área do cliente e na Agenda do salão.

### Ativação

1. Cadastrar os usuários da equipe em Usuários.
2. Em Funcionários, vincular cada profissional ao seu usuário, procedimentos
   habilitados, dias e horário de expediente. A tela agora persiste os dados;
   os antigos registros demonstrativos em memória não são utilizados.
3. Como ADMIN/MASTER, abrir Configurações da agenda, definir antecedência de
   1, 2 ou 3 dias, percentual/valor fixo e instruções de pagamento, e ativar
   o agendamento online. Ele começa desativado para não aceitar reservas sem
   que o salão tenha definido suas condições.
4. O botão Agendar Agora abre `/agendar`. O cadastro do cliente é independente
   dos usuários administrativos. CPF validado, e-mail normalizado, índices únicos,
   bcrypt e sessões opacas revogáveis em banco protegem esse acesso. O cookie
   `customerSession` é HttpOnly, SameSite=Strict e Secure em produção.
5. Sob proxy reverso, preservar o Host original ou definir `PUBLIC_ORIGIN`
   (por exemplo `https://salao.example`) para a verificação de origem dos POST/PUT.

O cadastro existente de um cliente presencial não é reivindicado automaticamente
apenas pelo CPF informado publicamente: a API informa que é preciso contatar o
salão. Recuperação de conta de cliente e vinculação assistida de cadastros antigos
não fazem parte desta entrega.

### Prazos e estados

Todos os horários são de `America/Sao_Paulo`. Um atendimento na sexta-feira com
antecedência de 1 dia tem prazo até quinta-feira às 23:59:59.999. A alteração da
configuração afeta novas reservas; preço, sinal, instruções e prazo são guardados
na reserva existente. O valor fixo é limitado ao total do atendimento.

`awaiting_deposit` ocupa o horário. A profissional vinculada ao agendamento,
ADMIN ou MASTER confirma o recebimento na comanda, com valor, usuário e data
registrados; o status passa a `confirmed`. Não há pagamento presumido nem
integração bancária. O sinal é separado do valor total e o saldo previsto é
exibido; a criação da reserva não cria receita nem atendimento concluído.

A API mantém uma rotina de expiração a cada minuto (também executada ao iniciar).
Ela cancela reservas pendentes cujo prazo terminou, mantém o histórico e registra
`Deposit was not confirmed by the deadline.` como motivo. A interface exibe esse
motivo em português ao abrir a comanda. Reservas canceladas aparecem na seção
Cancelamentos do dia, sem bloquear os horários. A API deve permanecer em execução;
em hospedagem que desliga processos em ociosidade, executar essa rotina por um
worker/cron persistente antes de colocar o fluxo em produção. Consultas do cliente,
de disponibilidade e de comanda também conciliam reservas vencidas.

O prazo padrão do sinal não limita os dias disponíveis para agendamento. Se ele
já passou (inclusive reservas para hoje), a cliente recebe um prazo curto,
configurável de 1 a 24 horas em Configurações da agenda, inicialmente 2 horas.
Esse limite nunca ultrapassa o início do atendimento. Com antecedência de 1 dia,
a reserva para amanhã continua com prazo até hoje às 23h59; a reserva para
sexta-feira continua até quinta às 23h59. Alterar essa configuração não muda
prazos já armazenados. A migração 003 acrescenta esse parâmetro.

A revisão exibe o prazo exato. Para reservas próximas, a confirmação aceita a
revisão por até 15 minutos (e apenas enquanto o prazo ainda está no futuro),
preservando o limite mostrado em vez de renová-lo a cada tentativa. Se a revisão
ficar desatualizada, consultar novamente o horário. Na área do salão, a equipe
continua podendo informar um prazo específico futuro anterior ao atendimento.
Funcionários operacionais só fazem essa reserva para si; ADMIN/MASTER podem
selecionar qualquer profissional.

A criação valida novamente preço, sinal, expediente, duração e habilitação no
backend. Uma chave UUID por solicitação permite repetir a mesma requisição sem
criar uma segunda reserva; reutilizar a chave com outros dados retorna 409.
Bloqueios por profissional serializam a criação, e gatilhos no banco impedem
sobreposições inclusive ao alterar horários ou reativar reservas por outros
escritores. Confirmação e expiração disputam o mesmo bloqueio de linha, garantindo
que um sinal confirmado não resulte em cancelamento automático por falta de sinal.
O endpoint antigo POST `/schedules` não cria mais reservas sem prazo/sinal;
utilizar POST `/booking/staff-bookings`.

### Validação

Com `TEST_DATABASE_CONNECTION_STRING` de um PostgreSQL local com CREATEDB:

- `npm run test:booking`: banco descartável, cadastro e duplicações, sessões
  separadas, preços/duração/prazos, concorrência, idempotência, autorização,
  expiração em segundo plano, liberação de vagas e reserva excepcional pela equipe.
- `npm run test:password-reset`: regressão da funcionalidade de senha temporária.

Os testes criam e removem apenas seus próprios bancos aleatórios. Não cadastram
clientes reais nem alteram contas do salão. O limitador de cadastro/login usa
memória por instância (10 tentativas/minuto por IP); para múltiplas instâncias,
configurar um armazenamento compartilhado no `@fastify/rate-limit`.

## Clientes, histórico e comanda

A migração `004_customer_history_orders.sql` reutiliza `customers`, `persons`,
`customer_accounts`, `salon_schedules`, `salon_schedule_treatments` e as tabelas
financeiras existentes. Executar `npm run db:migrate` antes de iniciar a API.
Não há criação de uma segunda base de clientes e nenhum DTO administrativo
contém senha, hash ou token do cliente.

- ADMIN/MASTER consultam todos os clientes, editam nome/CPF/e-mail/telefone e
  acessam observações internas gerais. A alteração cadastral é auditada; mudar
  o e-mail também muda o login e revoga as sessões do cliente, preservando sua senha.
- Uma profissional operacional ativa consulta os clientes vinculados aos seus
  agendamentos. Histórico, pagamentos e totais são filtrados pelos atendimentos
  da própria profissional. Cadastro e notas gerais são exclusivos da administração.
- As observações de cada atendimento são separadas das notas gerais. A profissional
  responsável e ADMIN/MASTER podem acrescentá-las; não são enviadas à área pública.
- A busca administrativa atende nome, CPF, telefone e e-mail, com páginas de 20
  registros. Cadastros presenciais antigos também aparecem, reaproveitando os
  contatos existentes quando disponíveis.

Na comanda, consumos têm descrição, quantidade, valor unitário, autor e data.
Cancelar um item exige motivo e mantém o lançamento original auditável. Itens
podem ser alterados enquanto a reserva aguarda sinal ou está confirmada/em atendimento;
após a conclusão seus valores permanecem no histórico. Não há integração de estoque.

O sinal confirmado gera um recebimento financeiro na mesma transação da baixa,
com uma restrição para que não seja contado duas vezes. Pagamentos adicionais
são registrados em `salon_transactions`, vinculados à comanda. Eles não podem
exceder o saldo da comanda. Estornos são novos registros (não exclusões), restritos
a ADMIN/MASTER e vinculados ao recebimento original; a soma não pode exceder o
que foi recebido. Recebimentos, consumos e estornos usam UUID de solicitação e
bloqueio da comanda para evitar duplicações e ultrapassagem do saldo por concorrência.
Os registros são manuais e não executam transferência ou cobrança bancária.

O total efetivamente pago é a soma dos recebimentos/sinais menos os estornos.
Consumo adicionado, reserva criada e procedimento concluído não contam como
pagamento. O saldo inclui procedimentos e consumos ativos. Eventual valor pago
acima da cobrança após cancelar um consumo aparece como crédito a devolver;
nenhum estorno é lançado automaticamente.

A conclusão do atendimento fica disponível a partir do horário marcado, apenas
para a responsável ou administração. Procedimentos entram como realizados somente
com status `completed`, registrando data e usuário da conclusão. Concluir não
registra pagamento nem exige quitação: débitos continuam visíveis. Cancelamentos
permanecem no histórico. Nomes e preços dos procedimentos são guardados no vínculo
da comanda e alterações no catálogo não os reescrevem. Para registros anteriores,
o nome disponível na data da migração é preservado; preços já gravados são mantidos.

A migração importa sinais antigos confirmados apenas quando a comanda não tem
recebimentos manuais vinculados, evitando contar o mesmo dinheiro duas vezes.
Recebimentos manuais existentes são preservados; saídas de estoque não são tratadas
como estornos. Comandas antigas que já têm registros financeiros devem ter sua
conciliação conferida pela equipe, pois a base anterior não identificava quais
recebimentos manuais já incluíam o sinal. Uma transação antiga vinculada a várias
comandas interrompe a migração para que sua distribuição seja conciliada explicitamente.

Endpoints principais: `/customers`, `/customers/:id`, `/customers/:id/history`,
`/customers/:id/payments`, `/customers/:id/notes` e `/orders/:id` com sub-recursos
`consumptions`, `payments`, `notes` e `complete`. A autorização é feita no backend,
inclusive nas rotas antigas de consulta da Agenda, comanda, busca de clientes e
transações. O financeiro global exige ADMIN/MASTER.

Testes: com `TEST_DATABASE_CONNECTION_STRING` de um PostgreSQL local com CREATEDB,
executar `npm run test:customers`. A suíte usa bancos aleatórios descartáveis e
verifica busca, paginação, permissões/IDOR, ausência de credenciais, consumos,
idempotência, recebimentos, estornos concorrentes, migração financeira, conclusão,
preços históricos e edição cadastral. `npm run test:password-reset` cobre a regressão
anterior. Não são alteradas contas ou recebimentos reais durante os testes.
