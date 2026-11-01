CREATE TABLE `autores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`pais` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `autores_nome_unique` ON `autores` (`nome`);--> statement-breakpoint
CREATE TABLE `citacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`livro_id` integer NOT NULL,
	`texto` text NOT NULL,
	`pagina` integer,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`livro_id`) REFERENCES `livros`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_citacoes_livro` ON `citacoes` (`livro_id`);--> statement-breakpoint
CREATE TABLE `classificacoes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo` text NOT NULL,
	`nome` text NOT NULL,
	`ordem` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_classificacao_unica` ON `classificacoes` (`tipo`,`nome`);--> statement-breakpoint
CREATE TABLE `configuracoes` (
	`chave` text PRIMARY KEY NOT NULL,
	`valor` text
);
--> statement-breakpoint
CREATE TABLE `editoras` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`pais` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editoras_nome_unique` ON `editoras` (`nome`);--> statement-breakpoint
CREATE TABLE `fila_meta` (
	`livro_id` integer PRIMARY KEY NOT NULL,
	`posicao` integer NOT NULL,
	FOREIGN KEY (`livro_id`) REFERENCES `livros`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `leituras` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`livro_id` integer NOT NULL,
	`status` text NOT NULL,
	`formato` text,
	`data_inicio` text,
	`data_fim` text,
	`ano_fim` integer,
	`precisao_fim` text,
	`nota` real,
	`resenha` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`livro_id`) REFERENCES `livros`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "nota_meia_estrela" CHECK("leituras"."nota" IS NULL OR ("leituras"."nota" BETWEEN 0.5 AND 5 AND "leituras"."nota" * 2 = CAST("leituras"."nota" * 2 AS INTEGER))),
	CONSTRAINT "data_coerente" CHECK(("leituras"."precisao_fim" IS NULL AND "leituras"."data_fim" IS NULL AND "leituras"."ano_fim" IS NULL) OR ("leituras"."precisao_fim" = 'dia' AND "leituras"."data_fim" IS NOT NULL) OR ("leituras"."precisao_fim" = 'ano' AND "leituras"."data_fim" IS NULL AND "leituras"."ano_fim" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_leituras_livro` ON `leituras` (`livro_id`);--> statement-breakpoint
CREATE INDEX `idx_leituras_fim` ON `leituras` (`data_fim`);--> statement-breakpoint
CREATE INDEX `idx_leituras_ano` ON `leituras` (`ano_fim`);--> statement-breakpoint
CREATE TABLE `lista_livros` (
	`lista_id` integer NOT NULL,
	`livro_id` integer NOT NULL,
	`posicao` integer NOT NULL,
	PRIMARY KEY(`lista_id`, `livro_id`),
	FOREIGN KEY (`lista_id`) REFERENCES `listas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`livro_id`) REFERENCES `livros`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_lista_livros_livro` ON `lista_livros` (`livro_id`);--> statement-breakpoint
CREATE TABLE `listas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`descricao` text,
	`ordenada` integer DEFAULT false NOT NULL,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listas_nome_unique` ON `listas` (`nome`);--> statement-breakpoint
CREATE TABLE `livro_autores` (
	`livro_id` integer NOT NULL,
	`autor_id` integer NOT NULL,
	`papel` text DEFAULT 'autor' NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`livro_id`, `autor_id`, `papel`),
	FOREIGN KEY (`livro_id`) REFERENCES `livros`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`autor_id`) REFERENCES `autores`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_livro_autores_autor` ON `livro_autores` (`autor_id`);--> statement-breakpoint
CREATE TABLE `livro_classificacoes` (
	`livro_id` integer NOT NULL,
	`classificacao_id` integer NOT NULL,
	`ordem` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`livro_id`, `classificacao_id`),
	FOREIGN KEY (`livro_id`) REFERENCES `livros`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`classificacao_id`) REFERENCES `classificacoes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_livro_classificacoes_classificacao` ON `livro_classificacoes` (`classificacao_id`);--> statement-breakpoint
CREATE TABLE `livros` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`goodreads_id` text,
	`titulo` text NOT NULL,
	`titulo_original` text,
	`isbn10` text,
	`isbn13` text,
	`editora_id` integer,
	`serie_id` integer,
	`volume` real,
	`tipo` text DEFAULT 'livro' NOT NULL,
	`formato` text,
	`paginas` integer,
	`paginas_estimadas` integer DEFAULT false NOT NULL,
	`ano_edicao` integer,
	`ano_publicacao` integer,
	`idioma` text,
	`sinopse` text,
	`capa_arquivo` text,
	`miniatura_arquivo` text,
	`cor_principal` text,
	`cor_destaque_1` text,
	`cor_destaque_2` text,
	`cor_texto` text,
	`status` text DEFAULT 'quero_ler' NOT NULL,
	`posse` text,
	`favorito_posicao` integer,
	`notas_privadas` text,
	`criado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`atualizado_em` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`editora_id`) REFERENCES `editoras`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`serie_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "favorito_valido" CHECK("livros"."favorito_posicao" IS NULL OR "livros"."favorito_posicao" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `livros_goodreads_id_unique` ON `livros` (`goodreads_id`);--> statement-breakpoint
CREATE INDEX `idx_livros_status` ON `livros` (`status`);--> statement-breakpoint
CREATE INDEX `idx_livros_isbn13` ON `livros` (`isbn13`);--> statement-breakpoint
CREATE INDEX `idx_livros_serie` ON `livros` (`serie_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_livros_favorito` ON `livros` (`favorito_posicao`);--> statement-breakpoint
CREATE TABLE `metas` (
	`ano` integer PRIMARY KEY NOT NULL,
	`livros` integer NOT NULL,
	CONSTRAINT "meta_positiva" CHECK("metas"."livros" > 0)
);
--> statement-breakpoint
CREATE TABLE `progresso` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`leitura_id` integer NOT NULL,
	`data` text NOT NULL,
	`pagina` integer NOT NULL,
	FOREIGN KEY (`leitura_id`) REFERENCES `leituras`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "pagina_valida" CHECK("progresso"."pagina" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_progresso_leitura` ON `progresso` (`leitura_id`);--> statement-breakpoint
CREATE INDEX `idx_progresso_data` ON `progresso` (`data`);--> statement-breakpoint
CREATE TABLE `series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nome` text NOT NULL,
	`total_volumes` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `series_nome_unique` ON `series` (`nome`);