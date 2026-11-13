# Demonstração do frontend sem backend

Esta branch parte de `origin/production` e reúne o frontend de `dependencias-servicos`, sem incluir as implementações de backend dessas funcionalidades na PR. Os arquivos do servidor permanecem iguais à base de production.

## Executar

Na pasta `client`, execute `npm install` e `npm run dev`. Abra o endereço informado pelo Vite. Não é necessário iniciar API, PostgreSQL, migrações ou configurar variáveis de ambiente.

Contas de exemplo, com senha demonstrativa **demo12345**:

| Visão             | Login               |
| ----------------- | ------------------- |
| Master            | `master.demo`       |
| Admin             | `admin.demo`        |
| Operacional Carla | `carla.demo`        |
| Operacional Fabi  | `fabi.demo`         |
| Cliente público   | `cliente@demo.test` |

Use somente informações fictícias. Uma faixa permanente identifica a demonstração e permite reiniciar os exemplos.

## O que está mockado

Home, serviços, login do salão e do cliente, Agenda, funcionários, usuários, perfis/permissões, clientes e histórico, comandas e consumos, recebimentos, Social/aniversários/promoções, pacotes e escolha de serviços com dependências.

Os formulários alteram objetos somente em memória; recarregar restaura os exemplos. Apenas o identificador da sessão demonstrativa fica em `sessionStorage`, sem senha ou token real. Logout das sessões do cliente e do salão continua independente. As artes são locais ou URLs `data:` geradas pelo upload demonstrativo.

O financeiro mantém a tela atual de entradas/saídas da base de frontend, sem incorporar a reestruturação que será feita pelo outro integrante.

Os mocks servem para revisar telas e contratos. Não são autenticação, autorização ou validação de negócio reais. Não garantem segurança, disponibilidade de horários, cobrança, envio de mensagens, atomicidade, validade de sinais ou regras financeiras de produção. Não usam informações do banco local. Uma rota sem contrato de mock falha explicitamente, sem recorrer à API real.

## Integração futura

- `client/src/mocks/fixtures.ts`: exemplos fictícios e formatos dos objetos.
- `client/src/mocks/api.ts`: respostas e alterações simuladas por rota.
- `client/src/core/api/http.ts` e `client/src/pages/booking/bookingApi.ts`: chamadas reais preservadas em comentários; retorno atual vem de `mockRequest`.
- `client/src/core/auth/AuthProvider.tsx`: saída passa pelo mesmo transporte mockado.
- `client/vite.config.ts`: proxy de API comentado.
- `DemoNotice`: faixa de demonstração; as artes de promoções usam `mockPromotionArt`.

Para integrar o backend depois, substituir os retornos mockados pelo transporte real preservado, restaurar o proxy, voltar as URLs das artes e remover a faixa/contas demonstrativas. Os contratos estão organizados para o responsável pelo backend comparar as respostas esperadas por cada tela. Não publicar esta versão como um sistema autenticado real.

Verificações: `npm run test:mocks`, `npm run build` e `npm run lint` na pasta `client`.
