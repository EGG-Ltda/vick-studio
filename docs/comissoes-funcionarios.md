# Comissões dos funcionários

## Acesso e configuração

Em **Funcionários → Porcentagens dos funcionários**, consulte percentuais, comissões, ajustes e fechamentos. A ação **Porcentagens** no cartão de cada profissional abre a configuração dos procedimentos habilitados. Os mesmos campos estão na aba Porcentagens ao editar o profissional.

Cada procedimento exige duas configurações explícitas: percentual avulso e percentual em pacote. Campo vazio é pendência; 0% é válido. Não há valores padrão, inclusive para novos funcionários e novas habilitações. A conclusão fica bloqueada até regularizar as pendências.

Em **Funcionalidades por perfil**, o Master controla as permissões de Admin e Operacional; o Admin delega apenas dentro dos limites já existentes. As permissões adicionadas são:

- `commissions.view`: consulta; Operacional vê somente os próprios dados.
- `commissions.manage`: configuração pela gestão autorizada.
- `commissions.adjust`: anulação de atendimento concluído pela gestão autorizada.
- `commissions.settle`: registro manual de fechamento/pagamento pela gestão autorizada.

## Cálculo e histórico

A conclusão reconhece a comissão uma única vez, independentemente do recebimento do cliente. Os critérios existentes de liberação de utilização de pacote continuam válidos. O cálculo utiliza valores decimais no PostgreSQL, com arredondamento monetário por procedimento. Base bruta, percentual e comissão ficam salvos; alterações futuras não recalculam os lançamentos concluídos.

Em pacotes, a base é o valor atribuído à utilização na aquisição, e o percentual é o específico para pacote. Serviços avulsos utilizam o valor bruto salvo da reserva. Se houver desconto, o fluxo que registra o desconto deve preservar `gross_price` e reduzir apenas o preço final; o campo bruto não pode ser alterado depois da reserva.

## Devoluções, anulações e pagamentos

No estorno da comanda, indique se a devolução se refere aos procedimentos, aos consumos/produtos ou a ambos proporcionalmente. O padrão proporcional considera os serviços e consumos existentes no recebimento original, e salva a parcela devolvida dos serviços. Consumos adicionados ou cancelados posteriormente não recalculam essa divisão. Uma devolução exclusivamente de produtos não diminui comissão de procedimento. Devoluções do pacote usam a distribuição monetária das utilizações já existente no sistema.

A comissão estornada é proporcional à parcela do valor final do serviço devolvida, limitada à comissão original e descontando os ajustes anteriores. Ex.: bruto R$100, comissão 40%, valor final R$80: devolver R$40 estorna R$20 de comissão; devolver os R$80 estorna os R$40. Os arredondamentos são cumulativos, evitando divergência de centavos em devoluções fracionadas.

Devoluções anteriores à conclusão são consideradas ao reconhecer a comissão. Anular um atendimento concluído estorna somente o restante da comissão; exige motivo e conferência do impacto nos vínculos. A anulação não devolve dinheiro, não cancela os demais atendimentos e não retorna automaticamente a utilização de pacote. Esses passos permanecem explícitos para a equipe.

Reconhecer comissão não registra pagamento ao funcionário. O fechamento é uma ação manual para registrar um pagamento já realizado, com forma de pagamento e descrição, gerando a saída correspondente no Financeiro. Todos os créditos/ajustes pendentes do profissional são incluídos, independentemente dos filtros da consulta. Ajustes posteriores a um fechamento permanecem como compensação para o próximo. Saldo negativo não gera saída nem desaparece.

## Migração e validação

Aplicar as migrações habituais: `npm run db:migrate --prefix server`, com `DATABASE_CONNECTION_STRING` do ambiente. As migrações `012_employee_commissions.sql` e `013_commission_refund_allocation.sql` preservam os registros existentes e reaproveitam o valor bruto financeiro, caso a coluna já exista. Atendimentos já concluídos antes da funcionalidade não recebem comissões retroativas inventadas. Reservas antigas sem valor bruto usam o preço que já estava salvo como base inicial; descontos anteriores sem valor bruto registrado não podem ser reconstruídos automaticamente.

Depois da migração, configure as porcentagens reais antes de concluir novos atendimentos. Nenhum 0% de teste é inserido no banco do salão.

Validação de integração: `npm run test:dependencies --prefix server`, com `TEST_DATABASE_CONNECTION_STRING` apontando para PostgreSQL local de testes; a suíte cria e remove um banco descartável.
