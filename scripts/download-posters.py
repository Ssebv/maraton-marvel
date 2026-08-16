#!/usr/bin/env python3
"""Descarga los pósters (miniatura ~260px) a public/posters/ y reescribe src/posters.js
con rutas locales. Así la página no depende de Wikipedia en cada visita."""
import re, os, time, urllib.request, urllib.parse, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DEST = RAIZ / "public" / "posters"
DEST.mkdir(parents=True, exist_ok=True)

s = open(RAIZ / "src" / "posters.js").read()
urls = dict(re.findall(r'"([\w-]+)": "(https?://[^"]+)"', s))
locales = dict(re.findall(r'"([\w-]+)": "(posters/[^"]+)"', s))
UA = {"User-Agent": "maraton-marvel/1.0 (personal watch tracker; github.com/Ssebv/maraton-marvel)"}

def thumb_url(original):
    # https://upload.wikimedia.org/wikipedia/en/5/55/Name.jpg
    #   -> https://upload.wikimedia.org/wikipedia/en/thumb/5/55/Name.jpg/260px-Name.jpg
    limpio = original.split("?")[0]
    m = re.match(r"(https://upload\.wikimedia\.org/wikipedia/[^/]+)/(\w/\w\w)/([^/]+)$", limpio)
    if not m:
        return None, limpio
    base, hashdir, nombre = m.groups()
    return f"{base}/thumb/{hashdir}/{nombre}/260px-{nombre}", limpio

def bajar(url):
    for intento in range(5):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(6 * (intento + 1)); continue
            raise
    raise RuntimeError("429 persistente")

salida, fallos = dict(locales), []
for pid, url in urls.items():
    limpio = url.split("?")[0].replace("/300px-", "/330px-")
    ext = os.path.splitext(urllib.parse.urlparse(limpio).path)[1].lower() or ".jpg"
    if ext == ".svg": ext = ".png"  # los SVG (logos) se piden como PNG renderizado
    destino = DEST / f"{pid}{ext}"
    if destino.exists() and destino.stat().st_size > 1000:
        salida[pid] = f"posters/{pid}{ext}"; continue
    thumb, original = thumb_url(url)
    if limpio.endswith(".svg") and thumb:
        thumb = thumb.replace(f"260px-", "260px-") + ".png"
    datos = None
    for candidato in filter(None, [thumb, original]):
        try:
            datos = bajar(candidato); break
        except Exception as e:
            ultimo = f"{candidato}: {e}"
    if not datos:
        fallos.append(f"{pid}: {ultimo}"); continue
    destino.write_bytes(datos)
    salida[pid] = f"posters/{pid}{ext}"
    time.sleep(0.7)

js = ("// Generado por scripts/download-posters.py — pósters servidos localmente desde public/posters/\n"
      "export const POSTERS = {\n" +
      "".join(f'  "{k}": "{v}",\n' for k, v in salida.items()) +
      "}\n")
open(RAIZ / "src" / "posters.js", "w").write(js)
print(f"OK: {len(salida)} pósters locales, {len(fallos)} fallos")
for f in fallos: print("  FALLO", f)
