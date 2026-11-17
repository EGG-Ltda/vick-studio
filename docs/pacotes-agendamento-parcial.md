# Agendamento parcial e pagamento mínimo dos pacotes

## Uso

Em **Social → Promoções e pacotes**, configure o pagamento mínimo: 100% exige pagamento integral; um percentual menor permite pagamento parcial. A porcentagem é aplicada ao valor total do pacote, com arredondamento para cima no centavo necessário.

Na área pública, cada utilização contratada aparece separadamente. Um pacote com 2× Cabelo e 2× Sobrancelha conserva quatro utilizações. A cliente escolhe um ou mais conjuntos completos e seleciona profissional, data e horário na ordem das dependências. Horários incompatíveis com as escolhas anteriores não aparecem.

Os procedimentos incluídos mostram somente **Incluído no pacote**. Procedimentos obrigatórios adicionais têm valor e sinal próprios, informados no resumo. O pacote pode ter seus horários reservados antes de atingir o pagamento mínimo e não é cancelado automaticamente por falta desse pagamento.

Depois da confirmação, o aviso do saldo oferece **Agendar utilizações restantes**. Isso reutiliza a aquisição e suas condições, sem nova compra do pacote. O resumo compacto apresenta estados de disponibilidade, reserva, realização, cancelamento, falta e expiração. A listagem extensa de agendamentos foi removida dessa tela; os registros administrativos permanecem.

## Pagamento e realização

ADMIN/MASTER com a permissão existente de recebimentos de pacotes registram os valores na comanda. Recebimentos menos estornos precisam atingir o mínimo para permitir **Iniciar atendimento** ou **Concluir atendimento**. As operações são verificadas no backend e por um gatilho no banco, com bloqueio transacional do pacote.

Pagamentos de utilizações ainda sem horário permanecem no livro financeiro, vinculados à utilização. Quando a reserva for feita, os mesmos lançamentos são associados à comanda, sem criar novos recebimentos. O rateio continua interno e preserva cada centavo. O histórico financeiro do cliente considera também os lançamentos ainda sem comanda. Funcionários operacionais recebem apenas a indicação de liberação, sem os valores financeiros globais do pacote.

## Migração e pacotes antigos

Aplicar `011_partial_packages.sql` antes de iniciar o backend atualizado:

```powershell
npm.cmd run db:migrate --prefix server
npm.cmd run build --prefix server
npm.cmd run build --prefix client
```

A migração mantém agendamentos, utilizações e recebimentos. Copia os planos já registrados e identifica suas utilizações sem recalcular os valores históricos. Nenhum percentual é escolhido automaticamente para pacotes antigos.

Enquanto o percentual não estiver configurado, a campanha não aparece para novas aquisições públicas e os atendimentos do pacote não podem ser iniciados nem concluídos. Ao salvar o percentual da campanha, ele é aplicado às aquisições antigas ainda sem condição. Mudanças posteriores não alteram aquisições que já possuem uma condição registrada.

Preço, quantidade, nomes, duração, validade e regras das dependências são preservados na aquisição. A habilitação do profissional, o expediente, o almoço e os bloqueios são sempre validados com a disponibilidade atual.

Cancelamentos e devolução de utilizações continuam sendo decisões explícitas da equipe. Uma utilização devolvida que mantém um agendamento cancelado e seus vínculos deve ser remarcada pela equipe, preservando aquele histórico.

## API e concorrência

- `POST /customer/package-plan`: consulta da campanha ou do pacote adquirido pelo próprio cliente, com assinatura das condições e saldo.
- `POST /customer/package-slots`: horários válidos com a duração contratada e disponibilidade atual.
- `POST /customer/package-reservations`: aquisição com reserva parcial ou reserva de saldo, em uma única transação idempotente.
- `POST /orders/:id/start`: início do atendimento com permissão `agenda.complete`, que agora é descrita como iniciar e concluir atendimentos.

Cada conjunto é validado no servidor: propriedade, saldo, dependências diretas/indiretas, ordem, intervalos, habilitação, duração, validade e conflitos do cliente e do profissional. A confirmação bloqueia os profissionais em ordem e o pacote antes de consumir utilizações. Uma falha reverte todo o conjunto.

## Verificação

```powershell
# TEST_DATABASE_CONNECTION_STRING deve apontar para PostgreSQL local de testes.
npm.cmd run test:dependencies --prefix server
npm.cmd run test:packages --prefix client
npm.cmd run test:selections --prefix client
npm.cmd run test:availability --prefix client
```

Os cenários incluem aquisição parcial de 2+2, dependências pareadas e indiretas, adicionais, reenvios, concorrência no saldo e nos horários, propriedade, histórico após alterações no catálogo, recebimentos sem comanda, estornos, pagamento mínimo, proteção dos dados financeiros e configuração das aquisições anteriores.
