# Dependências entre serviços

## Configuração

Em **Serviços → Novo serviço** ou **Editar**, use **Procedimentos obrigatórios**. Um serviço pode continuar sem dependências ou exigir até 20 serviços distintos. Defina:

- serviço obrigatório;
- antes ou depois do serviço principal;
- obrigatoriamente no mesmo dia ou permitir dias diferentes;
- intervalo mínimo e máximo, em minutos;
- opção independente para exigir horários consecutivos.

O intervalo é contado do **término do atendimento anterior ao início do seguinte**. Por exemplo, manutenção termina às 10h30 e gel começa às 11h: intervalo de 30 minutos. Mesmo dia usa o calendário de Brasília. Máximo vazio significa sem limite; consecutivos exige intervalo zero. Um dia equivale a 1.440 minutos.

Criação e edição das regras usam a permissão existente `services.manage`, com validação no backend. A configuração não concede novas permissões administrativas. Autorizações de desativação de serviços continuam separadas.

Não são aceitas dependências de um serviço com ele mesmo, referências inexistentes, duplicações ou ciclos diretos/indiretos. Alterações concorrentes do catálogo são serializadas para evitar que duas operações criem um ciclo juntas. O serviço e suas regras são salvos na mesma transação.

## Agendamento

No agendamento público e em **Agenda → Novo agendamento**, selecione os serviços principais. O sistema resolve os procedimentos obrigatórios, inclusive os indiretos, e apresenta suas regras. Cada realização possui profissional, data, horário, duração, preço, status e comanda próprios.

Por padrão, uma realização obrigatória é compartilhada quando vários serviços exigem o mesmo procedimento. Ela precisa satisfazer todas as regras associadas. Se as datas exigirem realizações distintas, **Reservar outra realização para…** cria uma escolha separada, com preço e sinal explícitos. É possível voltar ao compartilhamento antes de confirmar. As quantidades explícitas de um pacote permanecem preservadas.

Todos os horários são escolhidos antes da confirmação. Não podem se sobrepor para a cliente, mesmo com profissionais diferentes. A confirmação revalida habilitação, expediente, disponibilidade, preços, sinais, ordem, datas e intervalos. Mudanças nas condições pedem uma nova revisão.

As reservas são confirmadas em uma única transação. Bloqueios por conta e por profissional evitam conjuntos parciais e disputas de horário. Reenvios da mesma solicitação retornam o conjunto existente; reutilizar a chave para dados diferentes é recusado.

Serviços inativos ou sem profissional habilitado com expediente impedem a confirmação e são identificados na escolha. Serviços sem dependências continuam disponíveis tanto pelo fluxo novo quanto pelos endpoints anteriores. Os endpoints antigos recusam novas reservas de serviços com dependências, evitando contornar a confirmação do conjunto.

## Pacotes e sinal

As dependências são resolvidas também para os serviços dos pacotes. Se o procedimento obrigatório já estiver incluído, sua realização pode ser reutilizada. Caso contrário, aparece como adicional avulso, com cobrança explícita.

O pacote mantém a regra existente **sem sinal**. Somente os procedimentos adicionais não incluídos seguem a regra de sinal normal do salão. O resumo mostra cada valor, os rateios do pacote, o total e os prazos dos sinais avulsos. O preço promocional é rateado pelo mesmo cálculo em centavos já usado pelos pacotes, sem criar desconto implícito nos adicionais.

Os itens incluídos respeitam a validade do pacote. Um adicional avulso segue suas próprias regras de datas e os intervalos da dependência; não recebe uma utilização do pacote. A aquisição e todas as reservas, inclusive os adicionais, são gravadas na mesma transação.

## Agenda, comanda e histórico

As reservas exibem um identificador comum de conjunto na Agenda, no histórico administrativo da cliente e na lista pública de agendamentos. A comanda mostra os atendimentos vinculados, profissionais, horários, status e as regras registradas na reserva.

Regras, nomes, preços e duração da reserva não seguem alterações posteriores do catálogo. Uma remarcação valida as condições salvas originalmente e mantém o preço e a duração combinados. A lista de horários de remarcação já filtra alternativas incompatíveis; o backend repete a validação ao salvar.

Cancelamentos, faltas e devoluções de utilizações exigem reconhecimento explícito do impacto quando a comanda pertence a um conjunto. Nenhuma dessas ações cancela automaticamente os demais atendimentos ou gera estornos. O vencimento automático de sinal continua cancelando somente a respectiva reserva. Conjuntos com cancelamentos ficam destacados para regularização pela equipe. O painel de vínculos se atualiza após alterações e a cada 30 segundos.

Master/Admin mantêm o alcance administrativo autorizado. O Operacional só cria ou altera reservas do próprio profissional; reassociar ou reservar outra profissional exige alcance administrativo. Na comanda própria pode consultar os metadados dos atendimentos relacionados para cumprir as regras do conjunto, sem ganhar acesso às outras comandas ou aos seus dados financeiros. Acesso direto à comanda de outra profissional continua bloqueado.

## Banco, limites e testes

A migração **`007_service_dependencies.sql`** cria `treatment_dependencies`, `booking_groups` e `booking_group_members`, além do snapshot de duração nas novas linhas. As reservas antigas permanecem intactas e não recebem dependências retroativamente.

Execute `npm run db:migrate` no backend com `DATABASE_CONNECTION_STRING` configurada, depois compile frontend e backend. O inicializador local existente já executa as migrações. Não há dependência da reestruturação de Financeiro; esta branch parte de `perfil-permissoes`.

Limites: até dez serviços principais avulsos, vinte itens de pacote, vinte dependências diretas por serviço e quarenta atendimentos por conjunto. Intervalos podem ter até 525.600 minutos. Estes limites são validados no backend.

Os testes usam bancos descartáveis e cobrem edição/criação, ciclos concorrentes, dependências compartilhadas/separadas, profissionais diferentes, ordem, intervalos, fuso, horários consecutivos, reenvios, atomicidade, pacotes, alterações do catálogo, permissões e remarcações. Execute `npm run test:dependencies` no backend com `TEST_DATABASE_CONNECTION_STRING` para a conexão administrativa de testes. Dados demonstrativos ficam exclusivamente na prévia descartável.
