# Disponibilidade dos funcionários

## Como usar

- Em **Funcionários → Equipe**, edite o profissional e configure entrada, saída e início do almoço em cada dia de trabalho. O intervalo de almoço dura uma hora. Dias desmarcados não oferecem horários.
- Para preservar os cadastros existentes, a migração não inventa horários de almoço: configure-os na edição. Novos cadastros sugerem 12h às 13h.
- O usuário operacional vinculado a um funcionário ativo encontra **Solicitar ausência** na Agenda. Pode pedir troca de almoço em uma data, ausência com início/fim ou férias com datas inicial/final inclusivas. Em **Meus pedidos**, consulta seu histórico e cancela pedidos pendentes.
- ADMIN e MASTER autorizados analisam em **Funcionários → Solicitações**, com filtros por nome, tipo, período e status. Aprovação, recusa e cancelamento ficam registrados com autor, data e justificativa. Há avisos internos com atalhos; não são enviados e-mails.

## Regras

Datas e expediente usam `America/Sao_Paulo`. Um atendimento precisa caber integralmente no expediente e não pode atravessar almoço ou bloqueios aprovados, inclusive em reservas administrativas, pacotes, conjuntos de serviços e remarcações.

Pedidos pendentes e recusados não bloqueiam a agenda. Uma troca de almoço aprovada substitui o almoço apenas naquela data. Não é permitido manter duas trocas pendentes/aprovadas de almoço para o mesmo dia.

O backend verifica os atendimentos existentes ao editar expediente/almoço e novamente ao aprovar. Conflitos retornam HTTP 409 e revertem a operação, sem cancelar atendimentos. O cancelamento de uma troca aprovada só restaura o almoço original se não houver conflitos. Os mesmos bloqueios transacionais por funcionário usados na confirmação de reservas protegem aprovações concorrentes.

O histórico guarda também os valores anteriores e novos do expediente. Motivos internos não são incluídos no catálogo público ou nas respostas de horários disponíveis.

## Permissões

Em **Funcionalidades por perfil**, foram adicionadas:

- `availability.view`: consultar solicitações e avisos próprios; exige Agenda.
- `availability.request`: enviar solicitações próprias; exclusivo de operacional autorizado.
- `availability.manage`: gerenciar pedidos da equipe; exclusivo de ADMIN/MASTER, exigindo consulta de Funcionários e disponibilidade.

O controle é aplicado no servidor e na interface. Um funcionário não pode informar outro funcionário no envio nem consultar pedidos alheios. Alterações de expediente continuam exigindo `employees.manage`. A Agenda recebe apenas tipo, período e identificação do bloqueio, respeitando o escopo de cada perfil.

## Banco e execução

Aplicar `010_employee_availability.sql` pelo mecanismo existente:

```powershell
npm.cmd run db:migrate --prefix server
npm.cmd run build --prefix server
npm.cmd run build --prefix client
```

O comando de migração usa `DATABASE_CONNECTION_STRING`; não altera registros de atendimentos. Cria as tabelas de pedidos, eventos e avisos, o campo de almoço, a função compartilhada de bloqueios e as permissões iniciais. O frontend e o backend devem ser atualizados juntos.

## Verificação

```powershell
# Requer TEST_DATABASE_CONNECTION_STRING apontando para um PostgreSQL local
# com autorização para criar bancos descartáveis.
npm.cmd run test:dependencies --prefix server
npm.cmd run test:availability --prefix client
npm.cmd run test:selections --prefix client
```

Os testes verificam expediente, duração, almoço, escopo de acesso, idempotência, avisos, auditoria, férias inclusivas, restauração com conflito e aprovação concorrente com reserva. A suíte mantém o limite real de requisições públicas e aguarda uma nova janela antes dos novos cenários.
