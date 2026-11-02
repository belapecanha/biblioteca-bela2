# Handoff: Biblioteca Bela

Estado em 1º de novembro de 2026. Decisões e modelo de dados estão em [ARQUITETURA.md](ARQUITETURA.md). O visual de referência está na [prancha](https://claude.ai/artifact/XTZRx9Fgc13wd2fzcTgamU).

## Resumo

- Etapas 1 a 5 construídas: base, importação, consulta, registro de leituras e análise.
- **Estante recuperada:** banco restaurado com 218 livros; recuperadas 172 capas e miniaturas. App e importador agora impedem acesso simultâneo à biblioteca.
- Só a etapa 1 está em commit (`4990f46`). As etapas 2, 3, 4 e 5 estão sem commit na árvore de trabalho.

## 1. Correção da estante vazia em `npm run dev`

**Diagnóstico em 1º de novembro:** a janela realmente recebia 0 em `app:estado` e em `livros:listar`, usando `%APPDATA%\biblioteca-bela`. Depois de fechar normalmente e reiniciar, continuava vazia. Com o app fechado, o banco em disco também tinha 0 livros e `quick_check = ok`: não era apenas um filtro da interface.

**Recuperação dos dados:**

- Restaurada a cópia de diagnóstico `%LOCALAPPDATA%\Temp\tmpxtunvj0p\so_db.db`, validada com 218 livros e `quick_check = ok`. O banco restaurado também passou na verificação.
- O banco vazio anterior foi preservado em `%APPDATA%\biblioteca-bela\biblioteca.db.antes-reparo-20261101-163954.bak`.
- As pastas reais de capas e miniaturas estavam vazias. As 172 imagens de cada pasta foram reconstruídas em `dev-data/recuperar-capas` e copiadas para o app. Essa reconstrução usou uma biblioteca temporária, sem substituir o banco restaurado.

**Falhas corrigidas no código:**

- O importador com `--substituir` apagava o banco, WAL e SHM sem impedir que o app mantivesse uma conexão aberta. Isso permite conexões antigas e arquivos de diário inconsistentes. Agora `src/main/db/bloqueio.ts` é usado pelo app e pelo CLI; a importação é recusada antes de tocar no banco enquanto ele estiver em uso. Bloqueios de processos encerrados são recuperados.
- O backup do importador copiava somente o arquivo principal, ignorando alterações no WAL. Agora usa `sqlite.backup()`, faz checkpoint e fecha a conexão antes da substituição.
- No electron-vite instalado, a URL enviada ao Electron usa a porta configurada, mesmo se o Vite escolher outra por conflito. `strictPort: true` faz o desenvolvimento parar com aviso de porta ocupada, sem carregar outro servidor.
- Falhas ao abrir o banco agora mostram uma mensagem e encerram o app, liberando o bloqueio.

O momento original em que o banco ficou vazio e a origem do WAL inválido relatado anteriormente não foram rastreados; não tratar a hipótese de substituição simultânea como um histórico comprovado.

**Cobertura de regressão:** `testes/app/desenvolvimento.spec.ts` abre o modo dev com uma biblioteca temporária, confere os livros na estante e após recarregar, tenta `--substituir` com o app aberto e verifica que os dados continuam lá. Também testa a porta 5173 ocupada. `testes/unidade/bloqueio.test.ts` cobre exclusão mútua e recuperação de bloqueio abandonado.

**Validação:** `npm test` (25 testes), `npm run test:app` (6 testes, incluindo desenvolvimento e build) e `npm run typecheck` passaram. Confirmada também a abertura normal da biblioteca real com `npm run dev`, mostrando "Sua estante, 218 livros"; o app ficou aberto nessa tela.

**Atenção:**

- Não ler o banco por fora enquanto o app estiver aberto.
- Não usar `npm run importar -- --substituir` como tentativa de conserto: essa opção recria o banco e apaga o que foi editado no app. Ela faz cópia de segurança antes.
- Fechar o app antes de `npm run test:app`, pois os testes existentes fazem uma cópia dos arquivos da biblioteca real. Se a porta 5173 estiver ocupada, encerrar o servidor antigo antes de abrir outro `npm run dev`.

## 2. Proteções a antecipar

- Verificar o banco ao abrir e avisar em caso de problema, em vez de mostrar uma estante vazia.
- Fazer backup automático ao abrir, sem esperar a etapa 7.

## 3. Pendências de dados

- **Commit:** registrar as etapas 2, 3, 4 e 5 e a correção da estante; continuam sem commit.
- **Capas:** faltam 46. A lista está em `dados/relatorio_importacao.md`. A dona vai fornecer as imagens.
- **Sinopses:** 111 livros estão sem sinopse, e parte das existentes está em inglês.
- **Status a confirmar:** *A Court of Silver Flames* está em Quero ler no Goodreads e como lendo no app antigo. Foi mantido Quero ler.
- **Páginas de *Parceira*:** Goodreads tem 518 e o app antigo tem 465. Foi mantido 518.
- **Páginas estimadas:** volumes de *My Gently Raised Beast* (240) e *I Was Tricked into This Fake Marriage!* (361).
- **Sem páginas:** 15 livros lidos, incluindo os 6 de *The Land of Stories*.
- **Classificação:** gênero, tema e mood foram inferidos e precisam de revisão. Poesia foi marcada como Drama, porque a lista não tem esse gênero. Menos confiáveis: *Daytime Star*, *Elixir of the Sun*, *Villainess in Love*, *Os Jogos da Coroa* e *Taxi a Coyoacán*.
- **Numeração de *Diário de Pilar*:** veio da memória e precisa ser conferida.
- **Limpeza:** a pasta `%APPDATA%\Biblioteca Bela` (vazia de livros, criada por engano) e `%APPDATA%\biblioteca-bela\diagnostico-*` podem ser apagadas depois de resolver o bug. Confirmar antes.

## 4. Etapa 4 concluída e próximas etapas

### Etapa 4: Registro — implementada

- **Registrar:** cadastro manual ou busca no Google Books por título, autor ou ISBN. Selecionar uma edição apenas preenche o formulário: é preciso revisar e salvar. Obra, edição, autores/tradutores/ilustradores, países, série, volume, formato, posse, classificação, capa, notas e primeira leitura são editáveis. A primeira leitura pode incluir início, conclusão exata ou somente ano, nota e resenha.
- **Duplicados:** compara ISBN ou título e autor normalizados; não grava até a pessoa conferir os registros e marcar que deseja outra edição. Cadastro, primeira leitura e aplicação da capa usam transação; uma imagem ou data inválida não deixa um livro parcialmente cadastrado.
- **Chave do Google:** `GOOGLE_BOOKS_API_KEY` no `.env` da raiz do projeto, fora do git (modelo em `.env.example`). É lida pelo processo principal a cada busca e não volta ao renderer. Configurações só mostra se foi encontrada. No app instalado, o arquivo fica na pasta de dados. A cópia criptografada antiga em `configuracoes` não é mais usada. Os testes de integração substituem o provedor externo por uma resposta controlada.
- **Diário:** calendário mensal com capas de início, progresso e conclusão; números de leituras concluídas, páginas e média diária; filtros por ano, mês, nota mínima, formato e tipo; leituras do mês, grupo anual sem dia exato e grupo sem data. Só oferece os anos presentes nos dados. Datas aproximadas não entram nos totais mensais nem ganham um dia fictício.
- **Ficha:** cada leitura tem nota, resenha, formato e datas próprios. Permite registrar releituras, corrigir o histórico, salvar/corrigir/remover progresso por dia, guardar/editar/remover citações e salvar notas privadas. O link "Editar dados e capa" abre o cadastro preenchido e permite trocar a imagem.
- **Capas:** imagens locais JPG/PNG/WebP de até 15 MB ou capas do Google Books são processadas antes de gravar. Gera original WebP, miniatura e cores novas, preservando os arquivos antigos. Falhas não substituem a capa existente.
- **Datas:** valida datas reais e ordem de início/fim; permite somente o ano ou ausência de data. Progresso respeita o período e o total de páginas. Não abre uma nova leitura enquanto houver outra em andamento; corrigir a nota de uma releitura não altera a nota da anterior.
- **Banco:** não foi necessária uma nova migração. Usa as tabelas já existentes; os 218 livros reais foram preservados.
- **Referências visuais:** `docs/imagens/prototipo/registrar.png`, `diario.png` e `ficha-do-livro.png`.
- **Validação da etapa 4:** 39 testes unitários e 8 testes do app passaram, assim como o build e a checagem de tipos. Os testes do app verificam persistência após recarregar, troca de capa, progresso da nova releitura, correção de data para somente ano, citações, notas e confirmação de duplicados. As capturas ficam em `test-results/etapa4-*.png`.

### Etapa 5: Análise — implementada

- **Estatísticas:** todos os itens da prancha (`paginas/Estatisticas.tsx`), com filtros por período, gênero, tema, mood, tipo, formato e país, e clique nos gráficos. Cores: roxo `#A958D8`, azul `#2E9AC4` e dourado `#B28A1E`.
- **Regra de contagem:** cada leitura concluída soma páginas e nota no ano dela; o livro conta uma vez nos rankings. Um livro lido que está sendo relido continua entre os lidos (*The Lightning Thief*). Ritmo só usa leituras com ano; meses só usam data exata.
- **O que a prancha só simulava e agora é real:** meta do ano gravada na tabela `metas` (sem o valor fixo de 20), previsão, "Mudei de ideia" pelas notas das releituras, tempo na fila dos livros cadastrados à mão, e ano atual calculado em vez de 2026 fixo.
- **Retrospectiva:** 10 cartões por ano e parede de capas com losangos nas cores de cada capa, em `/retrospectiva`. Anos sem nota, data ou páginas mostram isso em vez de um valor inventado.
- **Imagem:** modelo de 1080 × 1350 em `/retrospectiva/imagem/:ano`, salvo por `src/main/imagem-retrospectiva.ts`. Usa uma janela oculta e fotografa em faixas, juntadas com `sharp`: o Windows limita a janela à altura da tela, e tanto a emulação de tela quanto o `Page.captureScreenshot` falharam nos testes (este último derruba o app com a janela oculta).
- **Cálculos:** funções puras em `src/shared/estatisticas.ts`. `testes/unidade/estatisticas.test.ts` confere os totais contra consultas diretas em uma cópia do banco real; `testes/app/analise.spec.ts` cobre filtros, meta, cartões, parede e imagem.
- **Limites conhecidos:** o mapa (`mapa-mundi.json`) só tem nome nos 8 países atuais; um país novo aparece na lista, mas não pinta o mapa. O nome na imagem é fixo até o perfil da etapa 6. Mudanças em `src/main` e `src/preload` exigem reiniciar o `npm run dev`.

### Etapa 6: Organização

- **Perfil:** topo, números, 4 favoritos escolhidos, lendo agora, próximas leituras da meta, atividade recente e séries.
- **Listas:** criar, abrir e adicionar, com escolha entre ordenada e não ordenada.
- **Configurações:** perfil, foto, imagem do topo, importação, exportação, backup e pendências dos dados.

### Etapa 7: Acabamento

- Backup em pasta escolhida, guardando os últimos 10, e backup completo com capas separado.
- Instalador do Windows, ainda nunca testado, conferindo `better-sqlite3`, `sharp` e as migrações empacotadas.
- Testes finais e desempenho da Estante com todos os livros.

## 5. Como rodar

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run test:app
```

```bash
npm run typecheck
```

- O app só muda a parte do banco ao reiniciar. Depois de alterar `src/main` ou `src/preload`, feche a janela e rode de novo.
- `npm run test:app` usa uma cópia temporária da biblioteca real, em `%APPDATA%\biblioteca-bela`.
- `npm install` depende de `legacy-peer-deps`, já salvo no `.npmrc`.

## 6. Dados e arquivos

| Item | Local |
| --- | --- |
| Banco do app | `%APPDATA%\biblioteca-bela\biblioteca.db` |
| Capas e miniaturas | `%APPDATA%\biblioteca-bela\capas` e `miniaturas` |
| Banco antigo, nunca alterar | `%APPDATA%\minha-estante\biblioteca.db` |
| Export original do Goodreads | `Biblioteca-bela/src/data/goodreads_library_export.csv` |
| CSV corrigido | `dados/goodreads_corrigido.csv` |
| Ajustes de séries e classificação | `scripts/ajustes_manuais.json` |
| Tratamento dos dados | `scripts/tratar_goodreads.py` |
| Importador | `src/main/importacao/` (`npm run importar`) |
| Relatório da importação | `dados/relatorio_importacao.md` |

A prancha original está no Claude; as capturas locais de referência estão em `docs/imagens/prototipo/`.

## 7. Preferências da dona

- Visual sério e elegante, no estilo Letterboxd, com tema escuro em azul-ardósia e terracota. Não quer nada fofo demais.
- Notas por estrelas clicáveis, com meia estrela.
- Estante única com todos os livros juntos, sem divisão por gênero.
- Nos protótipos e no app, não remover telas planejadas.
- Comunicação em português.
