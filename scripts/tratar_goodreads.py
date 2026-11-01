"""Trata o export do Goodreads sem alterar o original.

Uso: python scripts/tratar_goodreads.py <caminho do csv>
Gera em dados/: livros.json, livros_tratados.csv e pendencias.csv
"""
import csv
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

SAIDA = Path(__file__).resolve().parent.parent / "dados"

STATUS = {"read": "lido", "to-read": "quero_ler", "currently-reading": "lendo"}
FORMATOS = {
    "Paperback": "fisico", "Hardcover": "fisico", "Mass Market Paperback": "fisico",
    "Board book": "fisico", "Graphic Novel": "fisico",
    "Kindle Edition": "ebook", "ebook": "ebook",
}
EDITORAS = {
    "Bloo msbury Publishing": "Bloomsbury Publishing",
    "Editora Arqueiro": "Arqueiro",
    "CreateSpace Independent Publishing Platform": "CreateSpace",
}
ESTANTES_TIPO = {"manhwa": "manhwa", "manga": "manga", "grafic-novel": "graphic_novel", "poema": "poesia"}
ESTANTES_IGNORADAS = {"to-read", "currently-reading", "read", "a-favoritos"}
GENEROS = {"grafic-novel": "graphic-novel"}
ANO_MAXIMO = 2026
# Coleções cadastradas como um item só. "paginas" None significa desconhecido.
COLECOES = {
    "205018916": {
        "paginas": "240",  # 960 divididas igualmente entre os 4 volumes (estimativa)
        "titulos": [f"My Gently Raised Beast, Vol. {n}" for n in range(1, 5)],
    },
    "60237610": {
        "paginas": "361",  # 1445 divididas igualmente entre os 4 volumes (estimativa)
        "titulos": [f"이건 명백한 사기결혼이다 {n} (I Was Tricked into This Fake Marriage!, Vol. {n})" for n in range(1, 5)],
    },
    "59416388": {
        "autor": "Chris Colfer",
        "paginas": "",
        "titulos": [
            "The Wishing Spell (The Land of Stories, #1)",
            "The Enchantress Returns (The Land of Stories, #2)",
            "A Grimm Warning (The Land of Stories, #3)",
            "Beyond the Kingdoms (The Land of Stories, #4)",
            "An Author's Odyssey (The Land of Stories, #5)",
            "Worlds Collide (The Land of Stories, #6)",
        ],
    },
}


def separar_colecoes(linhas):
    saida = []
    for linha in linhas:
        colecao = COLECOES.get(linha["Book Id"])
        if not colecao:
            saida.append(linha)
            continue
        for n, titulo in enumerate(colecao["titulos"], 1):
            volume = dict(linha)
            volume.update({"Book Id": f'{linha["Book Id"]}-{n}', "Title": titulo, "ISBN": '=""', "ISBN13": '=""', "Number of Pages": colecao["paginas"]})
            if "autor" in colecao:
                autor = colecao["autor"]
                nome, sobrenome = autor.rsplit(" ", 1)
                volume.update({"Author": autor, "Author l-f": f"{sobrenome}, {nome}"})
            saida.append(volume)
    return saida
# Mesma série escrita de formas diferentes (chave em minúsculas)
SERIES = {
    "spyxfamily": "Spy × Family",
    "villains are destined to die": "Villains Are Destined to Die",
    "estilhaça-me": "Estilhaça-me",
    "shatter me": "Estilhaça-me",
    "bridgertons": "Os Bridgertons",
    "os bridgertons": "Os Bridgertons",
    "bride": "Noiva",
    "the villainess lives again": "The Villainess Lives Again",
}


def nome_serie(serie):
    if not serie:
        return None
    return SERIES.get(serie.lower(), serie)


def com_volume(titulo, serie, volume):
    """Títulos que são só o nome da série ganham o volume, para não ficarem iguais."""
    return f"{titulo}, vol. {volume}" if volume and titulo == serie else titulo


def nota_meia_estrela(resenha):
    """O Goodreads não aceita meia estrela, então ela foi escrita na resenha ("4,5")."""
    m = re.fullmatch(r"([0-5])[,.]5", resenha)
    return float(f"{m[1]}.5") if m else None


def texto(valor):
    valor = unicodedata.normalize("NFC", valor or "")
    valor = re.sub(r"[​-‍﻿]", "", valor)
    return re.sub(r"\s+", " ", valor).strip()


def isbn(valor):
    return re.sub(r'^="(.*)"$', r"\1", valor or "").strip() or None


def inteiro(valor):
    valor = (valor or "").strip()
    return int(valor) if valor.isdigit() and int(valor) > 0 else None


def tem_coreano(valor):
    return bool(re.search(r"[가-힣]", valor))


def separar_titulo(bruto):
    """Devolve (titulo, titulo_original, serie, volume)."""
    t = texto(bruto)
    original = None

    # "악마와 계약연애 (Devil Number 4) #5"
    m = re.fullmatch(r"(.+?) \((.+?)\) #(\d+)", t)
    if m:
        original = m[1] if tem_coreano(m[1]) else None
        return m[2], original, m[2], int(m[3])

    # "화이트 블러드 1 [White Blood 1]"
    m = re.fullmatch(r"(.*[가-힣].*?) \[([^\]]+)\](?: \((.+)\))?", t)
    if m:
        original = m[1]
        t = m[3] or m[2]
        if not m[3]:
            n = re.fullmatch(r"(.+?) (\d+)", m[2])
            if n and not re.search(r"eu|-|'", n[1]):
                return n[1], original, n[1], int(n[2])
    else:
        # "아기가 생겼어요 7 (Positively Yours, Vol. 7)"
        m = re.fullmatch(r"(.*[가-힣].*?) \((.+)\)", t)
        if m:
            original, t = m[1], m[2]

    # "The Villainess Lives Again [Novel], #3" (já sem o título coreano)
    m = re.fullmatch(r"(.+?) \[Novel\], #(\d+)", t)
    if m:
        return m[1], original, m[1], int(m[2])
    t = re.sub(r"\s*\[Novel\]", "", t)

    # "Titulo (Serie, #1)"
    m = re.fullmatch(r"(.+) \(([^()]+?),? #([\d.]+)\)", t)
    if m:
        volume = float(m[3]) if "." in m[3] else int(m[3])
        return m[1], original, m[2], volume

    # "Serie, Vol. 1"
    m = re.fullmatch(r"(.+?),? (?:Vol\.?|Volume|volumen) (\d+)(?:,? .*)?", t)
    if m:
        return t, original, m[1], int(m[2])

    m = re.fullmatch(r"(.+?), Season (\d+)", t)
    if m:
        return t, original, m[1], int(m[2])

    return t, original, None, None


def data_e_precisao(valor):
    """Goodreads só guarda data completa; 01/01 quase sempre significa "só sei o ano"."""
    valor = (valor or "").strip()
    if not valor:
        return None, None
    iso = valor.replace("/", "-")
    return iso, "ano_provavel" if iso.endswith("-01-01") else "dia"


def tratar(linha):
    titulo, original, serie, volume = separar_titulo(linha["Title"])
    estantes = [e.strip() for e in linha["Bookshelves"].split(",") if e.strip()]
    anos = sorted(e for e in estantes if re.fullmatch(r"\d{4}", e))
    tipos = [ESTANTES_TIPO[e] for e in estantes if e in ESTANTES_TIPO]
    generos = [
        GENEROS.get(e, e) for e in estantes
        if e not in ESTANTES_IGNORADAS and e not in anos and e not in ("manhwa", "manga", "grafic-novel")
    ]
    serie = nome_serie(serie)
    titulo = com_volume(titulo, serie, volume)
    resenha = texto(linha["My Review"])
    nota = float(linha["My Rating"] or 0)
    meia = nota_meia_estrela(resenha)
    ano_edicao = inteiro(linha["Year Published"])
    ano_original = inteiro(linha["Original Publication Year"])
    editora = texto(linha["Publisher"])
    data_leitura, precisao = data_e_precisao(linha["Date Read"])
    status = STATUS[linha["Exclusive Shelf"]]
    bruto = texto(linha["Title"]).lower()

    livro = {
        "goodreads_id": linha["Book Id"],
        "titulo": titulo,
        "titulo_original": original,
        "serie": serie,
        "volume": volume,
        "autor": texto(linha["Author"]),
        "coautores": [a for a in map(texto, linha["Additional Authors"].split(",")) if a],
        "isbn": isbn(linha["ISBN"]),
        "isbn13": isbn(linha["ISBN13"]),
        "editora": EDITORAS.get(editora, editora) or None,
        "formato": FORMATOS.get(linha["Binding"]),
        "encadernacao_original": linha["Binding"],
        "paginas": inteiro(linha["Number of Pages"]),
        "ano_edicao": ano_edicao if ano_edicao and ano_edicao <= ANO_MAXIMO else None,
        "ano_publicacao": ano_original,
        "status": status,
        "nota": meia if meia is not None else (nota if nota > 0 else None),
        "nota_goodreads": nota if nota > 0 else None,
        "data_leitura": data_leitura,
        "ano_leitura": int(data_leitura[:4]) if data_leitura else (int(anos[0]) if len(anos) == 1 else None),
        "precisao_data": precisao or ("ano_da_estante" if len(anos) == 1 else None),
        "data_adicionado": linha["Date Added"].replace("/", "-"),
        "tipo": tipos[0] if tipos else "livro",
        "generos": generos,
        "favorito": "a-favoritos" in estantes,
        "estantes_ano": anos,
        "resenha": None if meia is not None or not resenha else resenha,
        "colecao": bool(re.search(r"\bset\b|collection|vol\. \d+-\d+", bruto)),
    }

    pendencias = []
    if status == "lido" and not livro["ano_leitura"]:
        pendencias.append("lido sem data")
    if meia is not None and abs(meia - nota) > 0.5:
        pendencias.append(f"nota da resenha ({meia}) longe da nota do Goodreads ({nota})")
    if status == "lido" and not livro["nota"]:
        pendencias.append("lido sem nota")
    if status != "lido" and data_leitura:
        pendencias.append(f"status '{status}' mas tem data de leitura")
    if not livro["paginas"]:
        pendencias.append("sem páginas")
    if ano_edicao and ano_edicao > ANO_MAXIMO:
        pendencias.append(f"ano de edição impossível ({ano_edicao})")
    if data_leitura:
        ano = int(data_leitura[:4])
        if ano_original and ano_original > ano:
            pendencias.append(f"lido em {ano}, antes de publicado ({ano_original})")
        if anos and str(ano) not in anos:
            pendencias.append(f"data ({ano}) diverge da estante de ano ({', '.join(anos)})")
    if livro["formato"] is None:
        pendencias.append("formato desconhecido")
    if livro["colecao"]:
        pendencias.append("coleção: vale separar em volumes?")
    if not generos and livro["tipo"] == "livro":
        pendencias.append("sem gênero")
    return livro, pendencias


def aplicar_ajustes(tratados):
    """Aplica séries conectadas à mão e a classificação de gênero, tema e mood."""
    aj = json.loads((Path(__file__).resolve().parent / "ajustes_manuais.json").read_text(encoding="utf-8"))
    cod = aj["codigos"]
    nomes = lambda texto, tabela: [tabela[c] for c in texto.split(",") if c]
    faltando = []
    for livro, pendencias in tratados:
        gid = livro["goodreads_id"]
        if gid in aj["serie_por_id"]:
            livro["serie"], livro["volume"] = aj["serie_por_id"][gid]
        livro["autor"] = aj["autor_por_id"].get(gid, livro["autor"])
        livro["tipo"] = aj["tipo_por_id"].get(gid, livro["tipo"])
        if livro["serie"] == "Estilhaça-me, #1.5":
            livro["serie"] = "Estilhaça-me"
        c = aj["por_id"].get(gid) or aj["por_serie"].get(livro["serie"])
        if not c:
            faltando.append(livro["titulo"])
            livro.update(generos=[], temas=[], moods=[])
            continue
        livro.update(generos=nomes(c[0], cod["generos"]), temas=nomes(c[1], cod["temas"]), moods=nomes(c[2], cod["moods"]))
        pendencias[:] = [p for p in pendencias if p != "sem gênero"]
    print("sem classificacao:", faltando)


def main():
    with open(sys.argv[1], encoding="utf-8-sig", newline="") as f:
        leitor = csv.DictReader(f)
        linhas = separar_colecoes(list(leitor))
        campos = leitor.fieldnames
    tratados = [tratar(l) for l in linhas]
    livros = [t[0] for t in tratados]
    aplicar_ajustes(tratados)
    SAIDA.mkdir(exist_ok=True)

    with open(SAIDA / "goodreads_corrigido.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=campos)
        w.writeheader()
        w.writerows(linhas)

    (SAIDA / "livros.json").write_text(json.dumps(livros, ensure_ascii=False, indent=2), encoding="utf-8")

    # utf-8-sig para o Excel mostrar acentos e coreano corretamente
    with open(SAIDA / "livros_tratados.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=livros[0].keys(), delimiter=";")
        w.writeheader()
        for l in livros:
            w.writerow({k: ", ".join(v) if isinstance(v, list) else v for k, v in l.items()})

    with open(SAIDA / "pendencias.csv", "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["titulo", "autor", "pendencia"])
        for l, ps in tratados:
            for p in ps:
                w.writerow([l["titulo"], l["autor"], p])

    sys.stdout.reconfigure(encoding="utf-8")
    print("livros", len(livros))
    print("status", Counter(l["status"] for l in livros))
    print("tipo", Counter(l["tipo"] for l in livros))
    print("formato", Counter(l["formato"] for l in livros))
    print("precisao", Counter(l["precisao_data"] for l in livros))
    print("com serie", sum(1 for l in livros if l["serie"]), "| series", len({l["serie"] for l in livros if l["serie"]}))
    print("resenhas reais", sum(1 for l in livros if l["resenha"]))
    print("paginas lidas", sum(l["paginas"] or 0 for l in livros if l["status"] == "lido"))
    notas = [l["nota"] for l in livros if l["nota"]]
    print("nota media", round(sum(notas) / len(notas), 2), "de", len(notas))
    print("pendencias", Counter(re.sub(r"\(.*?\)|\d{4}|'.*?'", "", p).strip() for _, ps in tratados for p in ps).most_common())
    print("notas", sorted(Counter(l["nota"] for l in livros if l["nota"]).items()))
    print("lidos por ano", sorted(Counter(l["ano_leitura"] for l in livros if l["status"] == "lido" and l["ano_leitura"]).items()))
    print("favoritos", [l["titulo"] for l in livros if l["favorito"]])
    print("autores", Counter(l["autor"] for l in livros).most_common(5))
    print("generos", Counter(g for l in livros for g in l["generos"]).most_common(8))
    print("series", Counter(l["serie"] for l in livros if l["serie"]).most_common(8))
    print("sem data de verdade", [l["titulo"] for l in livros if l["status"] == "lido" and not l["ano_leitura"]])
    print("exemplos", [(l["titulo"], l["serie"], l["volume"]) for l in livros if l["titulo_original"]][:12:3])
    print("repetidos", [t for t, n in Counter(l["titulo"] for l in livros).items() if n > 1])
    print("conflitos", [(l["titulo"], p) for l, ps in tratados for p in ps if "diverge" in p or "longe" in p or "antes de" in p or "status" in p or "impossível" in p])


if __name__ == "__main__":
    main()
