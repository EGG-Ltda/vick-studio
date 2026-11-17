# Social, aniversários e pacotes

## Uso

- **Social → Clientes** mantém o cadastro único e o histórico existente. Data de nascimento é obrigatória para novos cadastros públicos; cadastros antigos podem ser completados pela administração.
- **Social → Aniversariantes** consulta o mês e destaca o dia, no fuso `America/Sao_Paulo`. O aviso na área do salão aparece apenas no próprio dia. Funcionários veem somente clientes vinculados a seus atendimentos.
- **Social → Promoções e pacotes** permite que ADMIN/MASTER cadastrem título, descrição, arte PNG/JPEG/WebP de até 3 MB, texto alternativo, divulgação, preço, condições e quantidades de procedimentos. A campanha pode ser ativada ou desativada. Somente campanhas vigentes com procedimentos ativos aparecem abaixo de Serviços na home.
- Em **Configurações da agenda**, a validade dos novos pacotes pode ser definida entre 1 e 24 meses. O padrão é um mês-calendário a partir da aquisição, até o fim do dia correspondente em Brasília. O período da campanha é independente dessa validade.
- A cliente escolhe todos os procedimentos, profissionais, dias e horários antes de confirmar. Horários podem ser diferentes, mas não sobrepostos. Falha em qualquer reserva desfaz toda a aquisição.
- Os pacotes ficam confirmados **sem sinal e sem pagamento automático**. Agendamentos avulsos continuam seguindo sua regra de sinal.
- Na comanda, ADMIN/MASTER registram os recebimentos e estornos no painel do pacote. Na comanda individual são recebidos apenas os consumos extras. Esses registros são manuais, sem movimentação de dinheiro ou integração com adquirente.
- Na comanda, a equipe responsável pode **remarcar, cancelar, registrar falta ou devolver uma utilização cancelada**. Mudança para outra profissional exige ADMIN/MASTER. A devolução é explícita, não gera estorno e permite remarcar a mesma utilização dentro da validade.
- O histórico conserva pacotes, valores e procedimentos originais. Conclusão consome a utilização; cancelamento e falta retêm-na até devolução. Utilizações vencidas e não concluídas continuam identificadas, sem conclusão ou estorno automático.

## Persistência e integridade

Migração `005_social_packages.sql`, aplicada pelo executor existente (`npm run db:migrate` no servidor). Não preenche nascimentos antigos nem cria campanhas ou usuários reais.

`persons.born_at` é reaproveitado. As tabelas `promotions`, `promotion_items` e `promotion_art` guardam campanhas e imagens. `package_purchases` e `package_uses` congelam condições, validade, preço distribuído, nome e duração dos procedimentos na aquisição. Cada utilização mantém uma única comanda, inclusive após devolução/remarcação; alterações anteriores ficam em `schedule_changes` com usuário, data, motivo, antes e depois.

Aquisição usa transação única, chave de reenvio por conta e bloqueios de profissionais em ordem crescente. A disponibilidade é revalidada dentro da transação. Remarcar preserva o agendamento original se qualquer validação falhar, e reaproveita a duração histórica. A restrição de conflito no banco continua protegendo os demais escritores.

`package_receipts` agrupa recebimentos e estornos. **Somente as parcelas em `salon_transactions` são lançamentos contábeis**; o agrupador não é uma segunda cobrança. A distribuição usa centavos inteiros e maiores restos, mantendo a soma exata e limitando estornos ao pagamento original. Os históricos e totais existentes somam essas parcelas, respeitando o escopo de cada profissional. Consumos extras são independentes.

Imagens ficam no banco, sem caminhos fornecidos pelo usuário. A API verifica tipo, assinatura e tamanho, aceita somente PNG/JPEG/WebP e serve com `nosniff`. Não aceita SVG. Upload e edição exigem ADMIN/MASTER; consultas administrativas exigem autenticação e escopo no backend. O fluxo público usa a sessão independente da cliente. Não há envio de e-mails nesta versão.

## Validação

Com PostgreSQL disponível e `TEST_DATABASE_CONNECTION_STRING` apontando para a instância de testes:

```powershell
cd server
npm run build
node --test tests/booking-origin.test.cjs tests/booking-deadline.test.cjs tests/package-allocation.test.cjs tests/customer-migration.test.cjs tests/booking.integration.cjs tests/password-reset.integration.cjs
```

Os testes criam bancos temporários próprios. Cobrem cadastros e aniversários, permissões, formato e limite de arte, campanhas vigentes, aquisição integral/concorrente, reenvios, centavos, recebimentos, estornos concorrentes, ausência de sinal, remarcação com preservação da reserva, devolução explícita, conclusão, vencimento e isolamento entre clientes. O teste de migração também verifica o histórico financeiro anterior.

No cliente: `npm run build` e `npm run lint`. Fluxos verificados no navegador com banco descartável: Social e aniversários, edição de campanha, anúncio → login → escolha do pacote, compra com dias/profissionais diferentes, histórico, recebimento único e remarcação auditada; conferência em desktop e celular.
