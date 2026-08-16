#!/usr/bin/env python3
"""Extrae las listas de episodios de las series desde el wikitexto de Wikipedia
(plantillas {{Episode list}}) y genera src/episodes.js."""
import re, time, urllib.request, urllib.parse, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
UA = {"User-Agent": "maraton-marvel/1.0 (github.com/Ssebv/maraton-marvel)"}

# id de la serie -> (artículos candidatos, temporada concreta o None = todas)
SERIES = {
    "xmen97": (["X-Men '97"], None),
    "agent-carter": (["Agent Carter (TV series)"], None),
    "daredevil": (["List of Daredevil (TV series) episodes", "Daredevil (TV series)"], None),
    "jessicajones": (["List of Jessica Jones episodes", "Jessica Jones (TV series)"], None),
    "lukecage": (["List of Luke Cage episodes", "Luke Cage (TV series)"], None),
    "ironfist": (["List of Iron Fist episodes", "Iron Fist (TV series)"], None),
    "defenders": (["The Defenders (miniseries)"], None),
    "punisher": (["List of The Punisher episodes", "The Punisher (TV series)"], None),
    "loki1": (["Loki (season 1)", "Loki (TV series)"], 1),
    "loki2": (["Loki (season 2)", "Loki (TV series)"], 2),
    "whatif": (["List of What If...? episodes", "What If...? (TV series)"], None),
    "wandavision": (["WandaVision"], None),
    "fatws": (["The Falcon and the Winter Soldier"], None),
    "hawkeye": (["Hawkeye (miniseries)"], None),
    "moonknight": (["Moon Knight (TV series)"], None),
    "msmarvel": (["Ms. Marvel (TV series)"], None),
    "shehulk": (["She-Hulk: Attorney at Law"], None),
    "secretinvasion": (["Secret Invasion (TV series)"], None),
    "echo": (["Echo (TV series)"], None),
    "agatha": (["Agatha All Along"], None),
    "daredevil-ba": (["Daredevil: Born Again"], None),
    "ironheart": (["Ironheart (TV series)"], None),
    "eyeswakanda": (["Eyes of Wakanda"], None),
    "zombies": (["Marvel Zombies (TV series)"], None),
    "wonderman": (["Wonder Man (miniseries)"], None),
}

def get(url, intentos=4):
    for i in range(intentos):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode()
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(6 * (i + 1)); continue
            raise
    raise RuntimeError("429")

def get_pagina(titulo, saltos=3):
    wt = get("https://en.wikipedia.org/w/index.php?action=raw&title=" + urllib.parse.quote(titulo))
    m = re.match(r"#REDIRECT\s*\[\[([^\]#|]+)", wt, re.I)
    if m and saltos > 0:
        return get_pagina(m.group(1).strip(), saltos - 1)
    return wt

def limpia(texto):
    texto = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", texto)
    texto = texto.replace("''", "").replace('"', "'").strip()
    return re.sub(r"<[^>]+>", "", texto)

def parse_episodios(wikitexto):
    eps = []
    temporada = 0
    ultimo_num2 = 999
    for bloque in re.finditer(r"\{\{Episode list(?:/sublist\|[^\n|]*)?([\s\S]*?)\n *\}\}", wikitexto):
        campos = dict(re.findall(r"\|\s*(\w+)\s*=\s*(.*?)(?=\n\s*\||\n*$)", bloque.group(1)))
        titulo = limpia(campos.get("Title", ""))
        if not titulo:
            continue
        n2 = campos.get("EpisodeNumber2") or campos.get("EpisodeNumber") or ""
        m = re.search(r"\d+", n2)
        num = int(m.group()) if m else len(eps) + 1
        if num <= ultimo_num2:
            temporada += 1
        ultimo_num2 = num
        fecha = ""
        mf = re.search(r"\{\{[Ss]tart date\|(\d{4})\|(\d{1,2})\|(\d{1,2})", campos.get("OriginalAirDate", "") + campos.get("OriginalRelease", ""))
        if mf:
            fecha = f"{mf.group(1)}-{int(mf.group(2)):02d}-{int(mf.group(3)):02d}"
        eps.append({"s": temporada, "n": num, "t": titulo, "f": fecha})
    return eps

salida, fallos = {}, []
for sid, (paginas, temporada) in SERIES.items():
    eps = []
    for pagina in paginas:
        try:
            wt = get_pagina(pagina)
            eps = parse_episodios(wt)
            if eps:
                break
        except Exception:
            continue
    if temporada is not None:
        eps = [e for e in eps if e["s"] == temporada]
    if eps:
        salida[sid] = eps
        print(f"OK {sid}: {len(eps)} episodios en {max(e['s'] for e in eps) - (min(e['s'] for e in eps) - 1)} temporada(s)")
    else:
        fallos.append(sid)
        print("SIN EPISODIOS:", sid)
    time.sleep(1.0)

def js_ep(e):
    return '{s:%d,n:%d,t:"%s",f:"%s"}' % (e["s"], e["n"], e["t"].replace('"', "'"), e["f"])

js = ("// Generado por scripts/fetch-episodes.py — episodios desde Wikipedia (títulos en inglés)\n"
      "export const EPISODES = {\n")
for sid, eps in salida.items():
    js += f'  "{sid}": [' + ",".join(js_ep(e) for e in eps) + "],\n"
js += "}\n"
open(RAIZ / "src" / "episodes.js", "w").write(js)
print(f"TOTAL: {len(salida)} series, fallos: {fallos}")
