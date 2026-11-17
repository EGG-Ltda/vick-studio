# Perfis e permissões

O Master acessa **Funcionalidades por perfil** na navegação do salão. Nessa tela define os acessos padrão de Admin e Operacional e quais permissões operacionais o Admin pode ajustar. Master mantém acesso completo independentemente das permissões dos perfis e de eventuais exceções individuais. Não existe perfil Master editável nesse menu.

O Admin autorizado pela permissão `staff.permissions` também acessa esse menu, mas recebe somente o perfil Operacional. Pode ajustar o padrão dos funcionários apenas nas funcionalidades que possui e que o Master marcou como delegáveis. Não pode alterar os limites de delegação, o perfil Admin, outros administradores ou qualquer Master. Se o Master remover esse acesso do Admin, o menu e as rotas deixam de estar disponíveis para ele.

As ações dependentes acompanham a visualização necessária: bloquear Financeiro também bloqueia os recebimentos que dependem dele. Configurações do negócio — agenda, sinal, validade de pacotes, funcionários, serviços, promoções e produtos — ficam disponíveis ao Admin conforme os acessos definidos pelo Master.

Em **Usuários → Permissões**, o Master ajusta acessos individuais de Admin e Operacional. O Admin encontra apenas funcionários operacionais e pode ajustar somente permissões delegáveis que ele próprio possui. Exceções individuais continuam prevalecendo sobre o padrão do Operacional, dentro do limite autorizado pelo Master. A criação de usuários e a atribuição de perfis ficam com o Master.

## Perfis

- **Master:** acesso completo e configuração de perfis. O usuário de bootstrap indicado por `MASTER_USER_ID` continua protegido contra desativação e rebaixamento.
- **Admin:** alcance do salão nas funcionalidades autorizadas. Pode desabilitar serviços quando autorizado, mas não existe exclusão definitiva de serviços nesta implementação.
- **Operacional:** alcance limitado ao próprio trabalho, mesmo que tenha autorização para abrir determinada tela. Clientes, agenda e recebimentos são filtrados no backend pelo vínculo com o profissional.
- **Disable:** apresentado como Desabilitado. A conta não pode acessar a aplicação; o perfil atribuído é preservado para eventual reativação.

Serviços desabilitados deixam as consultas habituais e a reserva pública. Apenas Master pode consultar o catálogo inativo. Registros e preços históricos são preservados.

## Financeiro e comandas

O financeiro operacional mostra recebimentos registrados vinculados ao próprio trabalho, considerando estornos. Não calcula comissão. Lançamentos gerais do salão ficam restritos ao alcance administrativo. Comandas antigas compartilhadas entre profissionais têm valores distribuídos proporcionalmente aos preços históricos dos procedimentos; a alteração dessas comandas fica com a administração.

Sem permissão financeira, os valores efetivamente pagos e os lançamentos são omitidos também das respostas auxiliares de clientes e comandas. Permissão de tela não concede acesso a dados de outro profissional.

## Segurança e atualização

As permissões são verificadas no backend a cada requisição. Menus, rotas e ações da interface acompanham as permissões atuais, com atualização ao retornar à janela, após recusa de permissão e a cada 30 segundos. Desativação e mudança de perfil invalidam sessões anteriores. Reativar uma conta não recupera seus tokens antigos.

Alterações de perfis e acessos individuais geram auditoria completa para o Master. O Admin consulta somente alterações do perfil Operacional e suas próprias alterações individuais de funcionários. Senhas e hashes não são incluídos nessa auditoria nem nas respostas públicas de usuários. Revogar o limite de uma permissão remove as exceções individuais correspondentes, impedindo que voltem silenciosamente quando o limite for ampliado depois. A autorização e a versão do perfil são verificadas novamente dentro da transação de alteração.

## Migração e manutenção

A migração `006_access_profiles.sql` adapta usuários existentes sem modificar senhas: administradores anteriores recebem Admin e os demais recebem Operacional. Quando `MASTER_USER_ID` é informado ao executar as migrações, o bootstrap é persistido como Master. A configuração de desenvolvimento local já informa esse identificador.

Novas funcionalidades devem ser incluídas no catálogo de permissões, no mapeamento de rotas do backend e nos controles da interface. Rotas administrativas autenticadas sem mapeamento são recusadas para os demais perfis. Módulos inexistentes, como Produtos, não aparecem como permissões fictícias.
