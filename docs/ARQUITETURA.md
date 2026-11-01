# Biblioteca Bela: arquitetura

App pessoal de catálogo de leitura para Windows. Roda só no computador da dona, sem servidor, sem contas e sem recursos sociais. O visual segue a [prancha de protótipos](https://claude.ai/artifact/XTZRx9Fgc13wd2fzcTgamU).

## Decisões

| Assunto | Decisão |
| --- | --- |
| Sistema | Só Windows |
| Tecnologia | Electron, React, TypeScript, SQLite (better-sqlite3 + Drizzle) |
| Dados | `%APPDATA%\biblioteca-bela`, com `biblioteca.db`, `capas\` e `miniaturas\` |
| Banco antigo | Lido uma única vez na importação, nunca alterado |
| Busca de livros | Google Books, chamado pelo processo principal |
| Chave do Google | Colada nas Configurações e criptografada com `safeStorage` |
| Backup | Automático ao abrir, em pasta escolhida, guardando os últimos 10. Backup completo com capas é separado |
| Tema | Só escuro na primeira versão |
| Fora da primeira versão | Celular, sincronização, tema claro, atualização automática, assinatura do instalador |

## Camadas

```text
src/main       Processo principal: banco, arquivos, rede, operações do app
src/preload    Ponte mínima e tipada entre a interface e o principal
src/renderer   Interface React, sem acesso a Node, banco ou arquivos
src/shared     Tipos e constantes usados pelos dois lados
```

Regras:

- A interface só acessa dados pela API exposta em `window.bela`.
- A janela roda com `contextIsolation`, `sandbox` e sem `nodeIntegration`.
- Toda entrada vinda da interface é validada no processo principal.
- Links externos abrem no navegador do sistema, e a janela não navega para fora do app.
- Cálculos de estatísticas ficam em funções puras e testadas, fora dos componentes.

## Modelo de dados

- **livros:** dados da obra e da edição, capa, cores, status, posse, favorito e notas privadas.
- **autores, livro_autores:** um livro pode ter vários autores, tradutores e ilustradores, em ordem.
- **editoras:** nome e país. O país alimenta o mapa de publicação.
- **series:** um livro pertence a no máximo uma série, com volume decimal, como 2,5.
- **classificacoes, livro_classificacoes:** listas fixas de 20 gêneros, 17 temas e 20 moods.
- **leituras:** cada passagem por um livro, com início, fim, precisão da data, nota, resenha e formato. Uma releitura é uma nova linha, e assim "Mudei de ideia" vem da comparação das notas.
- **progresso:** data e página de cada atualização. Alimenta o Diário e o ritmo daqui em diante.
- **citacoes:** trechos guardados de cada livro.
- **listas, lista_livros:** listas ordenadas ou não ordenadas.
- **fila_meta, metas:** próximas leituras em ordem e meta de livros por ano.
- **configuracoes:** preferências simples, em chave e valor.

Precisão da data: `dia` usa `data_fim`. `ano` guarda só `ano_fim`, para o livro nunca aparecer em um dia que não aconteceu.

## Capas

Cada livro tem a imagem original e uma miniatura em disco, servidas pelo protocolo `capa://`. O caminho é validado para só aceitar arquivos dessas pastas. As três cores usadas na lombada e nos losangos são calculadas ao salvar a capa e ficam no banco.

## Estante e imagem da retrospectiva

- Só o livro aberto recebe a estrutura 3D completa. Os outros são lombadas simples.
- A imagem da retrospectiva é gerada com a captura nativa do Electron.

## Testes

- `npm test`: Vitest para banco, importação e cálculos. Roda no Node embutido do Electron, porque o better-sqlite3 é compilado para ele.
- `npm run test:app`: Playwright abre o app real e confere as telas, usando uma pasta de dados temporária.
- `npm run typecheck` e `npm run build`: conferem os tipos e o empacotamento do código.

## Ordem de construção

1. Base: projeto, Git, janela, banco e estrutura de dados.
2. Importação: dados e capas, com relatório.
3. Consulta: Livros, Ficha, Autor e Série, Busca, Estante.
4. Registro: nota, status, leitura, progresso, Registrar com Google Books, Diário.
5. Análise: Estatísticas, Retrospectiva, imagem.
6. Organização: Perfil, Listas, Configurações.
7. Acabamento: backup, instalador, testes finais, desempenho.
