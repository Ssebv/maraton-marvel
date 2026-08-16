#!/usr/bin/env python3
"""Descarga pósters pendientes y fotos de actores/directores desde Wikipedia,
y regenera src/posters.js y src/people.js."""
import re, json, time, unicodedata, urllib.request, urllib.parse, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
UA = {"User-Agent": "maraton-marvel/1.0 (github.com/Ssebv/maraton-marvel)"}

def get(url, intentos=5):
    for i in range(intentos):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(6 * (i + 1)); continue
            raise
    raise RuntimeError("429 persistente")

def resumen(titulo):
    u = "https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(titulo)
    return json.loads(get(u))

def bajar_imagen(src, destino, ancho):
    limpio = src.split("?")[0]
    candidatos = []
    if re.search(r"/\d+px-", limpio):
        candidatos.append(re.sub(r"/\d+px-", f"/{ancho}px-", limpio))
    candidatos.append(limpio)
    for cand in candidatos:
        try:
            destino.write_bytes(get(cand)); return True
        except Exception:
            continue
    return False

# ── 1. Pósters de las series de Netflix nuevas ──
POSTERS_NUEVOS = {
    "jessicajones": "Jessica Jones (TV series)",
    "lukecage": "Luke Cage (TV series)",
    "ironfist": "Iron Fist (TV series)",
    "defenders": "The Defenders (miniseries)",
    "punisher": "The Punisher (TV series)",
}
pdir = RAIZ / "public" / "posters"
for pid, titulo in POSTERS_NUEVOS.items():
    if list(pdir.glob(pid + ".*")):
        continue
    try:
        j = resumen(titulo)
        src = (j.get("thumbnail") or {}).get("source")
        if not src:
            print("POSTER SIN IMAGEN:", pid); continue
        ext = "." + src.split("?")[0].rsplit(".", 1)[-1].lower().replace("jpeg", "jpg")
        if ext not in (".jpg", ".png", ".webp"): ext = ".jpg"
        if bajar_imagen(src, pdir / f"{pid}{ext}", 330):
            print("POSTER OK:", pid)
        else:
            print("POSTER FALLO:", pid)
    except Exception as e:
        print("POSTER FALLO:", pid, e)
    time.sleep(1.0)

# ── 2. Personas: extraer nombres de data.js ──
data = open(RAIZ / "src" / "data.js").read()
nombres = set()
for m in re.finditer(r'cast: \[([^\]]+)\]', data):
    for n in re.findall(r'"([^"]+)"', m.group(1)):
        nombres.add(re.sub(r' \((voz|creador|creadora|showrunner)\)$', '', n))
for m in re.finditer(r'dir: "([^"]+)"', data):
    d = re.sub(r' \((creador|creadora|showrunner|creadores)\)$', '', m.group(1))
    if any(x in d for x in (" y ", " & ", "Varios", ",")):
        if d == "Anthony y Joe Russo":
            nombres.add("Russo brothers")
        continue
    nombres.add(d)

def slug(n):
    s = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

gdir = RAIZ / "public" / "people"
gdir.mkdir(exist_ok=True)
gente, fallos = {}, []
for nombre in sorted(nombres):
    sl = slug(nombre)
    existentes = list(gdir.glob(sl + ".*"))
    if existentes:
        gente[nombre] = f"people/{existentes[0].name}"; continue
    encontrado = False
    for sufijo in ("", " (actor)", " (actress)", " (director)", " (filmmaker)"):
        try:
            j = resumen(nombre + sufijo)
            if j.get("type") == "disambiguation":
                continue
            src = (j.get("thumbnail") or {}).get("source")
            if not src:
                continue
            ext = "." + src.split("?")[0].rsplit(".", 1)[-1].lower().replace("jpeg", "jpg")
            if ext not in (".jpg", ".png", ".webp"): ext = ".jpg"
            if bajar_imagen(src, gdir / f"{sl}{ext}", 120):
                gente[nombre] = f"people/{sl}{ext}"; encontrado = True
            break
        except Exception:
            continue
    if not encontrado:
        fallos.append(nombre)
    time.sleep(0.9)

# ── 3. Regenerar índices ──
entradas = {f.stem: f"posters/{f.name}" for f in sorted(pdir.glob("*")) if f.stat().st_size > 1000}
open(RAIZ / "src" / "posters.js", "w").write(
    "// Generado — pósters servidos localmente desde public/posters/\n"
    "export const POSTERS = {\n" +
    "".join(f'  "{k}": "{v}",\n' for k, v in entradas.items()) + "}\n")
open(RAIZ / "src" / "people.js", "w").write(
    "// Generado por scripts/download-people.py — fotos de actores y directores\n"
    "export const PEOPLE = {\n" +
    "".join(f'  "{k}": "{v}",\n' for k, v in sorted(gente.items())) + "}\n")
print(f"PERSONAS: {len(gente)} con foto, {len(fallos)} sin foto")
if fallos: print("SIN FOTO:", ", ".join(fallos))
