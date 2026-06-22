#!/usr/bin/env python3
"""
process_gen_props.py — vyklíčuje purpurové pozadí z Gemini-generovaných propů,
odstraní vodoznak, ořeže na objekt, uloží do assets/props/gen/.
"""

import os
import sys
import shutil
import numpy as np
from collections import deque
from PIL import Image

GAME_DIR = '/home/surad/smazak-game'
SRC_DIR  = '/home/surad/.claude/uploads/67a0fb48-d278-43cc-adbe-3ccb2016862f'
ARCHIVE_DIR = os.path.join(GAME_DIR, 'source_props')
OUT_DIR     = os.path.join(GAME_DIR, 'assets/props/gen')

os.makedirs(ARCHIVE_DIR, exist_ok=True)
os.makedirs(OUT_DIR, exist_ok=True)

# Mapování: jmeno → soubor
INPUTS = [
    ('trava',     '673350b6-IMG_2331.png'),
    ('ker',       '88802f55-IMG_2332.png'),
    ('kytky',     '3b3adfb6-IMG_2333.png'),
    ('lampa',     'fb1b87f7-IMG_2334.png'),
    ('kos',       'e4d0c20b-IMG_2335.png'),
    ('popelnice', 'fc1ebefe-IMG_2336.png'),
    ('zastavka',  'a521eba4-IMG_2337.png'),
]


def remove_magenta(arr_rgba):
    """
    Udělá průhledné pixely blízké purpurové #FF00FF.
    Maska: R>180 AND B>180 AND G<110
    Vrátí upravenou kopii pole.
    """
    out = arr_rgba.copy()
    R = out[..., 0].astype(int)
    G = out[..., 1].astype(int)
    B = out[..., 2].astype(int)
    mask = (R > 180) & (B > 180) & (G < 110)
    out[mask, 3] = 0
    return out


def largest_component(arr_rgba):
    """
    Z neprůhledných pixelů (alpha>0) najde největší 4-spojitou komponentu
    a odstraní vše ostatní (vodoznaky, drobné šmouhy).
    """
    H, W = arr_rgba.shape[:2]
    alpha = arr_rgba[..., 3] > 0
    visited = np.zeros((H, W), bool)

    # Najdi všechny komponenty
    components = []

    for sy in range(H):
        for sx in range(W):
            if alpha[sy, sx] and not visited[sy, sx]:
                # BFS
                dq = deque()
                dq.append((sy, sx))
                visited[sy, sx] = True
                pixels = [(sy, sx)]
                while dq:
                    y, x = dq.popleft()
                    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        ny, nx = y+dy, x+dx
                        if 0 <= ny < H and 0 <= nx < W and alpha[ny, nx] and not visited[ny, nx]:
                            visited[ny, nx] = True
                            dq.append((ny, nx))
                            pixels.append((ny, nx))
                components.append(pixels)

    if not components:
        return arr_rgba

    # Největší komponenta
    biggest = max(components, key=len)
    biggest_set = set(biggest)

    # Vynuluj vše co není v největší komponentě
    out = arr_rgba.copy()
    for comp in components:
        if comp is not biggest:
            for (y, x) in comp:
                out[y, x, 3] = 0

    return out


def crop_to_content(arr_rgba):
    """Ořeže na bounding box pixelů s alpha>0."""
    mask = arr_rgba[..., 3] > 0
    rows = np.any(mask, axis=1)
    cols = np.any(mask, axis=0)
    if not rows.any():
        return arr_rgba
    r0, r1 = np.where(rows)[0][[0, -1]]
    c0, c1 = np.where(cols)[0][[0, -1]]
    return arr_rgba[r0:r1+1, c0:c1+1]


def process(name, src_filename):
    src_path = os.path.join(SRC_DIR, src_filename)
    archive_path = os.path.join(ARCHIVE_DIR, f'{name}.png')
    out_path = os.path.join(OUT_DIR, f'{name}.png')

    # 1. Archivuj originál
    shutil.copy2(src_path, archive_path)
    print(f"\n--- {name} ---")
    print(f"  Archivováno: {archive_path}")

    # 2. Načti jako RGBA
    img = Image.open(src_path).convert('RGBA')
    arr = np.asarray(img).copy()
    print(f"  Originální rozměry: {img.width}×{img.height}")

    # 3. Vyklíčuj purpurovou
    arr = remove_magenta(arr)
    n_transparent = np.sum(arr[..., 3] == 0)
    print(f"  Pixelů vyklíčováno: {n_transparent}")

    # 4. Odstraň vodoznak — nech jen největší komponentu
    arr = largest_component(arr)

    # 5. Ořeže na content
    arr = crop_to_content(arr)
    h, w = arr.shape[:2]
    ratio = w / h
    print(f"  Výsledné rozměry: {w}×{h} px, poměr stran: {ratio:.3f}")

    # 6. Ulož
    result = Image.fromarray(arr, 'RGBA')
    result.save(out_path)
    print(f"  Uloženo: {out_path}")

    return w, h, ratio


# Zpracuj vše
results = {}
for name, src_file in INPUTS:
    try:
        w, h, ratio = process(name, src_file)
        results[name] = (w, h, ratio)
    except Exception as e:
        print(f"  CHYBA pro {name}: {e}")
        import traceback; traceback.print_exc()

print("\n\n=== SOUHRN ===")
print(f"{'Prop':<12} {'Rozměry':>14}  {'Poměr (š/v)':>12}")
print("-" * 42)
for name, (w, h, ratio) in results.items():
    print(f"{name:<12} {w:>5}×{h:<5}px  {ratio:>12.3f}")

print("\nHotovo.")
