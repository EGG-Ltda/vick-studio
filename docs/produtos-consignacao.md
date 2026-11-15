# Produtos, estoque e fornecedores

Acesse **Área do salão → Produtos**. O módulo usa o banco e as comandas reais; nenhum produto ou fornecedor demonstrativo é criado pela migração.

## Preparação

Execute `npm run db:migrate --prefix server` com `DATABASE_CONNECTION_STRING` e `MASTER_USER_ID` configurados. A migração `009_consigned_inventory.sql` cria as tabelas, adiciona os vínculos de estoque às comandas e registra as permissões. Depois, compile frontend e backend normalmente.

1. Cadastre um fornecedor na aba **Fornecedores**.
2. Cadastre um produto do tipo **Consignado para venda** ou **Cortesia comprada pelo salão**.
3. Em **Movimentar estoque**, registre uma entrada com quantidade e motivo. O saldo inicial é zero.
4. Abra a comanda na Agenda e use **Produtos e cortesias do estoque**. O servidor usa o preço cadastrado, valida o saldo e registra a saída junto com o item, em uma transação.
5. Registre o pagamento dos produtos e serviços na mesma comanda.
6. Consulte **Fechamento mensal**, confira o extrato do fornecedor e registre o pagamento efetivamente realizado.

## Regras comerciais e financeiras

- Consignado: preço de venda e percentual do fornecedor definidos por produto. Não há comissão por vendedor.
- O item da comanda preserva nome, preço, fornecedor e percentual daquela venda. A parcela do fornecedor é arredondada uma vez por linha para centavos; a parcela do salão é a diferença, preservando o total.
- A obrigação da venda é reconhecida uma única vez quando o saldo da comanda fica quitado. Uma comanda parcialmente paga aparece como pendência e não entra no repasse. Em pacotes, os recebimentos individuais quitam os produtos extras; o recebimento do pacote não é reutilizado para pagar produtos.
- O mês é o do reconhecimento do pagamento, no fuso de Brasília. Os fechamentos não fazem transferência bancária: registram o dinheiro que a equipe informa já ter pago ao fornecedor.
- Cortesias: preço à cliente sempre zero. Cada entrada registra o custo real da compra e uma obrigação com o fornecedor; a saída gratuita reduz estoque, sem receita nem repasse por venda. Compras pagas na entrega também devem ter o pagamento registrado no módulo.
- Repasses aceitam pagamentos parciais, bloqueiam pagamento acima do saldo acumulado e geram uma saída no Financeiro do salão. O saldo acumulado considera lançamentos até o mês selecionado, descontando todos os pagamentos já registrados. Pode existir crédito do salão após uma devolução posterior ao repasse.
- Devolver um consignado não vendido ao fornecedor reduz estoque sem gerar compra ou venda. Devolver uma cortesia comprada permite informar o crédito por unidade aceito pelo fornecedor; esse crédito reduz a dívida e não registra devolução de dinheiro automaticamente.
- Perdas e ajustes são movimentos de inventário, sem cobrança automática ao fornecedor ou criação de receita. Eventuais obrigações por danos em produtos consignados dependem do acordo comercial e não são inferidas pelo sistema.
- Cancelar um item exige motivo e, para itens de estoque, informar se ele voltou fisicamente em condições de reutilização. Sem retorno, o saldo não aumenta. Vendas já reconhecidas recebem um lançamento financeiro inverso no mês do cancelamento, preservando os pagamentos anteriores. O estorno à cliente deve ser registrado separadamente na comanda.
- Cancelar o agendamento ou registrar um estorno de dinheiro não apaga os produtos nem repõe estoque. A equipe deve cancelar/devolver os itens explicitamente. Estornos exclusivamente de serviços não alteram os repasses dos produtos.
- Os consumos avulsos anteriores continuam funcionando, mas não movimentam estoque. Use o seletor de produtos cadastrados para os itens controlados.
- Não há exclusão de produtos ou movimentos: desative o cadastro e preserve o histórico. Após uma movimentação, o modelo e o fornecedor do produto ficam preservados; use um novo cadastro para mudar o vínculo comercial.

## Permissões

As ações aparecem em **Funcionalidades por perfil**, grupo **Produtos**:

- `products.view`: consulta de produtos e histórico de estoque; não libera custos nem percentuais.
- `products.manage`: cadastro e edição de produtos; depende da consulta de fornecedores.
- `products.stock`: entradas, devoluções, perdas e ajustes.
- `products.suppliers`: fornecedores e condições comerciais.
- `products.settlements`: extrato e pagamentos a fornecedores; exige financeiro e perfil ADMIN/MASTER.
- `orders.products`: venda e cortesia nas comandas acessíveis ao usuário; exige consulta da comanda e lançamento de consumos.

ADMIN recebe as novas ações por padrão. Operacional mantém lançamento nas próprias comandas e pode ter consulta do estoque habilitada pela administração. Custos, percentuais e repasses permanecem restritos. MASTER mantém acesso completo.

## Validação

Os testes em `server/tests/inventory.cases.cjs`, executados junto à integração de agendamento, usam bancos descartáveis. Cobrem permissões, preço histórico, falta de estoque, concorrência, repetição de solicitações, custos de cortesia, recebimento conjunto e repasses/devoluções sem duplicação.
