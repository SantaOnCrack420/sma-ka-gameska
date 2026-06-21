#!/usr/bin/env python3
"""
cut_assets.py — vyklíčuje šachovnicové pozadí a nakrájí assety do assets/npc/, enemy/, props/
Zpracovává 5 source sheetů z source_sheets/.
"""

import sys, os, math
import numpy as np
from collections import deque
from PIL import Image

GAME_DIR = os.path.expanduser('~/smazak-game')
SRC_DIR  = os.path.join(GAME_DIR, 'source_sheets')

NPC_DIR   = os.path.join(GAME_DIR, 'assets/npc')
ENEMY_DIR = os.path.join(GAME_DIR, 'assets/enemy')
PROPS_DIR = os.path.join(GAME_DIR, 'assets/props')

for d in [NPC_DIR, ENEMY_DIR, PROPS_DIR]:
    os.makedirs(d, exist_ok=True)


def keying(src_path):
    """Průhledné pozadí — flood-fill šachovnice od okraje (sat < 15)."""
    im = Image.open(src_path).convert('RGB')
    arr = np.asarray(im).astype(int)
    H, W, _ = arr.shape
    R, G, B = arr[..., 0], arr[..., 1], arr[..., 2]
    sat = np.maximum(np.maximum(R, G), B) - np.minimum(np.minimum(R, G), B)
    # Šachovnice těchto sheetů = nízká saturace (sat<15), flood-fill od okraje
    bg = sat < 15
    vis = np.zeros((H, W), bool)
    dq = deque()

    def seed(y, x):
        if 0 <= y < H and 0 <= x < W and bg[y, x] and not vis[y, x]:
            vis[y, x] = True
            dq.append((y, x))

    for x in range(W): seed(0, x); seed(H - 1, x)
    for y in range(H): seed(y, 0); seed(y, W - 1)
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)): seed(y+dy, x+dx)

    alpha = np.where(vis, 0, 255).astype('uint8')
    rgba = np.concatenate([np.asarray(im), alpha[:,:,np.newaxis]], axis=2)
    return Image.fromarray(rgba, 'RGBA')


def col_has_content(arr, x, threshold=4):
    return int(np.sum(arr[:, x, 3] > 0)) >= threshold

def row_has_content(arr, y, threshold=4):
    return int(np.sum(arr[y, :, 3] > 0)) >= threshold

def find_col_spans(arr, min_width=8, gap=4):
    W = arr.shape[1]; in_span = False; spans = []; x0 = 0; empty = 0
    for x in range(W):
        if col_has_content(arr, x):
            if not in_span: in_span = True; x0 = x
            empty = 0
        else:
            if in_span:
                empty += 1
                if empty > gap:
                    in_span = False; x1 = x - empty
                    if x1 - x0 >= min_width: spans.append((x0, x1))
    if in_span:
        x1 = W
        if x1 - x0 >= min_width: spans.append((x0, x1))
    return spans

def find_row_spans(arr, min_height=8, gap=4):
    H = arr.shape[0]; in_span = False; spans = []; y0 = 0; empty = 0
    for y in range(H):
        if row_has_content(arr, y):
            if not in_span: in_span = True; y0 = y
            empty = 0
        else:
            if in_span:
                empty += 1
                if empty > gap:
                    in_span = False; y1 = y - empty
                    if y1 - y0 >= min_height: spans.append((y0, y1))
    if in_span:
        y1 = H
        if y1 - y0 >= min_height: spans.append((y0, y1))
    return spans

def crop_to_content(img):
    arr = np.asarray(img); mask = arr[:,:,3] > 0
    rows = np.any(mask, axis=1); cols = np.any(mask, axis=0)
    if not rows.any(): return img
    r0,r1 = np.where(rows)[0][[0,-1]]; c0,c1 = np.where(cols)[0][[0,-1]]
    return img.crop((c0, r0, c1+1, r1+1))

def make_walk_sheet(frames, pad=2):
    if not frames: return None
    max_h = max(f.height for f in frames)
    total_w = sum(f.width + pad for f in frames) - pad
    sheet = Image.new('RGBA', (total_w, max_h), (0,0,0,0))
    x = 0
    for f in frames:
        sheet.paste(f, (x, max_h - f.height), f)
        x += f.width + pad
    return sheet

def extract_walk_groups(row_img, gap_small=8, gap_large=20, min_w=15):
    """Najde skupiny snímků oddělené větší mezerou."""
    arr = np.asarray(row_img)
    tight = find_col_spans(arr, min_width=min_w, gap=gap_small)
    wide  = find_col_spans(arr, min_width=min_w, gap=gap_large)
    return tight, wide

def save_walk(frames, out_path, name):
    if not frames: return
    sheet = make_walk_sheet(frames)
    sheet.save(out_path)
    print(f"    -> {name}: {len(frames)} snímků, {sheet.size}")

def save_static(cell, out_path, name):
    cell = crop_to_content(cell)
    if cell.width < 4 or cell.height < 4: return
    cell.save(out_path)
    print(f"    -> {name}: {cell.size}")

def frames_from_group(row_img, gx0, gx1):
    block = row_img.crop((gx0, 0, gx1, row_img.height))
    arr = np.asarray(block)
    cols = find_col_spans(arr, min_width=12, gap=6)
    frames = []
    for (fx0, fx1) in cols:
        cell = block.crop((fx0, 0, fx1, block.height))
        cell = crop_to_content(cell)
        if cell.width > 4 and cell.height > 4: frames.append(cell)
    return frames


# ══════════════════════════════════════════════════════════════════
# SHEET A: sheet_enemies_A.png
# THUG, PICKPOCKET, CRIMINAL (řádek 1)
# FAT AGGRESSIVE WOMAN WITH DOG, YOUNG PSYCHO KID (řádek 2)
# ══════════════════════════════════════════════════════════════════

print("\n=== sheet_enemies_A.png ===")
img = keying(os.path.join(SRC_DIR, 'sheet_enemies_A.png'))
arr = np.asarray(img)
row_spans = find_row_spans(arr, min_height=30, gap=15)
print(f"  Řádky: {len(row_spans)}")

for ri, (ry0, ry1) in enumerate(row_spans):
    row_img = img.crop((0, ry0, arr.shape[1], ry1))
    row_arr = np.asarray(row_img)
    groups = find_col_spans(row_arr, min_width=20, gap=25)
    print(f"  Řádek {ri}: {len(groups)} skupin")

    if ri == 0:
        names = ['thug', 'pickpocket', 'criminal']
        for gi, (gx0, gx1) in enumerate(groups[:3]):
            frames = frames_from_group(row_img, gx0, gx1)
            if frames:
                name = names[gi] if gi < len(names) else f'enemy_a_{gi}'
                save_walk(frames, os.path.join(ENEMY_DIR, f'{name}.png'), name)
    elif ri == 1:
        names = ['woman_dog', 'psycho_kid']
        for gi, (gx0, gx1) in enumerate(groups[:2]):
            frames = frames_from_group(row_img, gx0, gx1)
            if frames:
                name = names[gi] if gi < len(names) else f'enemy_a2_{gi}'
                save_walk(frames, os.path.join(ENEMY_DIR, f'{name}.png'), name)


# ══════════════════════════════════════════════════════════════════
# SHEET B: sheet_enemies_B.png
# Chlap s mačetou+psem (řádek 1), chlap s nožem (řádek 2)
# ══════════════════════════════════════════════════════════════════

print("\n=== sheet_enemies_B.png ===")
img = keying(os.path.join(SRC_DIR, 'sheet_enemies_B.png'))
arr = np.asarray(img)
row_spans = find_row_spans(arr, min_height=30, gap=15)
print(f"  Řádky: {len(row_spans)}")

enemy_b_names = ['machete_dog', 'knife_guy']
for ri, (ry0, ry1) in enumerate(row_spans[:2]):
    row_img = img.crop((0, ry0, arr.shape[1], ry1))
    row_arr = np.asarray(row_img)
    tight = find_col_spans(row_arr, min_width=12, gap=6)
    frames = []
    for (fx0, fx1) in tight:
        cell = row_img.crop((fx0, 0, fx1, row_img.height))
        cell = crop_to_content(cell)
        if cell.width > 4 and cell.height > 4: frames.append(cell)
    if frames:
        name = enemy_b_names[ri]
        save_walk(frames, os.path.join(ENEMY_DIR, f'{name}.png'), name)


# ══════════════════════════════════════════════════════════════════
# SHEET C: sheet_npc_crowd.png
# Řádek 1: chodci do davu (statické)
# Řádek 2: Vandal (walk cycle)
# Řádek 3: Kapesní zloděj (walk cycle)
# ══════════════════════════════════════════════════════════════════

print("\n=== sheet_npc_crowd.png ===")
img = keying(os.path.join(SRC_DIR, 'sheet_npc_crowd.png'))
arr = np.asarray(img)
row_spans = find_row_spans(arr, min_height=30, gap=12)
print(f"  Řádky: {len(row_spans)}")

crowd_names = ['man_phone', 'tourist', 'family', 'old_dog', 'cop', 'jogger_f', 'jogger_m', 'cyclist', 'vendor_fruit']

for ri, (ry0, ry1) in enumerate(row_spans):
    row_img = img.crop((0, ry0, arr.shape[1], ry1))
    row_arr = np.asarray(row_img)
    groups = find_col_spans(row_arr, min_width=20, gap=15)
    print(f"  Řádek {ri}: {len(groups)} bloků")

    if ri == 0:
        # Statické chodci
        for ci, (cx0, cx1) in enumerate(groups):
            cell = row_img.crop((cx0, 0, cx1, row_img.height))
            cell = crop_to_content(cell)
            if cell.width < 4 or cell.height < 4: continue
            name = crowd_names[ci] if ci < len(crowd_names) else f'crowd_{ci}'
            save_static(cell, os.path.join(NPC_DIR, f'{name}.png'), name)
    elif ri == 1:
        # Vandal — walk cycle
        frames = []
        for (cx0, cx1) in groups:
            cell = row_img.crop((cx0, 0, cx1, row_img.height))
            cell = crop_to_content(cell)
            if cell.width > 4 and cell.height > 4: frames.append(cell)
        if frames:
            save_walk(frames, os.path.join(ENEMY_DIR, 'vandal.png'), 'vandal')
    elif ri == 2:
        # Kapesní zloděj — walk cycle
        frames = []
        for (cx0, cx1) in groups:
            cell = row_img.crop((cx0, 0, cx1, row_img.height))
            cell = crop_to_content(cell)
            if cell.width > 4 and cell.height > 4: frames.append(cell)
        if frames:
            save_walk(frames, os.path.join(ENEMY_DIR, 'pickpocket2.png'), 'pickpocket2')


# ══════════════════════════════════════════════════════════════════
# SHEET D: sheet_chars_main.png
# Řádek 1: opilci / feťáci (walk cycle, 3 typy)
# Řádek 2: gangster, bodybuilder, pes
# Řádek 3: statické NPC (babka, businessman, teenager, mama, delnik, vendor, dedek)
# ══════════════════════════════════════════════════════════════════

print("\n=== sheet_chars_main.png ===")
img = keying(os.path.join(SRC_DIR, 'sheet_chars_main.png'))
arr = np.asarray(img)
row_spans = find_row_spans(arr, min_height=30, gap=10)
print(f"  Řádky: {len(row_spans)}")

for ri, (ry0, ry1) in enumerate(row_spans):
    row_img = img.crop((0, ry0, arr.shape[1], ry1))
    row_arr = np.asarray(row_img)

    if ri == 0:
        # Opilci, feťáci — 3 skupiny po 3-4 snímcích
        groups = find_col_spans(row_arr, min_width=20, gap=20)
        names = ['fetak', 'opilec', 'somrak']
        for gi, (gx0, gx1) in enumerate(groups[:3]):
            frames = frames_from_group(row_img, gx0, gx1)
            if frames:
                name = names[gi] if gi < len(names) else f'enemy_d0_{gi}'
                save_walk(frames, os.path.join(ENEMY_DIR, f'{name}.png'), name)

    elif ri == 1:
        # Gangster, bodybuilder, pes
        groups = find_col_spans(row_arr, min_width=20, gap=25)
        names = ['gauner', 'peca', 'pes']
        for gi, (gx0, gx1) in enumerate(groups[:3]):
            frames = frames_from_group(row_img, gx0, gx1)
            if frames:
                name = names[gi] if gi < len(names) else f'enemy_d1_{gi}'
                save_walk(frames, os.path.join(ENEMY_DIR, f'{name}.png'), name)

    elif ri == 2:
        # Statické NPC
        groups = find_col_spans(row_arr, min_width=20, gap=12)
        npc_names = ['babka', 'businessman', 'teenager', 'mama', 'delnik', 'vendor', 'dedek']
        for ci, (cx0, cx1) in enumerate(groups):
            cell = row_img.crop((cx0, 0, cx1, row_img.height))
            name = npc_names[ci] if ci < len(npc_names) else f'npc_{ci}'
            save_static(cell, os.path.join(NPC_DIR, f'{name}.png'), name)


# ══════════════════════════════════════════════════════════════════
# SHEET E: sheet_props_anim.png
# Řádek 1: Props (strom, ker, lampa, lavička, popelnice) + itemy + vendor
# Řádek 2: Walk cykly (gauner2, peca2)
# Řádek 3: Pes walk cycle
# ══════════════════════════════════════════════════════════════════

print("\n=== sheet_props_anim.png ===")
img = keying(os.path.join(SRC_DIR, 'sheet_props_anim.png'))
arr = np.asarray(img)
row_spans = find_row_spans(arr, min_height=20, gap=12)
print(f"  Řádky: {len(row_spans)}")

for ri, (ry0, ry1) in enumerate(row_spans):
    row_img = img.crop((0, ry0, arr.shape[1], ry1))
    row_arr = np.asarray(row_img)
    groups = find_col_spans(row_arr, min_width=20, gap=18)
    print(f"  Řádek {ri}: {len(groups)} bloků, výška {ry1-ry0}px")

    if ri == 0:
        props_names  = ['strom', 'ker', 'lampa', 'lavicka', 'popelnice']
        items_names  = ['item_rohlík', 'item_hranolky', 'item_plechovka']
        for ci, (cx0, cx1) in enumerate(groups):
            cell = row_img.crop((cx0, 0, cx1, row_img.height))
            cell = crop_to_content(cell)
            if cell.width < 4 or cell.height < 4: continue
            if ci < len(props_names):
                name = props_names[ci]
                cell.save(os.path.join(PROPS_DIR, f'{name}.png'))
                print(f"    -> {name}: {cell.size}")
            elif ci < len(props_names) + len(items_names):
                name = items_names[ci - len(props_names)]
                cell.save(os.path.join(NPC_DIR, f'{name}.png'))
                print(f"    -> {name}: {cell.size}")
            else:
                cell.save(os.path.join(NPC_DIR, 'vendor_anim.png'))
                print(f"    -> vendor_anim: {cell.size}")

    elif ri == 1:
        names = ['gauner2', 'peca2']
        for gi, (gx0, gx1) in enumerate(groups[:2]):
            frames = frames_from_group(row_img, gx0, gx1)
            if frames:
                name = names[gi]
                save_walk(frames, os.path.join(ENEMY_DIR, f'{name}.png'), name)

    elif ri == 2:
        frames = []
        for (cx0, cx1) in groups:
            cell = row_img.crop((cx0, 0, cx1, row_img.height))
            cell = crop_to_content(cell)
            if cell.width > 4 and cell.height > 4: frames.append(cell)
        if frames:
            save_walk(frames, os.path.join(ENEMY_DIR, 'pes2.png'), 'pes2')


# ══════════════════════════════════════════════════════════════════
# PREVIEW
# ══════════════════════════════════════════════════════════════════

def save_preview(folder, out_path, max_cols=8):
    files = sorted([f for f in os.listdir(folder) if f.endswith('.png')])
    if not files: return
    images = []
    for f in files:
        try: images.append((f, Image.open(os.path.join(folder, f)).convert('RGBA')))
        except: pass
    if not images: return
    thumb_h = 120
    thumbs = []
    for name, img in images:
        ratio = thumb_h / img.height if img.height > 0 else 1
        w = max(1, int(img.width * ratio))
        thumbs.append((name, img.resize((w, thumb_h), Image.LANCZOS)))
    cols = min(len(thumbs), max_cols)
    rows = math.ceil(len(thumbs) / cols)
    cell_w = max(t.width for _, t in thumbs) + 6
    cell_h = thumb_h + 22
    preview = Image.new('RGBA', (cols * cell_w, rows * cell_h), (30, 30, 30, 255))
    for i, (name, thumb) in enumerate(thumbs):
        col = i % cols; row = i // cols
        x = col * cell_w + (cell_w - thumb.width) // 2
        y = row * cell_h + 2
        preview.paste(thumb, (x, y), thumb)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    preview.save(out_path)
    print(f"  Preview: {out_path} ({len(images)} assetů)")

print("\n=== Preview ===")
save_preview(NPC_DIR,   '/mnt/d/preview_npc.png')
save_preview(ENEMY_DIR, '/mnt/d/preview_enemy.png')
save_preview(PROPS_DIR, '/mnt/d/preview_props.png')

print("\n=== Hotovo ===")
print(f"NPC:   {sorted(os.listdir(NPC_DIR))}")
print(f"Enemy: {sorted(os.listdir(ENEMY_DIR))}")
print(f"Props: {sorted(os.listdir(PROPS_DIR))}")
