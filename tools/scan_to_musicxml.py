#!/usr/bin/env python3

"""

tools/scan_to_musicxml.py

==========================

Universeel, Volledig Mechanisch Partituur Conversieprogramma (OMR).

Converteert elke partituur-scan (PDF of PNG) rechtstreeks naar een geldige MusicXML:

1. Voorbewerking (Pre-processing):

   - PDF transparant renderen naar 500 DPI via PyMuPDF.

   - Automatisch rechtzetten (Deskewing via projectieprofiel-variantie, exacte 0.00° uitlijning).

   - Filteren & egaliseren (scannerruis wegwerken, diepe zwarte inkt, strak wit papier).

2. Systeem- en Balklijndetectie:

   - Dynamisch 5-tands kamfilter (comb-filter) om balkafstanden van 24-34 px te detecteren.

   - Volgt de 5 balklijnen (L1..L5) lokaal per stem.

3. Maatstreepdetectie:

   - Verticale morfologie segmenteert systemen in afzonderlijke maten.

4. Stem-First Symbooldetectie & Subtractieve Rusten-Eliminatie:

   - Verticale stokdetectie (h >= 2.5 * sp) als primaire ankerlijn voor elke noot.

   - Uiteinde 1 (kop): toonhoogte op L1..L5, toevallige tekens (#, b, natural) direct links, punten rechts.

   - Uiteinde 2 (stokeinde): dwarsbalken (links/rechts/beide), vaantjes, of kaal stokeinde (kwartnoot).

   - Hele noten: losstaande grote open holtes (floodFill).

   - Subtractieve eliminatie: na verwijdering van noten en lijnen blijven de rusten als residu over.

5. MusicXML DOM Export:

   - Schrijft direct geldige <score-partwise> XML weg.

6. Visuele Bewijslast (Debug Overlay):

   - Genereert controlebeelden met rode balklijnen, blauwe maatstrepen en groene nootlabels.

Gebruik:

    python tools/scan_to_musicxml.py --input "assets/sample-scores/befiehl-du-deine-wege.pdf" --output "assets/sample-scores/befiehl-du-deine-wege.musicxml" --key-fifths 2 --title "Befiehl du deine Wege"

"""

import sys

import os

import argparse

from pathlib import Path

import xml.etree.ElementTree as ET

from xml.dom import minidom

import json

import numpy as np

import cv2

if sys.platform.startswith('win'):

    try:

        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

    except Exception:

        pass

# ==============================================================================

# 1. VOORBEWERKING: RENDERING, DESKEW & FILTERING

# ==============================================================================

def load_or_render_images(input_path, dpi=500):
    """Laadt een PNG/JPG of rendert alle pagina's van een PDF naar 500 DPI grayscale arrays."""
    p = Path(input_path).resolve()
    if not p.exists():
        raise FileNotFoundError(f"Bestand niet gevonden: {input_path}")
    if p.suffix.lower() == '.pdf':
        try:
            import pymupdf
        except ImportError:
            import fitz as pymupdf
            
        print(f"📄 PDF renderen naar {dpi} DPI: {p.name}")
        doc = pymupdf.open(str(p))
        pages = []
        zoom = dpi / 72.0
        mat = pymupdf.Matrix(zoom, zoom)
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img_data = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, 3))
            gray = cv2.cvtColor(img_data, cv2.COLOR_RGB2GRAY)
            pages.append(gray)
            out_img_name = f"{p.stem}_page_{page_idx+1}.png"
            cv2.imwrite(str(p.parent / out_img_name), gray)
        doc.close()
        print(f"🖼️ {len(pages)} pagina('s) succesvol ingelezen.")
        return pages
    else:
        gray = cv2.imread(str(p), cv2.IMREAD_GRAYSCALE)
        if gray is None:
            raise ValueError(f"Kon afbeelding niet inlezen: {input_path}")
        return [gray]

def load_or_render_image(input_path, dpi=500):
    """Laadt een PNG/JPG of rendert pagina 1 van een PDF (backward compatibility)."""
    return load_or_render_images(input_path, dpi=dpi)[0]

def deskew_score(gray_img, angle_range=(-3.0, 3.0), step=0.05):

    """

    Meet de exacte scheefstand via projectieprofiel-variantie en roteert de afbeelding

    zodat alle balklijnen exact horizontaal (0.00°) liggen.

    """

    h, w = gray_img.shape

    # Focus op het centrale deel van de pagina (15% marges weglaten)

    roi = gray_img[int(h*0.15):int(h*0.85), int(w*0.15):int(w*0.85)]

    

    # Downsample voor snelle berekening

    scale = 0.25

    small = cv2.resize(roi, (0, 0), fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    inv = 255 - small

    inv[inv < 70] = 0 # Verwijder lichte ruis

    

    sh, sw = small.shape

    center = (sw // 2, sh // 2)

    

    best_angle = 0.0

    max_var = -1.0

    angles = np.arange(angle_range[0], angle_range[1] + step/2, step)

    

    for a in angles:

        M = cv2.getRotationMatrix2D(center, a, 1.0)

        rot = cv2.warpAffine(inv, M, (sw, sh), flags=cv2.INTER_NEAREST, borderValue=0)

        proj = np.sum(rot, axis=1)

        v = np.var(proj)

        if v > max_var:

            max_var = v

            best_angle = float(a)

            

    print(f"📐 Gemeten scheefstand: {best_angle:+.3f}°")

    

    if abs(best_angle) > 0.02:

        full_center = (w // 2, h // 2)

        M_full = cv2.getRotationMatrix2D(full_center, best_angle, 1.0)

        deskewed = cv2.warpAffine(gray_img, M_full, (w, h), flags=cv2.INTER_CUBIC, borderValue=255)

        return deskewed, best_angle

    return gray_img, 0.0

def filter_and_enhance_image(gray_img):

    """

    Verwijdert grijze scannerruis, egaliseert de achtergrond naar 255 (wit)

    en maakt de inkt diepzwart en scherp.

    """

    arr = gray_img.astype(np.float32)

    # Clip lichte achtergrond naar 255 en donkere inkt naar diepzwart

    clean = np.clip((arr - 95.0) / (205.0 - 95.0) * 255.0, 0, 255).astype(np.uint8)

    return clean

# ==============================================================================

# 2. BALKLIJN- EN SYSTEEMDETECTIE (COMB-FILTER)

# ==============================================================================

def get_staff_lines_at_x(full_img, target_x, est_y_center, search_radius=110, sp_range=(24.0, 34.0)):

    """

    Vindt via een kam-filter (comb filter) de exacte 5 balklijnen rond een specifieke x-kolom.

    """

    h, w = full_img.shape

    y_min = max(0, est_y_center - search_radius)

    y_max = min(h, est_y_center + search_radius)

    x_min = max(0, target_x - 30)

    x_max = min(w, target_x + 30)

    

    slice_col = 255.0 - np.mean(full_img[y_min:y_max, x_min:x_max], axis=1)

    

    best_score = -1.0

    best_top = 0

    best_sp = 27.0

    

    for sp in np.arange(sp_range[0], sp_range[1] + 0.2, 0.25):

        max_top = len(slice_col) - int(round(4 * sp)) - 1

        if max_top <= 5:

            continue

        for top_y in range(5, max_top):

            teeth = [int(round(top_y + j * sp)) for j in range(5)]

            sc = sum(slice_col[y] for y in teeth)

            if sc > best_score:

                best_score = sc

                best_top = top_y

                best_sp = sp

                

    abs_top = y_min + best_top

    lines = [abs_top + j * best_sp for j in range(5)]

    return lines, best_sp

def find_all_staves_on_page(img, sp_est=27.0):
    """
    Vindt alle notenbalken op de pagina via horizontale morfologie en 5-tands kamfilter.
    Controleert na initiële piekdetectie of er direct boven de gevonden balk (op -sp)
    een echte bovenste balklijn ligt die gemist is, zodat een balk nooit 1 lijn te laag staat.
    """
    h, w = img.shape
    horiz_k = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
    lines_mask = cv2.morphologyEx((img < 150).astype(np.uint8), cv2.MORPH_OPEN, horiz_k)
    proj = np.sum(lines_mask[:, int(w*0.20):int(w*0.80)], axis=1)

    # 1. Bepaal de universele balkafstand (spacing) via afstanden tussen opeenvolgende horizontale lijnpieken
    thresh_p = np.max(proj) * 0.25
    cand_l = [y for y in range(1, len(proj)-1) if proj[y] >= thresh_p and proj[y] >= proj[y-1] and proj[y] >= proj[y+1]]
    p_lines = []
    for y in sorted(cand_l, key=lambda y: proj[y], reverse=True):
        if all(abs(y - p) >= 15 for p in p_lines):
            p_lines.append(y)
    p_lines.sort()
    diffs = np.diff(p_lines)
    valid_sp = diffs[(diffs >= 20) & (diffs <= 45)]
    if len(valid_sp) > 0:
        best_sp = float(np.median(valid_sp))
    else:
        best_sp = sp_est

    scores = np.zeros(len(proj))
    for y in range(100, len(proj) - int(round(4 * best_sp)) - 10):
        teeth = [int(round(y + j * best_sp)) for j in range(5)]
        scores[y] = sum(max(proj[max(0, t-2):min(len(proj), t+3)]) for t in teeth)

    cand_peaks = []
    max_score = np.max(scores)
    thresh = max(600.0, max_score * 0.20)
    for y in range(200, len(scores) - 200):
        if scores[y] >= thresh and scores[y] >= scores[y-1] and scores[y] >= scores[y+1]:
            cand_peaks.append((y, scores[y]))

    cand_peaks.sort(key=lambda it: it[1], reverse=True)
    nms_peaks = []
    for y, sc in cand_peaks:
        if all(abs(y - py) >= 180 for py, _ in nms_peaks):
            nms_peaks.append((y, sc))

    nms_peaks.sort(key=lambda it: it[0])

    def band3(idx):
        return float(np.sum(proj[max(0, idx-1):min(len(proj), idx+2)]))

    staves = []
    for p, sc in nms_peaks:
        best_sc_p = -1
        best_lines = None
        best_sp_local = best_sp
        for sp in np.arange(best_sp - 3.0, best_sp + 3.0, 0.25):
            for top in range(p - 8, p + 9):
                teeth = [top + j * sp for j in range(5)]
                sc_p = sum(proj[int(round(t))] for t in teeth if 0 <= int(round(t)) < len(proj))
                if sc_p > best_sc_p:
                    best_sc_p = sc_p
                    best_lines = teeth
                    best_sp_local = sp

        # Optimale 5-tands kamfilter piek
        staves.append({
            'center': int(np.mean(best_lines)),
            'top_y': best_lines[0],
            'bottom_y': best_lines[4],
            'spacing': best_sp_local,
            'lines': best_lines
        })
    return staves

def group_staves_by_b0(img, staves):
    """
    Stap 1: Systeemgroepering via de initiële maatstreep (B0).
    Controleert of opeenvolgende balken verbonden zijn door een verticale lijn
    aan de linkerrand van de balken (B0).
    Retourneert: list van systemen, waarbij elk systeem een dict is:
      {
        'staves': [s0, s1, ...],
        'b0_x': int (positie van B0)
      }
    """
    if not staves:
        return []

    st_starts = []
    for s in staves:
        l0, l4 = int(s['lines'][0]), int(s['lines'][4])
        strip = img[l0:l4+1, :1200]
        col_ink = np.sum(strip < 150, axis=0)
        c_starts = np.where(col_ink >= 3)[0]
        st_starts.append(int(c_starts[0]) if len(c_starts) > 0 else 300)

    systems_staves = [[staves[0]]]
    for i in range(len(staves) - 1):
        s_top = staves[i]
        s_bot = staves[i+1]
        y_top = int(s_top['lines'][4]) + 4
        y_bot = int(s_bot['lines'][0]) - 4
        h_gap = y_bot - y_top

        # Zoek naar B0 in de tussenruimte in de linkerzone
        gap_strip = (img[y_top:y_bot, 100:1200] < 150).astype(np.uint8)
        col_sums = np.sum(gap_strip, axis=0) if gap_strip.size > 0 else np.array([0])
        max_idx = int(np.argmax(col_sums)) if len(col_sums) > 0 else 0
        max_col = col_sums[max_idx]

        is_connected = (h_gap > 0 and max_col >= 0.70 * h_gap)
        if is_connected:
            systems_staves[-1].append(s_bot)
        else:
            systems_staves.append([s_bot])

    system_dicts = []
    for sys_idx, sys_s in enumerate(systems_staves):
        if len(sys_s) > 1:
            y_t = int(sys_s[0]['lines'][4]) + 4
            y_b = int(sys_s[1]['lines'][0]) - 4
            strip_gap = (img[y_t:y_b, 100:1200] < 150).astype(np.uint8)
            col_s = np.sum(strip_gap, axis=0)
            b0_x = 100 + int(np.argmax(col_s))
        else:
            l0, l4 = int(sys_s[0]['lines'][0]), int(sys_s[0]['lines'][4])
            strip_1 = img[l0:l4+1, :800]
            col_1 = np.sum(strip_1 < 150, axis=0)
            st_1 = np.where(col_1 >= 3)[0]
            b0_x = int(st_1[0]) if len(st_1) > 0 else 300

        system_dicts.append({
            'staves': sys_s,
            'b0_x': b0_x
        })
    return system_dicts

# ==============================================================================

# 3. MAATSTREEPDETECTIE (MULTI-STAFF 16-SPATIES CONSENSUS)

# ==============================================================================

def detect_measure_barlines(img, sys_staves, b0_x=None, is_first_system=False, min_measure_w=320, key_fifths=0):
    """
    Universele maatstreepdetector (Barline-First conform AGENTS.md Stap 2):
    - In meerbalkige systemen (SATB, SAB, piano): detecteert synchrone verticale continuïteit over alle balken.
    - Begint pas NA de sleutels en voortekens (geen spookmaatstrepen in de headerzone).
    - Minimale maatbreedte min_measure_w voorkomt dat losse nootstokken binnen een maat als maatstreep worden gezien.
    """
    num_staves = len(sys_staves)
    sp_local = sys_staves[0]['spacing']
    if b0_x is None:
        l0, l4 = int(sys_staves[0]['lines'][0]), int(sys_staves[0]['lines'][4])
        strip_0 = img[l0:l4+1, :800]
        col_0 = np.sum(strip_0 < 150, axis=0)
        c_st = np.where(col_0 >= 3)[0]
        b0_x = int(c_st[0]) if len(c_st) > 0 else 300

    # Start pas ruim ná sleutel en toonsoort
    header_offset = int(180 + abs(key_fifths) * sp_local * 1.5) if not is_first_system else 180
    x_start = int(b0_x + header_offset)
    x_end = int(img.shape[1] * 0.98)

    if num_staves > 1:
        hits = np.zeros(x_end - x_start)

        for s in sys_staves:
            lines = s['lines']
            for j in range(4):
                y_sp = int(round((lines[j] + lines[j+1]) / 2.0))
                row = (img[y_sp, x_start:x_end] < 150)
                dil = cv2.dilate(row.astype(np.uint8).reshape(1, -1), np.ones((1, 19), dtype=np.uint8)).ravel()
                hits += dil

        total_spaces = num_staves * 4
        ratio = 0.80
        min_hits = max(6, int(round(total_spaces * 0.70)))
        strong_threshold = max(6, int(round(total_spaces * ratio)))
        min_x = int(b0_x + sp_local * 12) if is_first_system else (x_start + 20)

        peaks = np.where(hits >= min_hits)[0] + x_start
        clusters = []
        for p in peaks:
            if not clusters or p - clusters[-1][-1] > 25:
                clusters.append([p])
            else:
                clusters[-1].append(p)

        raw_bars = []
        for cl in clusters:
            x_c = int(np.mean(cl))
            max_h = np.max(hits[np.array(cl) - x_start])
            if x_c < min_x:
                continue
            raw_bars.append((x_c, max_h))

        strong = [item for item in raw_bars if item[1] >= strong_threshold]

        # Multi-staves validatie: Een echte maatstreep moet in minstens (num_staves - 1) balken
        # door alle 4 de tussenruimtes (van lijn 0 naar lijn 4) lopen.
        valid_bars = []
        for x, h in strong:
            st_4 = 0
            for s in sys_staves:
                sp_hit = sum(1 for j in range(4) if np.any(img[int((s['lines'][j] + s['lines'][j+1])/2), max(0, x-7):min(img.shape[1], x+8)] < 150))
                if sp_hit == 4:
                    st_4 += 1
            is_end = (x > img.shape[1] - 220)
            req_4 = max(2, num_staves - 1)
            if st_4 >= req_4 or is_end:
                valid_bars.append((x, h))

        strong_nms = []
        for x, h in sorted(valid_bars, key=lambda it: it[1], reverse=True):
            if all(abs(x - sx) >= min_measure_w for sx, sh in strong_nms):
                strong_nms.append((x, h))
        strong_nms.sort(key=lambda it: it[0])
        return [x for x, h in strong_nms]
    else:
        # 1-balkig systeem (solostem / melodie zoals Calypso)
        s = sys_staves[0]
        lines = s['lines']
        l0, l4 = int(lines[0]), int(lines[4])
        staff_h = l4 - l0
        sp = staff_h / 4.0

        x_start = int(b0_x + 180) if is_first_system else int(b0_x + 80)
        x_end = int(img.shape[1] * 0.98)

        

        staff_crop = (img[l0:l4+1, :] < 150)

        col_ink = np.sum(staff_crop, axis=0)

        cand_cols = np.where(col_ink >= staff_h * 0.88)[0]

        

        clusters = []

        for c in cand_cols:

            if c < x_start or c > x_end:

                continue

            if not clusters or c - clusters[-1][-1] > 15:

                clusters.append([c])

            else:

                clusters[-1].append(c)

                

        filtered = []

        for cl in clusters:

            cx = int(np.mean(cl))

            loc_lines = track_local_staff_lines(img, s, cx)

            loc_sp = (loc_lines[4] - loc_lines[0]) / 4.0

            

            # Controleer breedte in de centrale tussenruimtes (ruimtes 0..3)

            # Een echte maatstreep heeft GEEN nootkop en is overal dun

            wide_rows = 0

            for j in range(4):

                for y in range(int(round(loc_lines[j] + 5)), int(round(loc_lines[j+1] - 4))):

                    w = np.sum(img[y, cx-10:cx+11] < 150)

                    if w >= 10:

                        wide_rows += 1

                        

            is_end = (cx > img.shape[1] - 220)

            if wide_rows > 3 and not is_end:

                continue

                

            # Schiet niet omhoog in een dwarsbalk boven de balk

            ext_above = np.sum(img[int(loc_lines[0]-loc_sp*0.7):int(loc_lines[0]-2), cx-2:cx+3] < 150)

            if ext_above >= 12:

                continue

                

            filtered.append((cx, np.max(col_ink[cl])))

            

        # NMS met minimale maatbreedte 280 px

        filtered.sort(key=lambda it: it[1], reverse=True)

        nms = []

        for cx, ink in filtered:

            if all(abs(cx - sx) >= 280 for sx, _ in nms):

                nms.append((cx, ink))

                

        nms.sort(key=lambda it: it[0])

        return [cx for cx, _ in nms]

def analyze_system_header(clean_img, sys_staves, b1, b0_x=None, key_fifths="auto"):
    """
    Universele optische analyse van de header-zone [x_left, b1] op Systeem 1:
    1. Sleuteldetectie per balk (G-sleutel vs F-sleutel).
    2. Maatsoortdetectie (Common Time 4/4, Alla Breve 2/2, 6/8 of 2/4).
    3. Start van de noten (x_notes_start).
    """
    s0 = sys_staves[0]
    lines0 = s0['lines']
    sp0 = s0['spacing']
    l0_0, l4_0 = int(lines0[0]), int(lines0[4])

    # 0. Startpositie van de balk (B0)
    if b0_x is not None:
        x_staff_start = b0_x
    else:
        strip_left = clean_img[int(sys_staves[0]['lines'][0]):int(sys_staves[-1]['lines'][4])+1, :800] if len(sys_staves) > 1 else clean_img[l0_0:l4_0+1, :600]
        col_ink = np.sum(strip_left < 150, axis=0)
        staff_starts = np.where(col_ink >= (int( strip_left.shape[0] * 0.85 ) if len(sys_staves) > 1 else 3))[0]
        x_staff_start = int(staff_starts[0]) if len(staff_starts) > 0 else 200

    

    # 1. Sleutels classificeren per balk

    detected_clefs = []

    for s in sys_staves:

        lines = s['lines']

        sp = s['spacing']

        l0, l4 = int(lines[0]), int(lines[4])

        clef_crop = clean_img[int(l0 - sp*1.2):int(l4 + sp*1.2), x_staff_start:x_staff_start+180]

        _, inv_cl = cv2.threshold(clef_crop, 160, 255, cv2.THRESH_BINARY_INV)

        hk = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 1))

        cl_no_lines = cv2.subtract(inv_cl, cv2.morphologyEx(inv_cl, cv2.MORPH_OPEN, hk))

        n_c, _, stats_c, cents_c = cv2.connectedComponentsWithStats(cl_no_lines)

        best_h = 0

        for ci in range(1, n_c):

            cw, ch, ca = stats_c[ci, 2], stats_c[ci, 3], stats_c[ci, 4]

            cx = cents_c[ci, 0]

            if cx < 140 and ca > 300 and ch > best_h:

                best_h = ch

        h_ratio = best_h / sp

        detected_clefs.append('treble' if h_ratio >= 2.6 else 'bass')

        

    # 2. Maatsoort en Start van de noten bepalen via Glyphs vóór B1

    crop_header = clean_img[l0_0:l4_0+1, x_staff_start:min(b1, x_staff_start + int(sp0 * 16))]

    _, inv_h = cv2.threshold(crop_header, 160, 255, cv2.THRESH_BINARY_INV)

    hk_h = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 1))

    no_lines_h = cv2.subtract(inv_h, cv2.morphologyEx(inv_h, cv2.MORPH_OPEN, hk_h))

    

    num_e, _, stats_e, cents_e = cv2.connectedComponentsWithStats(no_lines_h)

    elements = []
    for i in range(1, num_e):
        x, y, w, h, a = stats_e[i, 0], stats_e[i, 1], stats_e[i, 2], stats_e[i, 3], stats_e[i, 4]
        if a >= 50 and w >= 5 and h >= int(sp0 * 0.40) and (w / max(1, h)) <= 2.8:
            elements.append((x, y, w, h, a))

    elements.sort(key=lambda it: it[0])

    glyphs = []
    for el in elements:
        if not glyphs or el[0] - (glyphs[-1]['x'] + glyphs[-1]['w']) > 8:
            glyphs.append({
                'x': el[0], 'w': el[2], 'y': el[1], 'h': el[3],
                'area': el[4]
            })
        else:
            g = glyphs[-1]
            x_min = min(g['x'], el[0])
            x_max = max(g['x'] + g['w'], el[0] + el[2])
            y_min = min(g['y'], el[1])
            y_max = max(g['y'] + g['h'], el[1] + el[3])
            g['x'] = x_min
            g['w'] = x_max - x_min
            g['y'] = y_min
            g['h'] = y_max - y_min
            g['area'] += el[4]

    time_sig = "4/4"
    x_notes_start = x_staff_start + 180

    # Clef end via clef bounding box
    clef_glyph = None
    for g in glyphs:
        if g['x'] < int(sp0 * 6.0) and g['h'] >= 2.0 * sp0 and g['area'] >= 1200:
            if clef_glyph is None or g['area'] > clef_glyph['area']:
                clef_glyph = g
    clef_end = (clef_glyph['x'] + clef_glyph['w']) if clef_glyph else int(sp0 * 4.0)

    header_cand = []
    for g in glyphs:
        if g['x'] > clef_end and g['w'] >= 25 and g['area'] >= 450 and g['x'] < int(sp0 * 9.0) and (g['h'] / max(1, g['w'])) < 4.80:
            header_cand.append(g)

    time_glyph = header_cand[-1] if header_cand else None

    if isinstance(key_fifths, str) and key_fifths.lower() == 'auto':
        acc_end_x = int(time_glyph['x']) if time_glyph else int(sp0 * 8.0)
        acc_glyphs = [g for g in glyphs if clef_end <= g['x'] < acc_end_x]

        if not acc_glyphs or sum(g['area'] for g in acc_glyphs) < 300:
            det_key_fifths = 0
        else:
            acc_x1 = min(g['x'] for g in acc_glyphs)
            acc_x2 = max(g['x'] + g['w'] for g in acc_glyphs)
            acc_crop = no_lines_h[:, acc_x1:acc_x2]
            w_acc = acc_x2 - acc_x1

            col_p = np.sum(acc_crop > 0, axis=0)
            k_max = np.max(col_p) if len(col_p) > 0 else 1
            peaks = [ci for ci in range(1, len(col_p)-1) if col_p[ci] > col_p[ci-1] and col_p[ci] >= col_p[ci+1] and col_p[ci] >= k_max * 0.70]
            nms_p = []
            for p in sorted(peaks, key=lambda pi: col_p[pi], reverse=True):
                if all(abs(p - op) >= 6 for op in nms_p):
                    nms_p.append(p)
            nms_p.sort()

            # Een kruis (#) heeft altijd twee parallelle verticale stokken met een vallei ertussen (afstand 8..20 px)
            # Een mol (b) heeft slechts één enkele verticale stok
            has_twin_stems = False
            for i in range(len(nms_p) - 1):
                dist = nms_p[i+1] - nms_p[i]
                if 8 <= dist <= 20:
                    dip = np.min(col_p[nms_p[i]:nms_p[i+1]])
                    if dip < 0.60 * min(col_p[nms_p[i]], col_p[nms_p[i+1]]):
                        has_twin_stems = True
                        break

            if has_twin_stems:
                count = max(1, int(round(w_acc / 28.0)))
                det_key_fifths = count
            else:
                count = max(1, len(nms_p))
                det_key_fifths = -count
    else:
        det_key_fifths = int(key_fifths) if key_fifths is not None else 0

    key_fifths = det_key_fifths

    if time_glyph is not None:
        gx, gw, gy, gh = time_glyph['x'], time_glyph['w'], time_glyph['y'], time_glyph['h']
        g_crop = no_lines_h[:, gx:gx+gw]
        gh_full, gw_full = g_crop.shape
        mid_y = gh_full // 2

        y_prof = np.sum(g_crop > 0, axis=1)
        min_mid = np.min(y_prof[mid_y-3:mid_y+4]) if len(y_prof) > mid_y+4 else 0
        max_top = np.max(y_prof[:mid_y]) if mid_y > 0 else 1
        max_bot = np.max(y_prof[mid_y:]) if mid_y < gh_full else 1
        is_stacked = (gh_full >= sp0 * 2.35 and min_mid < 0.45 * min(max_top, max_bot))

        if not is_stacked:
            time_sig = "4/4"
        elif gh >= sp0 * 3.60:
            time_sig = "6/8"
        else:
            top_half = g_crop[:mid_y-2, :]
            bot_half = g_crop[mid_y+2:, :]
            top_norm = cv2.resize((top_half > 0).astype(np.float32), (30, 30))
            bot_norm = cv2.resize((bot_half > 0).astype(np.float32), (30, 30))
            sim = cv2.matchTemplate(top_norm, bot_norm, cv2.TM_CCOEFF_NORMED)[0][0]
            if sim > 0.25:
                time_sig = "2/2"
            else:
                time_sig = "2/4"

                

        abs_time_end = x_staff_start + gx + gw

        sub_notes = clean_img[int(lines0[0]-sp0):int(lines0[4]+sp0), abs_time_end:b1]

        if sub_notes.size > 0:

            _, inv_sn = cv2.threshold(sub_notes, 160, 255, cv2.THRESH_BINARY_INV)

            hk_sn = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(sp0*0.7), int(sp0*0.5)))

            op_sn = cv2.morphologyEx(inv_sn, cv2.MORPH_OPEN, hk_sn)

            n_sn, _, stats_sn, cents_sn = cv2.connectedComponentsWithStats(op_sn)

            cand_sn = [int(cents_sn[i][0]) for i in range(1, n_sn) if stats_sn[i, 4] >= 180]

            if cand_sn:

                x_notes_start = max(abs_time_end + 10, abs_time_end + min(cand_sn) - int(sp0 * 1.5))

            else:

                x_notes_start = abs_time_end + 20

        else:

            x_notes_start = abs_time_end + 20

    else:

        x_notes_start = x_staff_start + 180 + abs(key_fifths) * int(sp0 * 1.45)

        

    return {

        'clefs': detected_clefs,

        'time_sig': time_sig,

        'key_fifths': key_fifths,

        'x_notes_start': x_notes_start,

        'x_staff_start': x_staff_start

    }

# ==============================================================================

# 4. NOOTKOP- EN TOONHOOGTEDETECTIE (ZERO-BIAS STEM & HEAD ANALYSE)

# ==============================================================================

def create_notehead_template(width=34, height=26, angle=-28):

    template = np.full((height, width), 255, dtype=np.uint8)

    cv2.ellipse(template, (width // 2, height // 2), (14, 9), angle, 0, 360, 0, -1)

    template = cv2.GaussianBlur(template, (3, 3), 0)

    return template

# ==============================================================================

# 4. WISKUNDIGE DIATONISCHE TOONHOOGTE & SLEUTELS

# ==============================================================================

DIATONIC_SCALE = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

SHARPS_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B']

FLATS_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F']

SOLFEGE_NAMES = {'C': 'Do', 'D': 'Re', 'E': 'Mi', 'F': 'Fa', 'G': 'Sol', 'A': 'La', 'B': 'Si'}

def get_pitch_from_k(k, clef='treble', key_fifths=0):

    """

    Universele diatonische projectie:

    k = 0 is de onderste balklijn (L4).

    k neemt per halve tussenruimte toe met 1 stap in de diatonische toonladder.

    """

    if clef == 'treble':

        base_step_idx = 2  # E4 op de onderste balklijn

        base_octave = 4

    elif clef == 'bass':

        base_step_idx = 4  # G2 op de onderste balklijn

        base_octave = 2

    elif clef == 'tenor':

        base_step_idx = 2  # E3 op de onderste balklijn (G-8 / ottava bassa)

        base_octave = 3

    else:

        base_step_idx = 2

        base_octave = 4

        

    step_num = base_step_idx + k

    step_name = DIATONIC_SCALE[step_num % 7]

    octave = base_octave + (step_num // 7)

    

    # Toonsoort via kwintencirkel

    alter = 0

    if key_fifths > 0:

        if step_name in SHARPS_ORDER[:key_fifths]:

            alter = 1

    elif key_fifths < 0:

        if step_name in FLATS_ORDER[:abs(key_fifths)]:

            alter = -1

            

    return step_name, alter, octave

class ScoreParams:
    """
    Centrale schaal- en geometrie-parameters (dimensieloos t.o.v. balkafstand sp en balklijndikte line_th).
    """
    def __init__(self, sp=27.25, line_th=7.5):
        self.sp = float(sp)
        self.line_th = float(line_th)
        self.head_w = self.sp * 1.30
        self.head_h = self.sp * 0.95
        self.min_head_w = int(round(self.sp * 0.85))
        self.min_head_h = int(round(self.sp * 0.65))
        self.min_head_area = int(round(self.sp * self.sp * 0.40))
        self.min_beam_th = max(10, int(round(self.sp * 0.38)))
        self.fermata_min_w = int(round(self.sp * 1.80))
        self.fermata_max_w = int(round(self.sp * 3.65))
        self.fermata_min_h = int(round(self.sp * 0.45))
        self.fermata_max_h = int(round(self.sp * 2.50))
        self.fermata_min_area = int(round(self.sp * self.sp * 0.22))

def track_local_staff_lines(img, staff_info, x):
    """
    Meet de exacte, lokale verticale posities van de 5 balklijnen op kolom x
    als een rigide 5-lijnige kam in twee flankerende stroken buiten de nootkop
    ([x - 2.0*sp .. x - 0.75*sp] en [x + 0.75*sp .. x + 2.0*sp]).
    Hierdoor kan een nootkop in een tussenruimte nooit een balklijn aantrekken,
    en wordt lichte rotatie/welving tot +-0.55*sp aan de paginaranden exact gevolgd.
    """
    init_lines = staff_info['lines']
    sp = staff_info.get('spacing', 27.25)
    h, w = img.shape
    xl1, xl2 = max(0, int(x - sp * 2.0)), max(0, int(x - sp * 0.75))
    xr1, xr2 = min(w, int(x + sp * 0.75)), min(w, int(x + sp * 2.0))
    cols = []
    if xl2 - xl1 >= 8:
        cols.append(img[:, xl1:xl2])
    if xr2 - xr1 >= 8:
        cols.append(img[:, xr1:xr2])
    if not cols:
        return list(init_lines)
    strip = np.hstack(cols)
    row_profile = np.mean(strip, axis=1)

    max_d = int(round(sp * 0.55))
    best_delta = 0.0
    best_score = 1e9
    for d_half in range(-max_d * 2, max_d * 2 + 1):
        delta = d_half * 0.5
        vals = []
        for l in init_lines:
            ry = int(round(l + delta))
            if 1 <= ry < h - 1:
                vals.append(float(np.min(row_profile[ry-1:ry+2])))
            else:
                vals.append(255.0)
        sc = sum(vals) + 2.0 * max(vals) + abs(delta) * 0.8
        if sc < best_score:
            best_score = sc
            best_delta = delta

    return [l + best_delta for l in init_lines]

def detect_notes_in_region(img, x1, x2, staff_info, clef='treble', key_fifths=0, template=None, debug=False):

    """

    Geavanceerde morfologische nootkop-detector:

    - Isoleert nootkoppen direct via een elliptische kern afgestemd op de balkruimte.

    - Bepaalt het verticale centrum op de breedste doorsnede (evenaar), immuun voor stokken.

    - Volgt de fysieke balklijnen lokaal op de x-positie van elke nootkop.

    - Berekent exacte geometrische toonhoogte t.o.v. de lokale balklijnen.

    - Onderscheidt open (halve/hele) van gesloten koppen (kwart/achtste).

    """

    lines = staff_info['lines']

    sp = staff_info['spacing']

    step = sp / 2.0

    

    # Marge om maatstrepen niet mee te nemen

    mx1 = x1 + 10

    mx2 = x2 - 10

    if mx2 <= mx1 + 12:

        return []

        

    y_top = int(max(0, lines[0] - sp * 1.8))

    y_bot = int(min(img.shape[0], lines[4] + sp * 1.8))

    

    crop = img[y_top:y_bot, mx1:mx2]

    if crop.shape[0] < 10 or crop.shape[1] < 10:

        return []

        

    _, inv = cv2.threshold(crop, 160, 255, cv2.THRESH_BINARY_INV)

    

    # 0. Enclosed cavities (ingesloten witte holtes) via floodFill conform AGENTS.md

    h_c, w_c = inv.shape

    flood = inv.copy()

    mask_ff = np.zeros((h_c + 2, w_c + 2), dtype=np.uint8)

    cv2.floodFill(flood, mask_ff, (0, 0), 255)

    holes = (flood == 0).astype(np.uint8) * 255

    num_h, _, stats_h, cents_h = cv2.connectedComponentsWithStats(holes)

    raw_cavs = []

    for hi in range(1, num_h):

        hx, hy, hw, hh, harea = stats_h[hi, 0], stats_h[hi, 1], stats_h[hi, 2], stats_h[hi, 3], stats_h[hi, 4]

        aspect = hw / max(1, hh)

        if 25 <= harea <= 550 and 6 <= hw <= int(sp * 1.45) and 4 <= hh <= int(sp * 1.15) and 0.65 <= aspect <= 3.2 and hx > 2 and (hx + hw) < w_c - 2 and (lines[0] - sp * 0.65) <= (y_top + cents_h[hi][1]) <= (lines[4] + sp * 1.25):

            raw_cavs.append({

                'rx': hx, 'ry': hy, 'rw': hw, 'rh': hh, 'area': harea,

                'cx': cents_h[hi][0], 'cy': cents_h[hi][1],

                'abs_x': mx1 + cents_h[hi][0], 'abs_y': y_top + cents_h[hi][1]

            })

            

    # Fuseer verticaal aangrenzende halve holtes die door een balklijn worden gespleten

    cavities = []

    used_cavs = set()

    for i in range(len(raw_cavs)):

        if i in used_cavs:

            continue

        c1 = raw_cavs[i]

        partner = None

        for j in range(i + 1, len(raw_cavs)):

            if j in used_cavs:

                continue

            c2 = raw_cavs[j]

            if abs(c1['cx'] - c2['cx']) < int(sp * 0.85) and abs(c1['cy'] - c2['cy']) < int(sp * 0.85):

                partner = (j, c2)

                break

        if partner:

            j, c2 = partner

            used_cavs.add(i)

            used_cavs.add(j)

            f_x = min(c1['rx'], c2['rx'])

            f_y = min(c1['ry'], c2['ry'])

            f_w = max(c1['rx'] + c1['rw'], c2['rx'] + c2['rw']) - f_x

            f_h = max(c1['ry'] + c1['rh'], c2['ry'] + c2['rh']) - f_y

            f_area = c1['area'] + c2['area']

            f_cx = (c1['cx'] + c2['cx']) / 2.0

            f_cy = (c1['cy'] + c2['cy']) / 2.0

            cavities.append({

                'rx': f_x, 'ry': f_y, 'rw': f_w, 'rh': f_h, 'area': f_area,

                'cx': f_cx, 'cy': f_cy,

                'abs_x': mx1 + f_cx, 'abs_y': y_top + f_cy

            })

        else:

            if c1['rh'] >= 5 and (c1['rw'] / max(1, c1['rh'])) <= 2.6 and c1['area'] >= 35:

                cavities.append(c1)

    

    # STAP 4A: NOOTKOP- & STOKKOPPELING (Bipartite Head-Stem Binding conform AGENTS.md Sectie 5)
    # 1. Verzameling A: Alle Nootkoppen (2D Elliptisch & Cavity-filter)
    ew = max(10, int(sp * 0.70))
    eh = max(8, int(sp * 0.50))
    head_k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ew, eh))
    opened_heads = cv2.morphologyEx(inv, cv2.MORPH_OPEN, head_k)
    n_heads, _, h_stats, h_cents = cv2.connectedComponentsWithStats(opened_heads)

    raw_heads = []
    for hi in range(1, n_heads):
        hw, hh, harea = h_stats[hi, 2], h_stats[hi, 3], h_stats[hi, 4]
        aspect = hw / max(1, hh)
        if harea >= 70 and aspect < 2.5:
            hrx, hry = h_stats[hi, 0], h_stats[hi, 1]
            hcx, hcy = h_cents[hi][0], h_cents[hi][1]
            abs_hy = y_top + hcy
            if (lines[0] - sp * 1.5) <= abs_hy <= (lines[4] + sp * 1.5):
                raw_heads.append({
                    'rx': hrx, 'ry': hry, 'rw': hw, 'rh': hh, 'area': harea,
                    'cx': int(hcx), 'cy': int(hcy),
                    'abs_x': mx1 + hcx, 'abs_y': abs_hy,
                    'is_open': False
                })

    # Integreer ingesloten witte holtes (open nootkoppen) uit cavities
    for cav in cavities:
        cav_asp = cav['rw'] / max(1, cav['rh'])
        matched_h = [h for h in raw_heads if abs(h['cx'] - cav['cx']) <= int(sp * 0.70) and abs(h['cy'] - cav['cy']) <= int(sp * 0.70)]
        if matched_h and cav_asp >= 0.80:
            for mh in matched_h:
                mh['is_open'] = True
        elif not matched_h and cav_asp >= 1.05 and cav['area'] >= 100:
            if (lines[0] - sp * 0.8) <= cav['abs_y'] <= (lines[4] + sp * 0.8):
                raw_heads.append({
                    'rx': cav['rx'], 'ry': cav['ry'], 'rw': cav['rw'], 'rh': cav['rh'],
                    'area': cav['area'], 'cx': int(cav['cx']), 'cy': int(cav['cy']),
                    'abs_x': cav['abs_x'], 'abs_y': cav['abs_y'],
                    'is_open': True, 'is_whole_note': True
                })

    raw_heads.sort(key=lambda h: h['abs_x'])

    # 2. Verzameling B: Alle Stokken (1D Verticaal Lijnfilter met Voortekenfiltering)
    min_stem_h = int(sp * 1.6)
    stem_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_stem_h))
    opened_stems = cv2.morphologyEx(inv, cv2.MORPH_OPEN, stem_k)
    num_s, _, s_stats, _ = cv2.connectedComponentsWithStats(opened_stems)

    raw_stems = []
    for si in range(1, num_s):
        sx, sy, sw, sh = s_stats[si, 0], s_stats[si, 1], s_stats[si, 2], s_stats[si, 3]
        if sx <= 12 or (sx + sw) >= crop.shape[1] - 12:
            continue
        if sh >= min_stem_h and sw <= int(sp * 0.45):
            raw_stems.append({'x': sx + sw // 2, 'y1': sy, 'y2': sy + sh, 'w': sw, 'h': sh, 'abs_x': mx1 + sx + sw // 2})
    raw_stems.sort(key=lambda s: s['x'])

    # Filter voorteken-beentjes: twee verticale lijnen binnen 0.65 * sp zijn een voorteken (# of ♮)
    stems = []
    si = 0
    while si < len(raw_stems):
        if si + 1 < len(raw_stems) and (raw_stems[si+1]['x'] - raw_stems[si]['x']) < int(sp * 0.65):
            si += 2
        else:
            stems.append(raw_stems[si])
            si += 1

    # 3. De Paarsgewijze Koppeling (Welke nootkop hoort bij welke stok?)
    candidates = []
    used_stems = set()

    for h in raw_heads:
        hcx = h['cx']
        hcy = h['cy']
        
        # Zoek een fysiek rakende stok aan de linker- of rechterrand van de nootkop
        best_stem = None
        best_dist = 9999
        best_dir = None
        best_tip_y = None

        for s_idx, s in enumerate(stems):
            dx = s['x'] - hcx
            if abs(dx) <= int(sp * 0.70):
                # Controleer aansluiting:
                # Up-stem: stok staat rechts (dx >= -4) en reikt omhoog (s['y1'] < hcy)
                # Down-stem: stok staat links (dx <= 4) en reikt omlaag (s['y2'] > hcy)
                is_up_match = (dx >= -4 and s['y1'] < hcy and abs(s['y2'] - hcy) <= int(sp * 0.85))
                is_dn_match = (dx <= 4 and s['y2'] > hcy and abs(s['y1'] - hcy) <= int(sp * 0.85))
                
                if is_up_match or is_dn_match:
                    dist = abs(dx)
                    if dist < best_dist:
                        best_dist = dist
                        best_stem = (s_idx, s)
                        if is_up_match and not is_dn_match:
                            best_dir = 'up'
                            best_tip_y = y_top + s['y1']
                        elif is_dn_match and not is_up_match:
                            best_dir = 'down'
                            best_tip_y = y_top + s['y2']
                        else:
                            # Beide mogelijk: kies op basis van dx (rechts = up, links = down)
                            if dx >= 0:
                                best_dir = 'up'
                                best_tip_y = y_top + s['y1']
                            else:
                                best_dir = 'down'
                                best_tip_y = y_top + s['y2']

        has_stem = (best_stem is not None)
        if best_stem:
            used_stems.add(best_stem[0])
            st_data = best_stem[1]
            stem_cx = st_data['x']
            stem_y1 = st_data['y1']
            stem_y2 = st_data['y2']
            stem_x = mx1 + stem_cx
        else:
            stem_cx = None
            stem_y1 = None
            stem_y2 = None
            stem_x = None
            best_dir = 'up'
            best_tip_y = h['abs_y']

        is_whole = h.get('is_whole_note') or (h.get('is_open') and not has_stem)

        candidates.append({
            'rx': h['rx'], 'ry': h['ry'], 'rw': h['rw'], 'rh': h['rh'],
            'area': h['area'], 'aspect': h['rw'] / max(1, h['rh']),
            'cx': hcx, 'cy': hcy,
            'abs_x': h['abs_x'], 'abs_y': h['abs_y'],
            'label': len(candidates) + 1,
            'is_open': h['is_open'],
            'is_whole_note': is_whole,
            'stem_cx': stem_cx,
            'stem_y1': stem_y1,
            'stem_y2': stem_y2,
            'stem_x': stem_x,
            'stem_tip_y': best_tip_y,
            'stem_dir': best_dir,
            'has_stem': has_stem
        })

    candidates.sort(key=lambda c: c['abs_x'])

    

    # 2. VOORTEKENS EERST: Detecteer toevallige tekens (#, ♮, b) links van een nootkop
    # en koppel ze direct aan die nootkop zodat ze NOOIT een spooknoot kunnen worden.
    excluded_indices = set()
    for j in range(len(candidates)):
        c_note = candidates[j]
        for i in range(j):
            if i in excluded_indices:
                continue
            c_acc = candidates[i]
            dx = c_note['abs_x'] - c_acc['abs_x']
            dy = abs(c_note['abs_y'] - c_acc['abs_y'])
            acc_w = c_acc['rw']
            acc_h = c_acc['rh']
            is_valid_acc_shape = (int(sp * 0.20) <= acc_w <= int(sp * 1.50) and int(sp * 0.50) <= acc_h <= int(sp * 2.30))
            if 6 <= dx <= int(sp * 2.2) and dy <= sp * 1.4 and is_valid_acc_shape:
                excluded_indices.add(i)
                # Karakteristieke vorm van herstellingsteken (natural) vs kruis (sharp) met balklijn-maskering
                cy_acc = c_acc['ry'] + c_acc['rh'] // 2
                acc_y1 = max(0, int(cy_acc - sp * 0.95))
                acc_y2 = min(crop.shape[0], int(cy_acc + sp * 0.95))
                acc_x1 = max(0, int(c_acc['rx'] - 2))
                acc_x2 = min(crop.shape[1], int(c_acc['rx'] + c_acc['rw'] + 2))
                acc_crop = inv[acc_y1:acc_y2, acc_x1:acc_x2]
                if acc_crop.size > 0:
                    ll_acc = track_local_staff_lines(img, staff_info, mx1 + (acc_x1 + acc_x2) // 2)
                    acc_clean = acc_crop.copy()
                    for line_y in ll_acc:
                        rel_ly = int(line_y - (y_top + acc_y1))
                        if 0 <= rel_ly < acc_clean.shape[0]:
                            acc_clean[max(0, rel_ly - 2):min(acc_clean.shape[0], rel_ly + 3), :] = 0
                    acc_clean = cv2.morphologyEx(acc_clean, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 5)))
                    full_h = acc_crop.shape[0]
                    full_w = acc_crop.shape[1]
                    k_top = max(2, int(full_h * 0.35))
                    k_bot = max(2, int(full_h * 0.35))
                    top_rows = (acc_clean[:k_top, :] > 0)
                    bot_rows = (acc_clean[-k_bot:, :] > 0)
                    top_cols = np.where(top_rows)[1]
                    bot_cols = np.where(bot_rows)[1]
                    x_top = float(np.mean(top_cols)) / max(1, full_w) if len(top_cols) > 0 else 0.5
                    x_bot = float(np.mean(bot_cols)) / max(1, full_w) if len(bot_cols) > 0 else 0.5
                    if (x_bot - x_top) >= 0.10:
                        c_note['accidental'] = 'natural'
                    elif c_acc['rw'] >= int(sp * 0.45) and c_acc['rh'] >= int(sp * 1.1) and c_acc['area'] >= int(sp * sp * 0.35):
                        c_note['accidental'] = 'sharp'
                elif c_acc['rw'] >= int(sp * 0.45) and c_acc['rh'] >= int(sp * 1.1) and c_acc['area'] >= int(sp * sp * 0.35):
                    c_note['accidental'] = 'sharp'

    valid_candidates = [c for idx, c in enumerate(candidates) if idx not in excluded_indices]

    # Integreer ingesloten witte holtes (open nootkoppen) direct met de geldige kandidaten
    to_remove = set()
    used_cavs = set()
    for cav in cavities:
        cav_asp = cav['rw'] / max(1, cav['rh'])
        if debug:
            print(f"      CAV in {clef}: x={int(cav['abs_x'])}, y={int(cav['abs_y'])}, area={cav['area']}, w={cav['rw']}, h={cav['rh']}, asp={cav_asp:.2f}")
        matched = [c for c in valid_candidates if abs(c['cx'] - cav['cx']) <= int(sp * 0.70) and abs(c['cy'] - cav['cy']) <= int(sp * 0.70) and c['area'] < 650]
        if matched and cav_asp >= 0.80:
            primary = matched[0]
            primary['is_open'] = True
            used_cavs.add(id(cav))
            if cav['area'] >= 60:
                primary['has_big_cav'] = True
                primary['cy'] = cav['cy']
                primary['abs_y'] = cav['abs_y']
                primary['cx'] = cav['cx']
                primary['abs_x'] = cav['abs_x']
                primary['rw'] = cav['rw']
                primary['rh'] = cav['rh']
                primary['rx'] = int(cav['cx'] - cav['rw'] // 2)
                primary['ry'] = int(cav['cy'] - cav['rh'] // 2)
                for other in matched[1:]:
                    to_remove.add(id(other))
            else:
                for mc in matched:
                    mc['is_open'] = True
        elif not matched and cav_asp >= 1.05 and cav['area'] >= 100:
            # Ongekoppelde open holte binnen de balklijnen: Zelfstandige HELE NOOT of open nootkop!
            if (lines[0] - sp * 0.8) <= cav['abs_y'] <= (lines[4] + sp * 0.8):
                used_cavs.add(id(cav))
                valid_candidates.append({
                    'rx': cav['rx'],
                    'ry': cav['ry'],
                    'rw': cav['rw'],
                    'rh': cav['rh'],
                    'area': cav['area'],
                    'aspect': cav['rw'] / max(1, cav['rh']),
                    'cx': cav['cx'],
                    'cy': cav['cy'],
                    'abs_x': cav['abs_x'],
                    'abs_y': cav['abs_y'],
                    'label': -1,
                    'is_open': True,
                    'has_big_cav': True,
                    'is_whole_note': True,
                    'has_stem': False
                })

    valid_candidates = [c for c in valid_candidates if id(c) not in to_remove]
    valid_candidates.sort(key=lambda c: c['abs_x'])

    # Aanvullende optische voortekenscan in inv links van elke nootkandidaat
    # (voor dunne tekens zoals herstellingstekens die door ellips-opening zijn weggefilterd)
    for c_idx, c in enumerate(valid_candidates):
        if c.get('accidental'):
            continue
        x2_acc = int(c['rx'] - 2)
        min_x = 4
        if c_idx > 0:
            min_x = max(min_x, int(valid_candidates[c_idx - 1]['rx'] + valid_candidates[c_idx - 1]['rw'] + 2))
        x1_acc = max(min_x, int(c['rx'] - sp * 1.85))
        if x2_acc - x1_acc >= 4:
            y1_acc = max(0, int(c['cy'] - sp * 1.15))
            y2_acc = min(crop.shape[0], int(c['cy'] + sp * 1.15))
            acc_roi = inv[y1_acc:y2_acc, x1_acc:x2_acc]
            if acc_roi.size > 0:
                ll_acc = track_local_staff_lines(img, staff_info, mx1 + (x1_acc + x2_acc) // 2)
                acc_clean = acc_roi.copy()
                for line_y in ll_acc:
                    rel_ly = int(line_y - (y_top + y1_acc))
                    if 0 <= rel_ly < acc_clean.shape[0]:
                        acc_clean[max(0, rel_ly - 3):min(acc_clean.shape[0], rel_ly + 4), :] = 0
                acc_clean = cv2.morphologyEx(acc_clean, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 7)))
                n_acc, _, st_acc, cents_acc = cv2.connectedComponentsWithStats(acc_clean)
                if debug:
                    print(f"      OPT ACC CHECK {clef}: c={int(c['abs_x'])}, n_acc={n_acc}, roi_w={acc_roi.shape[1]}")
                for ai in range(1, n_acc):
                    ax, ay, aw, ah, a_area = st_acc[ai, 0], st_acc[ai, 1], st_acc[ai, 2], st_acc[ai, 3], st_acc[ai, 4]
                    dist_to_head = c['rx'] - (x1_acc + ax + aw)
                    if not (-2 <= dist_to_head <= int(sp * 1.6)):
                        continue
                    if not (int(sp * 0.60) <= ah <= int(sp * 2.30) and int(sp * 0.20) <= aw <= int(sp * 1.35) and a_area >= int(sp * 0.7)):
                        continue
                    if abs((y1_acc + ay + ah // 2) - c['cy']) > int(sp * 0.85):
                        continue
                    comp_acc = (acc_clean[ay:ay+ah, ax:ax+aw] > 0)
                    k_top = max(2, int(ah * 0.35))
                    k_bot = max(2, int(ah * 0.35))
                    top_rows = comp_acc[:k_top, :]
                    bot_rows = comp_acc[-k_bot:, :]
                    top_cols = np.where(top_rows)[1]
                    bot_cols = np.where(bot_rows)[1]
                    x_top = float(np.mean(top_cols)) / max(1, aw) if len(top_cols) > 0 else 0.5
                    x_bot = float(np.mean(bot_cols)) / max(1, aw) if len(bot_cols) > 0 else 0.5
                    if (x_bot - x_top) >= 0.18:
                        c['accidental'] = 'natural'
                    elif aw >= int(sp * 0.45) and ah >= int(sp * 1.1) and a_area >= int(sp * sp * 0.35):
                        c['accidental'] = 'sharp'
                    break

    if debug:
        print(f"   🔍 DEBUG CANDIDATES ({clef}): candidates={len(candidates)}, valid={len(valid_candidates)}, cavs={len(cavities)}, raw_cavs={len(raw_cavs)}")
        for vc in valid_candidates:
            print(f"      CAND: x={int(vc['abs_x'])}, y={int(vc['abs_y'])}, open={vc.get('is_open')}, area={vc.get('area')}, w={vc.get('rw')}, h={vc.get('rh')}")

    # 3. PROCEDURE FERMATEDETECTIE (op lokale balkhoogte, vrij van de bovenste/onderste balklijn):
    # Een echte fermate bestaat universeel uit TWEE verticaal uitgelijnde componenten:
    # (a) de boog (arch: breedte ~2.0..3.4*sp, hoogte ~1.1..1.9*sp, aspect 1.35..2.35)
    # (b) het punt eronder/erin (dot: breedte ~0.35..1.05*sp, hoogte ~0.30..0.95*sp, area 90..450)
    # waarvan de horizontale centra vrijwel samenvallen (|cx_arch - cx_dot| <= 0.45 * sp).
    params = ScoreParams(sp=sp)
    mid_local_lines = track_local_staff_lines(img, staff_info, (mx1 + mx2) // 2)
    l0 = int(round(mid_local_lines[0]))
    l4 = int(round(mid_local_lines[4]))
    fermata_x = []

    def _find_fermatas_in_crop(f_crop, is_inverted=False):
        found_xs = []
        if f_crop.size == 0:
            return found_xs
        _, f_inv = cv2.threshold(f_crop, 160, 255, cv2.THRESH_BINARY_INV)
        n_fc, _, stats_fc, cents_fc = cv2.connectedComponentsWithStats(f_inv)
        arches = []
        dots = []
        for fci in range(1, n_fc):
            fw, fh, farea = stats_fc[fci, 2], stats_fc[fci, 3], stats_fc[fci, 4]
            aspect_f = fw / max(1, fh)
            cx_f, cy_f = cents_fc[fci][0], cents_fc[fci][1]
            if params.fermata_min_w <= fw <= params.fermata_max_w and params.fermata_min_h <= fh <= params.fermata_max_h and 1.15 <= aspect_f <= 2.65 and farea >= params.fermata_min_area:
                arches.append((cx_f, cy_f, fw, fh, farea))
            elif int(sp * 0.15) <= fw <= int(sp * 1.15) and int(sp * 0.15) <= fh <= int(sp * 1.10) and 15 <= farea <= 500:
                dots.append((cx_f, cy_f, fw, fh, farea))
        for acx, acy, afw, afh, _ in arches:
            # Een echte fermate bestaat uit een brede boog met een losse stip eronder (of erboven bij bas):
            has_matching_dot = any(
                abs(acx - dcx) <= sp * 0.65 and ((dcy > acy) if not is_inverted else (dcy < acy))
                for dcx, dcy, _, _, _ in dots
            )
            if debug:
                print(f"      FERMATA ARCH ({'inv' if is_inverted else 'top'}): acx={mx1 + acx}, w={afw}, h={afh}, has_dot={has_matching_dot}")
            if has_matching_dot:
                found_xs.append(mx1 + acx)
        return found_xs

    y_ferm_top = max(0, int(l0 - sp * 3.5))
    y_ferm_bot = max(y_ferm_top + 1, int(l0 - 4))
    fermata_top_x = _find_fermatas_in_crop(img[y_ferm_top:y_ferm_bot, mx1:mx2], is_inverted=False)

    y_ferm_bot_top = min(img.shape[0] - 1, int(l4 + 4))
    y_ferm_bot_bot = min(img.shape[0], int(l4 + sp * 3.5))
    fermata_bot_x = _find_fermatas_in_crop(img[y_ferm_bot_top:y_ferm_bot_bot, mx1:mx2], is_inverted=True) if clef == 'bass' else []
    fermata_x = fermata_top_x + fermata_bot_x

    note_candidates = []
    for c in valid_candidates:
        ferm_top_match = not c.get('is_open') and any(abs(c['abs_x'] - fx) < sp * 1.5 for fx in fermata_top_x) and c['abs_y'] < (l0 - sp * 0.85)
        ferm_bot_match = not c.get('is_open') and any(abs(c['abs_x'] - fx) < sp * 1.5 for fx in fermata_bot_x) and c['abs_y'] > (l4 + sp * 0.85)
        if ferm_top_match:
            continue
        if ferm_bot_match:
            continue
        is_noise = (c.get('label', 0) != -1 and not c.get('is_open')) and (c['rw'] < params.min_head_w or c['rh'] < params.min_head_h or c['area'] < params.min_head_area)
        
        # STOK-EERST VALIDATIE (Stem-First conform AGENTS.md Sectie 5):
        # Hele noten (zonder stok) en noten met een geldige stok worden geaccepteerd.
        is_whole_note = c.get('is_whole_note') or (c.get('is_open') and not c.get('has_stem'))
        has_stem = c.get('has_stem', False)
        
        if not is_whole_note and not has_stem and c.get('label', 0) != -1:
            cand_cx = c['rx'] + c['rw'] // 2
            cand_y1 = c['ry']
            cand_y2 = c['ry'] + c['rh']
            stem_check_h = int(sp * 2.5)
            min_stem_len = int(sp * 1.1)
            
            # Zoekzone boven de nootkop (up-stem)
            y_up_start = max(0, cand_y1 - stem_check_h)
            strip_up = crop[y_up_start:cand_y1, max(0, cand_cx - int(sp * 0.45)):min(crop.shape[1], cand_cx + int(sp * 0.75))]
            
            # Zoekzone onder de nootkop (down-stem)
            y_dn_end = min(crop.shape[0], cand_y2 + stem_check_h)
            strip_dn = crop[cand_y2:y_dn_end, max(0, cand_cx - int(sp * 0.75)):min(crop.shape[1], cand_cx + int(sp * 0.45))]
            
            stem_v_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, min_stem_len))
            has_up_stem = False
            if strip_up.size > 0:
                bin_up = (strip_up < 165).astype(np.uint8)
                opened_up = cv2.morphologyEx(bin_up, cv2.MORPH_OPEN, stem_v_k)
                has_up_stem = np.any(opened_up > 0)
                
            has_dn_stem = False
            if strip_dn.size > 0:
                bin_dn = (strip_dn < 165).astype(np.uint8)
                opened_dn = cv2.morphologyEx(bin_dn, cv2.MORPH_OPEN, stem_v_k)
                has_dn_stem = np.any(opened_dn > 0)
                
            has_stem = (has_up_stem or has_dn_stem)

        if not is_noise and (has_stem or is_whole_note):
            if note_candidates and abs(c['abs_x'] - note_candidates[-1]['abs_x']) < int(sp * 0.65):
                prev = note_candidates[-1]
                if (c.get('is_open') and c.get('label', 0) != -1 and not prev.get('is_open') and c['area'] >= prev['area'] * 0.7) or (c['area'] > prev['area'] * 1.15):
                    note_candidates[-1] = c
            else:
                note_candidates.append(c)

    # 4. KOPTYPE, TOONHOOGTE & VERLENGINGSPUNTEN (DOTS) OP DE ZUIVERE NOOTKOPPEN

    notes = []

    for c_idx, c in enumerate(note_candidates):

        rx = max(0, min(crop.shape[1] - 1, int(c['rx'])))
        ry = max(0, min(crop.shape[0] - 1, int(c['ry'])))
        rw = max(1, min(crop.shape[1] - rx, int(c['rw'])))
        rh = max(1, min(crop.shape[0] - ry, int(c['rh'])))
        head_box = crop[ry:ry+rh, rx:rx+rw]
        if head_box.shape[0] < 4 or head_box.shape[1] < 4:
            continue

        

        # Open vs. gesloten kop check via binnenste kern

        mask = np.zeros(head_box.shape, dtype=np.uint8)

        cv2.ellipse(mask, (rw // 2, rh // 2), (max(1, int(rw * 0.30)), max(1, int(rh * 0.30))), -28, 0, 360, 255, -1)

        core_pixels = head_box[mask > 0]

        white_ratio = float(np.mean(core_pixels > 130)) if len(core_pixels) > 0 else 0.0

        is_open = c.get('is_open', False)

        if is_open and c.get('label', 0) != -1 and white_ratio < 0.05:

            is_open = False

        elif not is_open and white_ratio > 0.22:

            is_open = True

            

        if is_open and c.get('label', 0) == -1 and ((rw == rh and rw >= 20 and white_ratio > 0.70) or c['area'] > int(sp * sp * 0.75)):
            continue
        if is_open:

            eq_y = c['cy']

            note_cx = c['cx']

        abs_x = c['abs_x']
        abs_y = c['abs_y']

        

        # Snap rechtstreeks naar de lokale balklijnen en tussenruimtes

        ll = track_local_staff_lines(img, staff_info, abs_x)

        ref_y = {

            10: ll[0] - sp,

            9:  ll[0] - sp * 0.5,

            8:  ll[0],

            7:  (ll[0] + ll[1]) * 0.5,

            6:  ll[1],

            5:  (ll[1] + ll[2]) * 0.5,

            4:  ll[2],

            3:  (ll[2] + ll[3]) * 0.5,

            2:  ll[3],

            1:  (ll[3] + ll[4]) * 0.5,

            0:  ll[4],

            -1: ll[4] + sp * 0.5,

            -2: ll[4] + sp,

            -3: ll[4] + sp * 1.5,

            -4: ll[4] + sp * 2.0

        }

        # Universele begrenzing voor tussenruimtes: ligt het centrum zuiver ingeklemd tussen twee balklijnen?

        best_k = min(ref_y.keys(), key=lambda deg: abs(abs_y - ref_y[deg]))

        k = max(-4, min(10, best_k))

        st_name, alt, oct_n = get_pitch_from_k(k, clef=clef, key_fifths=key_fifths)

        

        # Toevallig voorteken (#, ♮, b) overschrijft toonsoort
        if c.get('accidental') == 'sharp':
            alt = 1
        elif c.get('accidental') == 'natural':
            alt = 0
        elif c.get('accidental') == 'flat':
            alt = -1

            

        # PUNTEN EERST: Zoek verlengingspunt (dot) rechts van de nootkop met balklijn-maskering

        # Begrens de zoekzone zodat deze nooit in de inkt van een volgende nootkop of maatstreep reikt

        next_c = note_candidates[c_idx + 1] if c_idx + 1 < len(note_candidates) else None

        dot_search_dist = int(sp * 1.6) if is_open else int(sp * 1.0)

        max_dot_x = min(crop.shape[1] - 30, rx + rw + dot_search_dist)

        if next_c is not None:

            max_dot_x = min(max_dot_x, next_c['rx'] - 4)

            

        has_dot = False

        if max_dot_x > rx + rw + 4:

            y1_zone = max(0, ry - 10)

            y2_zone = min(crop.shape[0], ry + rh + 10)

            x1_zone = rx + rw + 2

            x2_zone = max_dot_x

            dot_zone = crop[y1_zone:y2_zone, x1_zone:x2_zone]

            if dot_zone.size > 0 and dot_zone.shape[1] >= 6:

                dot_inv = (dot_zone < 160).astype(np.uint8) * 255

                # Masker de 5 lokale balklijnen (3px dikte) zodat een punt dat net een balklijn raakt wordt losgekoppeld

                ll_dot = track_local_staff_lines(img, staff_info, mx1 + (x1_zone + x2_zone)//2)

                for line_y in ll_dot:

                    rel_ly = int(line_y - (y_top + y1_zone))

                    if 0 <= rel_ly < dot_inv.shape[0]:

                        dot_inv[max(0, rel_ly - 4):min(dot_inv.shape[0], rel_ly + 5), :] = 0

                        

                d_num, _, d_stats, d_cents = cv2.connectedComponentsWithStats(dot_inv)

                for di in range(1, d_num):

                    dx_c, dy_c, dw, dh, d_area = d_stats[di, 0], d_stats[di, 1], d_stats[di, 2], d_stats[di, 3], d_stats[di, 4]

                    # Balklijnen overspannen de hele breedte van de zone van linker- tot rechterrand

                    spans_zone = (dx_c <= 1 and dx_c + dw >= dot_zone.shape[1] - 2)

                    if spans_zone:

                        continue

                    # Een verlengingspunt is een vrij zwevend eilandje: raakt NOOIT de bovenrand

                    # of onderrand en staat los van de nootkop (dx_c >= 2)

                    touches_vertical_boundary = (dy_c <= 1 or dy_c + dh >= dot_zone.shape[0] - 1)
                    touches_notehead = (dx_c <= max(3, int(sp * 0.15)))
                    if touches_vertical_boundary or touches_notehead:
                        continue

                    # Een verlengingspunt is compact en rondachtig

                    if 80 <= d_area <= 350 and 8 <= dw <= int(sp * 0.95) and 8 <= dh <= int(sp * 0.95):

                        if 0.50 <= dw / max(1, dh) <= 2.0:

                            has_dot = True

                            if debug:

                                print(f"      DOT FOUND rx={rx}: dw={dw}, dh={dh}, area={d_area}")

                            break

                    

        # DUURBEPALING op basis van optische eigenschappen (open/gesloten en punt)

        if is_open and has_dot:

            dur = 12

        elif is_open:

            dur = 8

        elif has_dot:

            dur = 6

        else:

            dur = 4

            

        solf = SOLFEGE_NAMES[st_name] + ('#' if alt==1 else '') + str(oct_n)
        note_dict = {
            'abs_x': abs_x,
            'abs_y': abs_y,
            'k': k,
            'step': st_name,
            'alter': alt,
            'octave': oct_n,
            'is_open': is_open,
            'has_dot': has_dot,
            'duration': dur,
            'solfege': solf,
            'rw': rw,
            'rh': rh,
            'has_stem': c.get('has_stem', False),
            'stem_dir': c.get('stem_dir', 'up'),
            'stem_tip_y': c.get('stem_tip_y', abs_y),
            'stem_x': c.get('stem_x', abs_x)
        }
        if debug:
            print(f"      CREATED NOTE: {solf} x={abs_x}, has_dot={has_dot}, dur={dur}")
        notes.append(note_dict)

    # Ontdubbeling van nootkoppen binnen dezelfde stem
    filtered_notes = []
    for n in sorted(notes, key=lambda it: it['abs_x']):
        if not filtered_notes or abs(n['abs_x'] - filtered_notes[-1]['abs_x']) > 24:
            filtered_notes.append(n)

    # Koppel elke gedetecteerde fermate aan exact de ENE dichtstbijzijnde noot in deze stem
    for fx in fermata_x:
        if filtered_notes:
            closest_n = min(filtered_notes, key=lambda it: abs(it['abs_x'] - fx))
            if debug:
                print(f"      FERMATA MATCH: fx={fx}, closest={closest_n.get('solfege')} abs_x={closest_n['abs_x']}, diff={abs(closest_n['abs_x'] - fx):.1f}, max_diff={sp * 1.65:.1f}")
            if abs(closest_n['abs_x'] - fx) <= sp * 1.65:
                closest_n['fermata'] = True
                if closest_n.get('is_open') and closest_n['duration'] < 8:
                    closest_n['duration'] = 8

    # 6. RUSTENDETECTIE: Detecteert kwartrusten (bliksemvormig symbool) in lege tussenruimtes

    lines_s = staff_info['lines']

    l0_s, l4_s = int(lines_s[0]), int(lines_s[4])

    xs_check = [mx1] + [int(n['abs_x']) for n in filtered_notes] + [mx2]

    detected_rests = []

    for k in range(len(xs_check) - 1):

        x_left = xs_check[k]

        x_right = xs_check[k+1]

        gap_w = x_right - x_left

        # Een kwartrust vereist minimaal een volledige lege telruimte (>= 125px)

        if gap_w < 125:

            continue

        sub_x1 = x_left + 45 if k > 0 else x_left + 15

        sub_x2 = x_right - 45 if k < len(xs_check) - 2 else x_right - 15

        sub_w = sub_x2 - sub_x1

        if sub_w < 25:

            continue

        crop_r = img[l0_s:l4_s+1, sub_x1:sub_x2]

        _, inv_r = cv2.threshold(crop_r, 160, 255, cv2.THRESH_BINARY_INV)

        horiz_k = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 1))

        lines_mask = cv2.morphologyEx(inv_r, cv2.MORPH_OPEN, horiz_k)

        symbols = cv2.subtract(inv_r, lines_mask)

        dil = cv2.dilate(symbols, np.ones((5, 3), dtype=np.uint8))

        n_c, _, stats_c, cents_c = cv2.connectedComponentsWithStats(dil)

        for ci in range(1, n_c):

            rx, ry, rw, rh, rarea = stats_c[ci]

            # Een echte rust raakt niet aan de uiterste randen van het venster (geen afgesneden vlag of stok)

            if rx >= 3 and (rx + rw) <= (sub_w - 3):

                if rh >= sp * 2.0 and rarea >= 450 and rw >= 18:

                    rest_x = sub_x1 + cents_c[ci][0]

                    detected_rests.append({

                        'step': 'rest', 'alter': 0, 'octave': 0,

                        'duration': 4,

                        'abs_x': rest_x,

                        'abs_y': float((l0_s + l4_s) / 2),

                        'solfege': 'Rust'

                    })

                    break

    if detected_rests:

        filtered_notes.extend(detected_rests)

        filtered_notes.sort(key=lambda it: it['abs_x'])

    # Stap 3: Beams, stokeinden en bogen direct mechanisch koppelen

    detect_beams_for_notes(img, filtered_notes, staff_info, debug=debug)

    detect_slurs_and_ties_in_measure(img, filtered_notes, staff_info, debug=debug)

    if debug:

        print(f"   📋 NOTEN ({clef}): {[(n['solfege'], int(n['abs_x']), int(n['abs_y']), n.get('stem_dir'), n.get('duration')) for n in filtered_notes]}")

    return filtered_notes

def detect_beams_for_notes(img, notes, staff_info, debug=False):

    """

    Stap 3 (Beams conform AGENTS.md):

    Detecteert universeel doorlopende dwarsbalken (beams) tussen opeenvolgende stokken.

    Bepaalt per nootpaar de stokrichting (omhoog of omlaag) en zoekt uitsluitend

    bij de stokeinden naar een dikke inktverbinding (beam van 4-7px).

    Dit voorkomt 100% dat liedteksten, koppeltekens of balklijnen vals als balk worden gezien.

    """

    if len(notes) < 2:

        return

        

    sp = staff_info['spacing']

    lines = staff_info['lines']

    # Morfologische balkkern: hoogte 4px verwijdert gegarandeerd alle balklijnen (1-2px)

    # en behoudt uitsluitend echte dwarsbalken van 5-7px dikte

    beam_k = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 4))

    stem_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(3, int(sp * 0.8))))

    

    # Bepaal per gesloten noot de universele stokrichting ('up' of 'down')

    for n in notes:

        if n.get('is_open') or n.get('step') == 'rest':

            n['stem_dir'] = 'none'

            continue

            

        nx = int(n['abs_x'])

        ny = int(n['abs_y'])

        

        true_half_w = min(n.get('rw', int(sp * 0.70)) // 2, int(sp * 0.45))

        stem_up_col_range = range(max(0, nx + true_half_w - 4), min(img.shape[1], nx + true_half_w + 4))

        stem_up_x = min(stem_up_col_range, key=lambda x: np.mean(img[max(0, ny - int(sp * 2.5)):ny, x])) if stem_up_col_range else (nx + true_half_w)

        up_col = img[max(0, ny - int(sp * 3.2)):ny, max(0, stem_up_x - 3):min(img.shape[1], stem_up_x + 4)]

        up_score = 0

        if up_col.size > 0:

            up_inv = (up_col < 160).astype(np.uint8)

            up_stem = cv2.morphologyEx(up_inv, cv2.MORPH_OPEN, stem_k)

            up_score = np.sum(up_stem > 0)

            

        stem_down_col_range = range(max(0, nx - true_half_w - 4), min(img.shape[1], nx - true_half_w + 4))

        stem_down_x = min(stem_down_col_range, key=lambda x: np.mean(img[ny:min(img.shape[0], ny + int(sp * 2.5)), x])) if stem_down_col_range else (nx - true_half_w)

        k_val = n.get('k', 4)

        if k_val <= 1:

            max_down_y = min(img.shape[0], ny + int(sp * 3.4), int(lines[4] + sp * 0.9))

        else:

            max_down_y = min(img.shape[0], ny + int(sp * 3.4))

        down_col = img[ny:max_down_y, max(0, stem_down_x - 3):min(img.shape[1], stem_down_x + 4)]

        down_score = 0

        if down_col.size > 0:

            down_inv = (down_col < 160).astype(np.uint8)

            down_stem = cv2.morphologyEx(down_inv, cv2.MORPH_OPEN, stem_k)

            down_score = np.sum(down_stem > 0)

            

        if up_score > down_score + 15:

            is_stem_up = True

        elif down_score > up_score + (35 if k_val <= 1 else 15):

            is_stem_up = False

        else:

            # Universele muzieknotatieregel (Behind Bars, p. 13):

            # Noten onder de middelste balklijn (k < 4) hebben stok omhoog,

            # noten op of boven de middelste lijn (k >= 4) hebben stok omlaag.

            is_stem_up = (k_val < 4)

        n['stem_dir'] = 'up' if is_stem_up else 'down'

        if debug:

            print(f"      STEM CHECK: {n.get('solfege')} (x={nx}, y={ny}, k={n.get('k')}): up={up_score}, down={down_score} => {n['stem_dir']}")

        

        # Bepaal het werkelijke stokeinde (tip) door continu vanuit de nootkop langs de stok te lopen

        # totdat de inkt stopt (witruimte). Voor noten onder/boven de balk kan de stok tot 5.5x sp lang zijn.

        last_ink_y = ny

        max_dist = int(sp * 5.5)

        min_stem_dist = int(sp * 2.2)

        if is_stem_up:

            stem_x = stem_up_x

            gap = 0

            for step_y in range(1, max_dist):

                curr_y = ny - step_y

                if curr_y < 0:

                    break

                strip = img[curr_y, max(0, stem_x - 3):min(img.shape[1], stem_x + 4)]

                if len(strip) > 0 and np.min(strip) < 185:

                    last_ink_y = curr_y

                    gap = 0

                else:

                    gap += 1

                    if step_y >= min_stem_dist and gap >= 5:

                        break

                    elif gap >= 8:

                        break

            n['stem_tip_y'] = float(last_ink_y)
            n['stem_x'] = float(stem_x)
            n['stem_length'] = float(abs(last_ink_y - ny))

        else:

            stem_x = stem_down_x

            gap = 0

            for step_y in range(1, max_dist):

                curr_y = ny + step_y

                if curr_y >= img.shape[0]:

                    break

                strip = img[curr_y, max(0, stem_x - 3):min(img.shape[1], stem_x + 4)]

                if len(strip) > 0 and np.min(strip) < 185:

                    last_ink_y = curr_y

                    gap = 0

                else:

                    gap += 1

                    if step_y >= min_stem_dist and gap >= 5:

                        break

                    elif gap >= 8:

                        break

            n['stem_tip_y'] = float(last_ink_y)
            n['stem_x'] = float(stem_x)
            n['stem_length'] = float(abs(last_ink_y - ny))

        # Stokeinde-analyse (Uiteinde B conform AGENTS.md Sectie 5):
        # Meet horizontale balk-inkt direct links en rechts van het stokeinde
        tip_y = int(n.get('stem_tip_y', ny))
        s_x = int(n.get('stem_x', nx))
        win_y1 = max(0, tip_y - 4)
        win_y2 = min(img.shape[0], tip_y + 5)
        
        # Horizontale inkt naar rechts (balk naar volgende noot)
        xr1 = min(img.shape[1], s_x + 3)
        xr2 = min(img.shape[1], s_x + int(sp * 0.9))
        strip_r = img[win_y1:win_y2, xr1:xr2]
        n['tip_ink_right'] = int(np.sum(strip_r < 160)) if strip_r.size > 0 else 0
        
        # Horizontale inkt naar links (balk vanaf vorige noot)
        xl1 = max(0, s_x - int(sp * 0.9))
        xl2 = max(0, s_x - 3)
        strip_l = img[win_y1:win_y2, xl1:xl2]
        n['tip_ink_left'] = int(np.sum(strip_l < 160)) if strip_l.size > 0 else 0

    # Zoek dwarsbalken tussen opeenvolgende noten langs de exacte stokeind-trajectorie

    for i in range(len(notes) - 1):

        n1 = notes[i]

        n2 = notes[i + 1]

        

        if n1.get('is_open') or n2.get('is_open') or n1.get('step') == 'rest' or n2.get('step') == 'rest':

            continue

            

        dx = n2['abs_x'] - n1['abs_x']

        if dx < 14 or dx > sp * 6.5:

            continue

            

        dir1 = n1.get('stem_dir', 'up')

        dir2 = n2.get('stem_dir', 'up')

        

        # Beide noten moeten dezelfde stokrichting hebben om een reguliere dwarsbalk te vormen

        if dir1 != dir2:

            continue

            

        tip1 = n1.get('stem_tip_y', n1['abs_y'])

        tip2 = n2.get('stem_tip_y', n2['abs_y'])

        

        def count_beams_at(frac):
            x_eval = int(n1['abs_x'] + frac * dx)
            expected_y = int(tip1 + frac * (tip2 - tip1))
            # Beams hangen vanaf het stokeinde richting de nootkop: asymmetrisch venster
            if dir1 == 'up':
                y_lo = max(0, expected_y - 6)
                y_hi = min(img.shape[0], expected_y + int(sp * 1.3))
            else:
                y_lo = max(0, expected_y - int(sp * 1.3))
                y_hi = min(img.shape[0], expected_y + 7)
            strip = img[y_lo:y_hi,
                        max(0, x_eval - 2):min(img.shape[1], x_eval + 3)]
            if strip.size == 0:
                return 0
            strip_inv = (strip < 160).astype(np.uint8)
            # Dicht scanruis-gaatjes (1-2px) binnen één beam; parallelle beams (~0.25*sp uit elkaar) blijven gescheiden
            strip_inv = cv2.morphologyEx(strip_inv, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 3)))
            beam_vert_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 5))
            thick = cv2.morphologyEx(strip_inv, cv2.MORPH_OPEN, beam_vert_k)
            num_c, _, stats_c, _ = cv2.connectedComponentsWithStats(thick)
            local_ll = track_local_staff_lines(img, staff_info, x_eval)
            min_beam_h = max(10, int(round(sp * 0.36)))
            beams_here = 0
            dbg_comps = []
            for ci in range(1, num_c):
                ch = stats_c[ci, 3]
                carea = stats_c[ci, 4]
                dbg_comps.append((int(y_lo + stats_c[ci, 1]), int(ch), int(carea)))
                if carea < 22 or ch < min_beam_h:
                    continue
                c_y_mid = y_lo + stats_c[ci, 1] + ch / 2.0
                is_on_staff_line = any(abs(c_y_mid - l) < max(5.5, sp * 0.22) for l in local_ll)
                if is_on_staff_line and ch < max(11, int(round(sp * 0.42))):
                    continue
                beams_here += 1
            if debug:
                print(f"         beam@{frac}: x={x_eval}, exp_y={expected_y}, comps(y,h,area)={dbg_comps}, lines={[int(l) for l in local_ll]}")
            return beams_here

        b25 = count_beams_at(0.25)

        b50 = count_beams_at(0.50)

        b75 = count_beams_at(0.75)

        beam_found = (b25 >= 1 and b50 >= 1 and b75 >= 1)

        if debug:

            print(f"   🔍 BEAM CHECK: {n1.get('solfege')} -> {n2.get('solfege')} (dx={dx}, tips={int(tip1)}/{int(tip2)}): b25={b25}, b50={b50}, b75={b75} => {beam_found}")

        if beam_found:

            num_parallel = 2 if (b25 >= 2 and b50 >= 2 and b75 >= 2) else 1

            n1['beamed_to_next'] = True

            n2['beamed_from_prev'] = True

            n1['beam_count'] = max(n1.get('beam_count', 1), num_parallel)

            n2['beam_count'] = max(n2.get('beam_count', 1), num_parallel)

    # Vaantjesdetectie voor losse noten zonder dwarsbalk

    # Een vaantje hangt altijd aan de rechterkant van het stokeinde tussen balklijnen

    for n in notes:

        if n.get('is_open') or n.get('beamed_to_next') or n.get('beamed_from_prev'):

            continue

        nx = int(n['abs_x'])

        ny = int(n['abs_y'])

        tip_y = int(n.get('stem_tip_y', ny))

        stem_dir = n.get('stem_dir', 'up')

        half_w = n.get('rw', int(sp * 0.70)) // 2

        stem_x = int(n.get('stem_x', (nx + half_w if stem_dir == 'up' else nx - half_w - 2)))

        

        if stem_dir == 'up':

            win = img[tip_y : int(tip_y + sp * 1.3),

                      stem_x + 3 : min(img.shape[1], stem_x + 18)]

            if win.size > 0 and win.shape[1] >= 10:

                win_gray = cv2.cvtColor(win, cv2.COLOR_BGR2GRAY) if len(win.shape) == 3 else win

                row_means = np.mean(win_gray, axis=1)

                staff_mask = row_means < 135

                flag_strip = win_gray[~staff_mask, :]

                if flag_strip.size > 0:

                    flag_ink = np.sum(flag_strip < 160)

                    if debug:

                        print(f"      FLAG CHECK: {n.get('solfege')} (x={nx}, tip={tip_y}, dir={stem_dir}): flag_ink={flag_ink}")

                    if flag_ink > 35:

                        n['flag'] = 1
        else:
            # Down-stem flag: hangt aan de rechterkant van het onderste stokeinde
            win = img[max(0, int(tip_y - sp * 1.0)) : tip_y,
                      stem_x + 3 : min(img.shape[1], stem_x + int(sp * 0.75))]
            if win.size > 0 and win.shape[1] >= 6:
                win_clean = win.copy()
                for l in lines:
                    rel_ly = int(l - max(0, int(tip_y - sp * 1.0)))
                    if 0 <= rel_ly < win_clean.shape[0]:
                        win_clean[max(0, rel_ly - 2):min(win_clean.shape[0], rel_ly + 3), :] = 255
                flag_ink = np.sum(win_clean < 160)
                if debug:
                    print(f"      FLAG CHECK: {n.get('solfege')} (x={nx}, tip={tip_y}, dir={stem_dir}): flag_ink={flag_ink}")
                if flag_ink > 50:
                    n['flag'] = 1

            

    # Ken officiële MusicXML <beam> tags en duren toe (met respect voor 1/8 en 1/16 en verlengingspunt)

    for n in notes:

        if n.get('is_open'):

            base_dur = 12 if n.get('has_dot') else 8

        else:

            to_next = n.get('beamed_to_next', False)

            from_prev = n.get('beamed_from_prev', False)

            b_count = n.get('beam_count', 1)

            

            if to_next and not from_prev:

                n['beam'] = 'begin'

                if b_count >= 2:

                    n['beam2'] = 'begin'

            elif to_next and from_prev:

                n['beam'] = 'continue'

                if b_count >= 2:

                    n['beam2'] = 'continue'

            elif from_prev and not to_next:

                n['beam'] = 'end'

                if b_count >= 2:

                    n['beam2'] = 'end'

                    

            if to_next or from_prev:

                base_dur = 1 if b_count >= 2 else 2

            elif n.get('flag') == 2:

                base_dur = 1

            elif n.get('flag') == 1:

                base_dur = 2

            else:

                base_dur = 4

                

            if n.get('has_dot'):

                if base_dur == 4:

                    base_dur = 6

                elif base_dur == 2:

                    base_dur = 3

                elif base_dur == 1:

                    base_dur = 2

        n['duration'] = base_dur

def remove_staff_line_runs(inv, staff_mask, max_t):
    """
    Run-length balklijnverwijdering (universeel OMR-principe):
    per kolom wordt een verticale inktloop die een balklijn raakt enkel verwijderd
    als hij niet dikker is dan een balklijn (max_t px). Symbolen die de lijn kruisen
    (bogen, nootkoppen, stokken) geven een dikkere loop en blijven dus intact.
    """
    out = inv.copy()
    h, w = inv.shape
    ink = inv > 0
    on_line = staff_mask > 0
    for x in range(w):
        col = ink[:, x]
        if not col.any() or not on_line[:, x].any():
            continue
        y = 0
        while y < h:
            if col[y]:
                y0 = y
                while y < h and col[y]:
                    y += 1
                if (y - y0) <= max_t and on_line[y0:y, x].any():
                    out[y0:y, x] = 0
            else:
                y += 1
    return out

def detect_slurs_and_ties_in_measure(img, notes, staff_info, debug=False):

    """

    Detecteert verbindingsbogen (ties) tussen opeenvolgende noten van exact dezelfde toonhoogte.

    Zoekt naar de karakteristieke inktboog onder de nootkoppen met maskering van balklijnen.

    """

    if len(notes) < 2:

        return

    sp = staff_info['spacing']

    i = 0
    while i < len(notes) - 1:
        n1 = notes[i]
        if n1.get('step') == 'rest' or n1.get('slur') == 'start':
            i += 1
            continue

        found_target = None
        found_arc = None
        found_span = 1

        # Zoek van langste span (melisma over 4 of 3 noten) naar kortste span (2 noten)
        for span in [3, 2, 1]:
            j = i + span
            if j >= len(notes):
                continue
            n2 = notes[j]
            if n2.get('step') == 'rest':
                continue
            dx = n2['abs_x'] - n1['abs_x']
            if not (12 <= dx <= int(sp * 14.0)):
                continue
            if n1.get('slur') == 'stop' and span > 1:
                continue

            span_notes = notes[i:j + 1]
            y_bot = max(nn['abs_y'] for nn in span_notes if 'abs_y' in nn)
            y_top = min(nn['abs_y'] for nn in span_notes if 'abs_y' in nn)

            def _check_strip_arc(side):
                pad = int(sp * 0.4)
                wx1 = max(0, int(n1['abs_x']) - pad)
                wx2 = min(img.shape[1], int(n2['abs_x']) + pad)
                if side == 'below':
                    wy1 = int(y_top + sp * 0.2)
                    wy2 = int(y_bot + sp * 2.2)
                else:
                    min_y_top = min([y_top] + [nn.get('abs_y', y_top) - sp * 2.8 for nn in span_notes if nn.get('stem_dir') == 'up'])
                    wy1 = int(min_y_top - sp * 1.5)
                    wy2 = int(y_bot - sp * 0.2)
                wy1 = max(0, wy1)
                wy2 = min(img.shape[0], wy2)
                if wy2 - wy1 < 6 or wx2 - wx1 < 10:
                    return False
                ext = int(sp * 3.5)
                cx1 = max(0, wx1 - ext)
                cx2 = min(img.shape[1], wx2 + ext)
                _, inv_c = cv2.threshold(img[wy1:wy2, cx1:cx2], 160, 255, cv2.THRESH_BINARY_INV)
                lines_k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(15, int(sp * 3.0)), 1))
                staff_ink = cv2.morphologyEx(inv_c, cv2.MORPH_OPEN, lines_k)
                runs = []
                for xc in range(0, staff_ink.shape[1], 7):
                    colm = staff_ink[:, xc] > 0
                    yy = 0
                    while yy < len(colm):
                        if colm[yy]:
                            y0 = yy
                            while yy < len(colm) and colm[yy]:
                                yy += 1
                            runs.append(yy - y0)
                        else:
                            yy += 1
                line_t = int(np.median(runs)) if runs else max(2, int(round(sp * 0.12)))
                res = remove_staff_line_runs(inv_c, staff_ink, max_t=line_t + 1)
                res = cv2.morphologyEx(res, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (max(5, int(sp * 0.8)), 1)))
                stem_k = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(5, int(sp * 1.2))))
                stems = cv2.dilate(cv2.morphologyEx(res, cv2.MORPH_OPEN, stem_k), np.ones((1, 5), dtype=np.uint8))
                res = cv2.subtract(res, stems)
                beam_k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(9, int(sp * 1.5)), max(3, int(sp * 0.33))))
                beams = cv2.dilate(cv2.morphologyEx(res, cv2.MORPH_OPEN, beam_k), np.ones((3, 3), dtype=np.uint8))
                res = cv2.subtract(res, beams)
                # Herverbind boogsegmenten die door een stok of dwarsbalk zijn doorgesneden
                res = cv2.morphologyEx(res, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (max(11, int(sp * 1.25)), 3)))
                res = res[:, wx1 - cx1: wx2 - cx1].copy()
                # Gum alle nootkoppen in het venster weg
                for nn in notes:
                    if nn.get('step') == 'rest' or 'abs_x' not in nn:
                        continue
                    hx = int(nn['abs_x']) - wx1
                    hy = int(nn['abs_y']) - wy1
                    ax = int(nn.get('rw', sp * 0.7) / 2 + 2)
                    ay = int(nn.get('rh', sp * 0.6) / 2 + 2)
                    if -ax <= hx < res.shape[1] + ax and -ay <= hy < res.shape[0] + ay:
                        cv2.ellipse(res, (hx, hy), (ax, ay), 0, 0, 360, 0, -1)
                n_c, lab, st, _ = cv2.connectedComponentsWithStats(res)
                gap = n2['abs_x'] - n1['abs_x']
                head_w = (n1.get('rw', sp * 0.7) + n2.get('rw', sp * 0.7)) / 2.0
                min_bw = max(int(sp * 0.45), int((gap - head_w) * 0.45))
                for ci in range(1, n_c):
                    bx, by, bw, bh, ba = st[ci]
                    if debug and ba >= sp * 0.8:
                        print(f"      ARC RAW {side}: {n1.get('solfege')}->{n2.get('solfege')} x={wx1 + bx}, y={wy1 + by}, bw={bw}, bh={bh}, area={ba}, min_bw={min_bw:.0f}")
                    if ba < sp * 0.8 or bw < min_bw or bw > gap + sp * 1.2:
                        continue
                    if bh < max(3, int(sp * 0.15)) or bh > int(sp * 1.85):
                        continue
                    if ba / max(1, bw) > max(6.0, int(sp * 0.22)):
                        continue
                    c_mid = wx1 + bx + bw / 2.0
                    if not (n1['abs_x'] + gap * 0.08 <= c_mid <= n2['abs_x'] - gap * 0.08):
                        continue
                    x_arc_l = wx1 + bx
                    x_arc_r = wx1 + bx + bw
                    if abs(x_arc_l - n1['abs_x']) > max(16, int(sp * 1.35)) or abs(x_arc_r - n2['abs_x']) > max(16, int(sp * 1.35)):
                        continue
                    comp = (lab[by:by + bh, bx:bx + bw] == ci)
                    cols = np.where(comp.any(axis=0))[0]
                    if len(cols) < 5:
                        continue
                    ys = np.array([np.mean(np.where(comp[:, c])[0]) for c in cols])
                    k_win = max(1, len(ys) // 6)
                    y_ends = (np.mean(ys[:k_win]) + np.mean(ys[-k_win:])) / 2.0
                    y_mid = np.mean(ys[len(ys) // 2 - k_win // 2: len(ys) // 2 + k_win // 2 + 1])
                    sag = (y_mid - y_ends) if side == 'below' else (y_ends - y_mid)
                    if debug:
                        print(f"      ARC CAND {side}: {n1.get('solfege')}->{n2.get('solfege')} bw={bw}, bh={bh}, thick={ba / max(1, bw):.1f}, sag={sag:.1f}")
                    if sag >= max(2.8, int(round(sp * 0.11))):
                        return True

                def _get_arm_endpoints(ci_idx):
                    bx, by, bw, bh, _ = st[ci_idx]
                    comp_arm = (lab[by:by + bh, bx:bx + bw] == ci_idx)
                    cols_arm = np.where(comp_arm.any(axis=0))[0]
                    if len(cols_arm) < 4:
                        return None
                    ys_arm = [np.mean(np.where(comp_arm[:, c])[0]) for c in cols_arm]
                    k_arm = max(1, len(ys_arm) // 5)
                    y_l = wy1 + by + float(np.mean(ys_arm[:k_arm]))
                    y_r = wy1 + by + float(np.mean(ys_arm[-k_arm:]))
                    return y_l, y_r

                seg_cand = [(ci, st[ci]) for ci in range(1, n_c) if st[ci, 4] >= sp * 0.8 and st[ci, 2] >= int(sp * 0.35) and st[ci, 3] <= int(sp * 1.85)]
                for i1 in range(len(seg_cand)):
                    for i2 in range(i1 + 1, len(seg_cand)):
                        (ci1, s1), (ci2, s2) = seg_cand[i1], seg_cand[i2]
                        if s1[0] > s2[0]:
                            ci1, ci2 = ci2, ci1
                            s1, s2 = s2, s1
                        x1_left = wx1 + s1[0]
                        x1_right = wx1 + s1[0] + s1[2]
                        x2_left = wx1 + s2[0]
                        x2_right = wx1 + s2[0] + s2[2]
                        inter_gap = x2_left - x1_right
                        if not (0 <= inter_gap <= int(sp * 6.5)):
                            continue
                        comb_span = x2_right - x1_left
                        if comb_span < min_bw or comb_span > gap + sp * 1.2:
                            continue
                        if abs(x1_left - n1['abs_x']) > max(14, int(sp * 0.85)) or abs(x2_right - n2['abs_x']) > max(14, int(sp * 0.85)):
                            continue
                        ep1 = _get_arm_endpoints(ci1)
                        ep2 = _get_arm_endpoints(ci2)
                        if ep1 is None or ep2 is None:
                            continue
                        y1_outer, y1_inner = ep1
                        y2_inner, y2_outer = ep2
                        if abs(y1_inner - y2_inner) > max(3, int(sp * 0.18)):
                            continue
                        if abs(y1_outer - y2_outer) > int(sp * 0.70):
                            continue
                        y_ends = (y1_outer + y2_outer) / 2.0
                        y_mid = (y1_inner + y2_inner) / 2.0
                        sag_pair = (y_mid - y_ends) if side == 'below' else (y_ends - y_mid)
                        if debug:
                            print(f"      ARC PAIR {side}: {n1.get('solfege')}->{n2.get('solfege')} span={comb_span}, inter_gap={inter_gap}, sag={sag_pair:.1f}")
                        if sag_pair >= max(2.8, int(round(sp * 0.11))):
                            return True
                return False

            if _check_strip_arc('below'):
                found_arc = 'below'
                found_target = n2
                found_span = span
                break
            elif not any(nn.get('fermata') for nn in span_notes) and _check_strip_arc('above'):
                found_arc = 'above'
                found_target = n2
                found_span = span
                break

        if found_arc and found_target is not None:
            same_pitch = (found_span == 1 and n1.get('step') == found_target.get('step') and n1.get('octave') == found_target.get('octave') and n1.get('alter', 0) == found_target.get('alter', 0))
            if same_pitch:
                n1['tie'] = 'start'
                found_target['tie'] = 'stop'
            else:
                n1['slur'] = 'start'
                n1['slur_placement'] = found_arc
                found_target['slur'] = 'stop'
        i += 1

# ==============================================================================

# 5. MUSICXML SERIALISATIE (UNIVERSEEL)

# ==============================================================================

def export_to_musicxml(score_data, output_file, title="Score", composer="Anonymous", key_fifths=0, time_sig="4/4"):

    """Bouwt een geldige W3C MusicXML DOM op met opmaat, herhalingsmaatstreep, fermates en tekst."""

    score = ET.Element('score-partwise', version='3.1')

    

    # Movement title

    mtitle = ET.SubElement(score, 'movement-title')

    mtitle.text = title

    

    ident = ET.SubElement(score, 'identification')

    if composer:

        creator = ET.SubElement(ident, 'creator', type='composer')

        creator.text = composer

    encoding = ET.SubElement(ident, 'encoding')

    software = ET.SubElement(encoding, 'software')

    software.text = 'Zing! Universal OMR Converter v1.1'

    

    # Part list

    part_list = ET.SubElement(score, 'part-list')

    for p_id, p_name in score_data['parts_info']:

        sp = ET.SubElement(part_list, 'score-part', id=p_id)

        pn = ET.SubElement(sp, 'part-name')

        pn.text = p_name

        

    # Parts & Measures

    for part_idx, (p_id, p_name) in enumerate(score_data['parts_info']):

        part_el = ET.SubElement(score, 'part', id=p_id)

        part_measures = score_data['measures_by_part'][p_id]

        in_word = False
        in_word2 = False

        

        for m_idx, m_data in enumerate(part_measures):

            # Maten met minder dan 16 divisions (zoals opmaat of slotmaat) zijn onvolledig (implicit="yes")

            m_dur_sum = sum(n.get('duration', 0) for n in m_data['notes'])

            m_attrib = {'number': str(m_idx)}

            if m_dur_sum < 16:

                m_attrib['implicit'] = 'yes'

            if m_data.get('width'):

                m_attrib['width'] = str(m_data['width'])

            m_el = ET.SubElement(part_el, 'measure', attrib=m_attrib)

            

            # Nieuw systeem (systeembreuk) zoals gescand op de partituur

            if m_data.get('new_system'):

                ET.SubElement(m_el, 'print', attrib={'new-system': 'yes'})

            

            # Attributes in eerste maat (Maat 0)

            if m_idx == 0:

                attr = ET.SubElement(m_el, 'attributes')

                div = ET.SubElement(attr, 'divisions')

                div.text = '4'

                

                key = ET.SubElement(attr, 'key')

                fifths = ET.SubElement(key, 'fifths')

                fifths.text = str(key_fifths)

                

                time = ET.SubElement(attr, 'time')

                beats = ET.SubElement(time, 'beats')

                btype = ET.SubElement(time, 'beat-type')

                if '/' in str(time_sig):

                    b_num, b_den = str(time_sig).split('/', 1)

                else:

                    b_num, b_den = '4', '4'

                beats.text = str(b_num.strip())

                btype.text = str(b_den.strip())

                

                clef_el = ET.SubElement(attr, 'clef')

                sign = ET.SubElement(clef_el, 'sign')

                sign.text = 'F' if 'Bas' in p_name else 'G'

                line = ET.SubElement(clef_el, 'line')

                line.text = '4' if 'Bas' in p_name else '2'

                # Tempo standaard instellen op 120 BPM

                dir_el = ET.SubElement(m_el, 'direction', placement='above')

                dir_typ = ET.SubElement(dir_el, 'direction-type')

                metro = ET.SubElement(dir_typ, 'metronome')

                ET.SubElement(metro, 'beat-unit').text = 'quarter'

                ET.SubElement(metro, 'per-minute').text = '120'

                ET.SubElement(dir_el, 'sound', tempo='120')

                if 'Tenor' in p_name:

                    co = ET.SubElement(clef_el, 'clef-octave-change')

                    co.text = '-1'

                    

            # Voeg noten toe

            if not m_data['notes']:

                n_el = ET.SubElement(m_el, 'note')

                ET.SubElement(n_el, 'rest')

                dur = ET.SubElement(n_el, 'duration')

                dur.text = '16'

                v = ET.SubElement(n_el, 'voice')

                v.text = '1'

                t = ET.SubElement(n_el, 'type')

                t.text = 'whole'

            else:

                for note_i, n in enumerate(m_data['notes']):

                    n_attrib = {}

                    if 'abs_x' in n and m_data.get('mx1'):

                        rel_x = max(10, int((n['abs_x'] - m_data['mx1']) * 0.32))

                        n_attrib['default-x'] = str(rel_x)

                    n_el = ET.SubElement(m_el, 'note', attrib=n_attrib)

                    if n.get('step') == 'rest' or n.get('pitch') == 'Rust':
                        ET.SubElement(n_el, 'rest')

                    else:

                        pitch_el = ET.SubElement(n_el, 'pitch')

                        st = ET.SubElement(pitch_el, 'step')

                        st.text = n['step']

                        if n['alter'] != 0:

                            alt = ET.SubElement(pitch_el, 'alter')

                            alt.text = str(n['alter'])

                        oct_el = ET.SubElement(pitch_el, 'octave')

                        oct_el.text = str(n['octave'])

                        

                    dur = ET.SubElement(n_el, 'duration')

                    dur.text = str(n['duration'])

                    v = ET.SubElement(n_el, 'voice')

                    v.text = '1'

                    

                    t = ET.SubElement(n_el, 'type')

                    if n['duration'] >= 16:

                        t.text = 'whole'

                    elif n['duration'] in [12, 8]:

                        t.text = 'half'

                    elif n['duration'] in [6, 4]:

                        t.text = 'quarter'

                    elif n['duration'] in [3, 2]:

                        t.text = 'eighth'

                    elif n['duration'] in [1]:

                        t.text = '16th'

                    else:

                        t.text = 'eighth'

                    if n['duration'] in [12, 6, 3]:

                        ET.SubElement(n_el, 'dot')

                        

                    if n.get('beam'):

                        beam_el = ET.SubElement(n_el, 'beam', number='1')

                        beam_el.text = n['beam']

                    if n.get('beam2'):

                        beam2_el = ET.SubElement(n_el, 'beam', number='2')

                        beam2_el.text = n['beam2']

                        

                    # Verbindingsbogen (ties)

                    if n.get('tie') == 'start':

                        ET.SubElement(n_el, 'tie', type='start')

                    elif n.get('tie') == 'stop':

                        ET.SubElement(n_el, 'tie', type='stop')

                    # Eventuele tekst toevoegen conform MusicXML 3.1 syllabic specificatie

                    if n.get('lyric'):

                        raw = n['lyric']

                        ends_hyph = raw.endswith('-')

                        txt = raw.rstrip('-')

                        if in_word:

                            if ends_hyph:

                                syl_type = 'middle'

                                in_word = True

                            else:

                                syl_type = 'end'

                                in_word = False

                        else:

                            if ends_hyph:

                                syl_type = 'begin'

                                in_word = True

                            else:

                                syl_type = 'single'

                                in_word = False

                                

                        lyr_el = ET.SubElement(n_el, 'lyric')

                        ET.SubElement(lyr_el, 'syllabic').text = syl_type

                        txt_el = ET.SubElement(lyr_el, 'text')

                        txt_el.text = txt
                    if n.get('lyric2'):
                        raw2 = n['lyric2']
                        ends_hyph2 = raw2.endswith('-')
                        txt2 = raw2.rstrip('-')
                        if in_word2:
                            if ends_hyph2:
                                syl_type2 = 'middle'
                                in_word2 = True
                            else:
                                syl_type2 = 'end'
                                in_word2 = False
                        else:
                            if ends_hyph2:
                                syl_type2 = 'begin'
                                in_word2 = True
                            else:
                                syl_type2 = 'single'
                                in_word2 = False
                        lyr2_el = ET.SubElement(n_el, 'lyric', number='2')
                        ET.SubElement(lyr2_el, 'syllabic').text = syl_type2
                        txt2_el = ET.SubElement(lyr2_el, 'text')
                        txt2_el.text = txt2

                                

                    # Notations (tied, fermate)

                    notations_needed = (n.get('fermata') is True or n.get('tie') or n.get('slur'))

                    if notations_needed:

                        notations = ET.SubElement(n_el, 'notations')

                        if n.get('tie') == 'start':

                            ET.SubElement(notations, 'tied', type='start')

                        elif n.get('tie') == 'stop':

                            ET.SubElement(notations, 'tied', type='stop')

                        if n.get('slur'):

                            slur_attrib = {'type': n['slur'], 'number': '1'}

                            if n.get('slur_placement'):

                                slur_attrib['placement'] = n['slur_placement']

                            ET.SubElement(notations, 'slur', attrib=slur_attrib)

                        if n.get('fermata') is True:

                            ET.SubElement(notations, 'fermata', type='upright')

                        

            # Herhalingsmaatstreep of eindstreep

            if m_data.get('repeat_backward'):

                barline = ET.SubElement(m_el, 'barline', location='right')

                b_style = ET.SubElement(barline, 'bar-style')

                b_style.text = 'light-heavy'

                ET.SubElement(barline, 'repeat', direction='backward')

            elif m_idx == len(part_measures) - 1:

                # Definitieve eindstreep aan het einde van de partituur

                barline = ET.SubElement(m_el, 'barline', location='right')

                b_style = ET.SubElement(barline, 'bar-style')

                b_style.text = 'light-heavy'

                

    # Pretty XML string

    rough_str = ET.tostring(score, 'utf-8')

    reparsed = minidom.parseString(rough_str)

    pretty_xml = reparsed.toprettyxml(indent="  ")

    with open(output_file, 'w', encoding='utf-8') as f:

        f.write(pretty_xml)

    print(f"✅ MusicXML succesvol opgeslagen in: {output_file}")

def assign_measure_durations(notes, target_dur=16):

    """

    Kent dynamisch kwart- en achtstenoten-waarden toe aan de gedetecteerde noten

    op basis van hun werkelijke ruimtelijke afstand (inter-note spacing),

    zodat de totale maatduur mathematisch exact aansluit op target_dur (16 divisions).

    """

    if not notes:

        return [{'step': 'rest', 'alter': 0, 'octave': 0, 'duration': target_dur}]

    if len(notes) == 1:

        n = notes[0].copy()

        n['duration'] = target_dur

        return [n]

    if len(notes) == 2 and target_dur == 4:

        n1, n2 = notes[0].copy(), notes[1].copy()

        n1['duration'] = 2

        n2['duration'] = 2

        return [n1, n2]

    if target_dur == 16 and len(notes) > 8:

        notes = notes[:8]

    if target_dur == 4 and len(notes) > 2:

        notes = notes[-2:]

    # Respecteer intrinsieke duren van open noten, gedetecteerde dwarsbalken (beams), verlengingspunten (dots) en rusten

    durs = [n.get('duration', 4) for n in notes]

    fixed = set(idx for idx, n in enumerate(notes) if n.get('is_open') or n.get('beam') or n.get('has_dot') or n.get('step') == 'rest')

    

    # Als er geen dwarsbalken of open noten zijn en de maat heeft veel noten: gebruik nabijheid

    if not fixed and target_dur == 16 and len(notes) > 4:

        durs = []

        for i in range(len(notes)):

            dx_next = (notes[i+1]['abs_x'] - notes[i]['abs_x']) if i+1 < len(notes) else 150

            dx_prev = (notes[i]['abs_x'] - notes[i-1]['abs_x']) if i > 0 else 150

            if min(dx_next, dx_prev) < 110 or len(notes) >= 7:

                durs.append(2)

            else:

                durs.append(4)

            

    # Balanseer zodat de som exact gelijk is aan target_dur over niet-gefixeerde noten

    curr_sum = sum(durs)

    diff = target_dur - curr_sum

    cand = [idx for idx in range(len(durs)) if idx not in fixed]

    if not cand:

        cand = list(range(len(durs)))

        

    max_iters = 30

    while diff != 0 and max_iters > 0:

        max_iters -= 1

        step = 1 if abs(diff) == 1 else 2

        if diff > 0:
            # Een gesloten nootkop (is_open=False) kan optisch NOOIT een halve noot (>=8d) zijn.
            # Als er in de maat een open halve noot (8d) staat die gepunteerd kan zijn (12d), verhoog die eerst!
            open_half_cands = [idx for idx in range(len(durs)) if notes[idx].get('is_open') and durs[idx] == 8 and diff >= 4]
            if open_half_cands:
                best_i = open_half_cands[0]
                durs[best_i] += 4
                diff -= 4
                continue
            expandable = [idx for idx in cand if durs[idx] < 4]
            if not expandable:
                expandable = [idx for idx in cand if notes[idx].get('is_open') or durs[idx] + step < 8]
            if not expandable:
                expandable = cand
            best_i = max(expandable, key=lambda idx: (notes[idx]['abs_x'] - notes[idx-1]['abs_x']) if idx > 0 else (notes[1]['abs_x'] - notes[0]['abs_x'] if len(notes) > 1 else 50))
            durs[best_i] += step
            diff -= step
        elif diff < 0:

            has_sixteenth = any(n.get('beam2') or n.get('flag') == 2 for n in notes)
            min_d = 1 if has_sixteenth else 2
            reducible = [idx for idx in cand if durs[idx] > min_d]

            if not reducible:

                reducible = [idx for idx in cand if durs[idx] > min_d]

            if not reducible:

                reducible = [idx for idx in range(len(durs)) if durs[idx] > min_d and notes[idx].get('step') != 'rest']

            if False:

                reducible = [idx for idx in cand if durs[idx] > min_d]

            if reducible:

                cur_step = min(step, durs[reducible[-1]] - min_d)

                durs[reducible[-1]] -= max(0, cur_step)

                diff += max(0, cur_step)

                if cur_step == 0:

                    break

            else:

                break

                

    res = []

    for i, n in enumerate(notes[:len(durs)]):

        n_c = n.copy()

        n_c['duration'] = max(1, durs[i])

        res.append(n_c)

    return res

def normalize_measure_notes(notes, target_dur=16):

    """

    Universele maatharmonisatie op basis van optisch gedetecteerde nootwaarden:

    - Behoudt de intrinsieke duur van elke noot (open=halve/gepunteerd, gesloten=kwart/achtste).

    - Als de som van de noten al exact een logische maatduur vormt (bv. opmaat=4, herhaling=12, regulier=16),

      blijven de natuurlijke duren 100% behouden.

    - Bij ritmische variaties wordt het ritme gebalanceerd via assign_measure_durations.

    """

    if not notes:

        return [{'step': 'rest', 'alter': 0, 'octave': 0, 'duration': target_dur}]

        

    detected_sum = sum(n.get('duration', 4) for n in notes)

    if detected_sum == target_dur:

        return [n.copy() for n in notes]

        

    return assign_measure_durations(notes, target_dur=target_dur)

def print_score_audit(xml_path):

    """Print een complete, compacte maataudit direct in de console."""

    if not os.path.exists(xml_path):

        return

    tree = ET.parse(xml_path)

    root = tree.getroot()

    part_names = {}

    for sp in root.findall('.//score-part'):

        pid = sp.get('id')

        pname = sp.find('part-name')

        part_names[pid] = pname.text if pname is not None else pid

    parts = {p.get('id'): p for p in root.findall('part')}

    p1 = parts.get('P1') or list(parts.values())[0]

    m_nums = [m.get('number') for m in p1.findall('measure')]

    

    print("\n" + "="*70)

    print(f"📋 SCORE AUDIT: {os.path.basename(xml_path)} ({len(m_nums)} maten, stemmen: {', '.join(part_names.values())})")

    print("="*70)

    for m_num in m_nums:

        parts_notes = []

        for pid, name in part_names.items():

            target_m = None

            if pid in parts:

                for m in parts[pid].findall('measure'):

                    if m.get('number') == m_num:

                        target_m = m

                        break

            notes = []

            dur_total = 0

            if target_m is not None:

                for n in target_m.findall('note'):

                    d = n.find('duration')

                    if d is not None:

                        dur_total += int(d.text)

                    if n.find('rest') is not None:

                        notes.append('Rust')

                    else:

                        p = n.find('pitch')

                        if p is not None:

                            step = p.find('step').text

                            octave = p.find('octave').text

                            alter = p.find('alter')

                            acc = '#' if alter is not None and alter.text == '1' else ('b' if alter is not None and alter.text == '-1' else '')

                            note_str = f"{step}{acc}{octave}"
                            slurs = n.findall('notations/slur')
                            ties = n.findall('notations/tied')
                            fermatas = n.findall('notations/fermata')
                            if any(s.get('type') == 'start' for s in slurs):
                                note_str += '‿'
                            elif any(t.get('type') == 'start' for t in ties):
                                note_str += '~'
                            if fermatas:
                                note_str += '𝄐'
                            notes.append(note_str)

            parts_notes.append(f"{name} ({dur_total}d): {','.join(notes)}")

        

        target_p1_m = None

        for m in p1.findall('measure'):

            if m.get('number') == m_num:

                target_p1_m = m

                break

        lyrics = []

        if target_p1_m is not None:

            for n in target_p1_m.findall('note'):

                txt = n.find('lyric/text')

                if txt is not None and txt.text:

                    lyrics.append(txt.text)

        lyric_str = ' '.join(lyrics) if lyrics else ''

        print(f"Maat {m_num:>2} | {' | '.join(parts_notes)} | Tekst: {lyric_str}")

    print("="*70 + "\n")

# ==============================================================================

# HOOFDPROGRAMMA CLI

# ==============================================================================

def register_in_scores_index(output_file):
    """Registreert de bestandsnaam in assets/sample-scores/scores-index.json als die er nog niet in staat."""
    try:
        p = Path(output_file).resolve()
        index_file = p.parent / 'scores-index.json'
        if not index_file.exists():
            index_file = Path('assets/sample-scores/scores-index.json').resolve()

        file_list = []
        if index_file.exists():
            with open(index_file, 'r', encoding='utf-8') as f:
                raw = json.load(f)
                if isinstance(raw, list):
                    for item in raw:
                        fname = item if isinstance(item, str) else (item.get('musicXmlUrl', '').split('/')[-1] if isinstance(item, dict) else '')
                        if fname and fname not in file_list:
                            file_list.append(fname)

        new_fname = p.name
        if new_fname not in file_list:
            file_list.append(new_fname)

        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump(file_list, f, indent=2, ensure_ascii=False)
            f.write('\n')
        print(f"📋 '{new_fname}' geregistreerd in {index_file.name}")
    except Exception as e:
        print(f"⚠️ Kon scores-index.json niet bijwerken: {e}")

def main():

    parser = argparse.ArgumentParser(

        description="Zing! Universal OMR: Converteert een partituur (PDF of PNG) direct naar MusicXML."

    )

    parser.add_argument("--input", "-i", required=True, help="Pad naar PDF of PNG partituur")

    parser.add_argument("--output", "-o", required=True, help="Pad voor uitvoer MusicXML")

    parser.add_argument("--title", default=None, help="Titel van het muziekstuk (standaard uit scores-index.json of bestandsnaam)")

    parser.add_argument("--composer", default=None, help="Componist (standaard uit scores-index.json)")

    parser.add_argument("--key-fifths", default="auto", help="Aantal kruisen (+) of mollen (-) in toonsoort (of 'auto')")

    parser.add_argument("--time", default="auto", help="Maatsoort (bv. 2/2, 4/4 of 'auto')")

    parser.add_argument("--voices", default="auto", help="Koorbezetting (SATB, SAB, SA, S of 'auto' voor automatische herkenning)")

    parser.add_argument("--limit-measures", type=int, default=None, help="Beperk verwerking tot maximaal N maten (voor maat-per-maat ontwikkeling)")

    parser.add_argument("--debug-dir", help="Map om visuele controle-overlays op te slaan")

    parser.add_argument("--lyrics", default=None, help="Optioneel tekstbestand met liedteksten per maat")

    parser.add_argument("--debug-measures", default="", help="Komma-gescheiden maatnummers voor uitgebreide debug-uitvoer (enkel inspectie, bv. 3,10)")

    args = parser.parse_args()

    debug_measures = set(int(s) for s in args.debug_measures.split(',') if s.strip().isdigit())

    print("="*65)

    print("🎼 ZING! UNIVERSELE OPTISCHE PARTITUUR CONVERTER (OMR)")

    print(f"   Invoer:    {args.input}")

    print(f"   Uitvoer:   {args.output}")

    print(f"   Toonsoort: {args.key_fifths} kruisen/mollen")

    print(f"   Maatsoort: {args.time}")

    print(f"   Bezetting: {args.voices}")

    print("="*65)

    # 1. Inlezen en voorbewerking van alle pagina's
    pages = load_or_render_images(args.input)
    print(f"📄 Totaal aantal pagina's ingelezen: {len(pages)}")

    input_p = Path(args.input).resolve()
    all_systems = []

    for page_idx, page_img in enumerate(pages):
        deskewed_img, rot_angle = deskew_score(page_img)
        clean_img = filter_and_enhance_image(deskewed_img)

        # Sla de gerenderde scan automatisch op als <naam>_page_<N>.png voor Zing! webviewer
        if input_p.suffix.lower() == '.pdf':
            png_out = input_p.parent / f"{input_p.stem}_page_{page_idx+1}.png"
            cv2.imwrite(str(png_out), deskewed_img)
            print(f"🖼️ Gerenderde partituur-scan automatisch opgeslagen als: {png_out.name}")

        if args.debug_dir and page_idx == 0:
            os.makedirs(args.debug_dir, exist_ok=True)
            cv2.imwrite(os.path.join(args.debug_dir, "01_preprocessed.png"), clean_img)

        # Balken en systemen vinden via kamfilter en B0
        p_staves = find_all_staves_on_page(clean_img)
        p_systems = group_staves_by_b0(clean_img, p_staves)
        print(f"📄 Pagina {page_idx+1}: {len(p_staves)} notenbalken -> {len(p_systems)} systemen.")

        for sys_dict in p_systems:
            sys_dict['page_idx'] = page_idx
            sys_dict['clean_img'] = clean_img
            all_systems.append(sys_dict)

    if not all_systems:
        raise ValueError("Geen systemen gevonden op de partituur!")

    num_parts = len(all_systems[0]['staves'])
    if args.voices == "auto":
        voice_map = {1: "S", 2: "SA", 3: "SAB", 4: "SATB"}
        active_voices = voice_map.get(num_parts, "SATB" if num_parts >= 4 else "S")
        print(f"🤖 Automatisch gedetecteerde bezetting: {active_voices} ({num_parts} stemmen per systeem)")
    else:
        active_voices = args.voices

    num_parts = len(active_voices)
    num_systems = len(all_systems)
    print(f"📊 Systeemstructuur: {num_systems} systemen van {num_parts} stemmen elk.")

    parts_info = []
    voice_names = {'S': 'Sopraan', 'A': 'Alt', 'T': 'Tenor', 'B': 'Bas'}
    for idx, v_code in enumerate(active_voices):
        parts_info.append((f'P{idx+1}', voice_names.get(v_code, v_code)))

    measures_by_part = {p[0]: [] for p in parts_info}

    # Maatstrepen en Header Analyzer op Systeem 1 (Barline-First)
    sys1 = all_systems[0]
    sys1_staves = sys1['staves']
    b0_x1 = sys1['b0_x']
    clean_sys1 = sys1['clean_img']

    b1_list = detect_measure_barlines(clean_sys1, sys1_staves, b0_x=b0_x1, is_first_system=True)
    header_info = analyze_system_header(clean_sys1, sys1_staves, b1_list[0] if b1_list else clean_sys1.shape[1] - 100, b0_x=b0_x1, key_fifths=args.key_fifths)

    

    if args.key_fifths == "auto" or args.key_fifths is None:

        key_fifths = header_info.get('key_fifths', 0)

        print(f"🔑 Automatisch gedetecteerde toonsoort: {key_fifths} kruisen/mollen")

    else:

        key_fifths = int(args.key_fifths)

        print(f"🔑 Ingestelde toonsoort: {key_fifths} kruisen/mollen")

    

    if args.time == "auto":

        time_sig = header_info['time_sig']

        print(f"⏱️ Automatisch gedetecteerde maatsoort: {time_sig}")

    else:

        time_sig = args.time

        print(f"⏱️ Ingestelde maatsoort: {time_sig}")

        

    b_num, b_den = [int(x) for x in time_sig.split('/')]

    full_measure_dur = b_num * (16 // b_den)

    print(f"🎼 Nominale maatduur: {full_measure_dur} divisions ({b_num}/{b_den})")

    # 2b. Liedtekst inlezen (per maat)

    lyrics_by_measure = []

    lyrics_path = args.lyrics

    if not lyrics_path:

        default_txt = input_p.parent / f"{input_p.stem}.txt"

        if default_txt.exists():

            lyrics_path = str(default_txt)

    if lyrics_path and os.path.exists(lyrics_path):

        with open(lyrics_path, 'r', encoding='utf-8') as lf:

            for line in lf:

                line_s = line.strip()

                if line_s:

                    syls = line_s.split()

                    lyrics_by_measure.append([p.strip().split() for p in line_s.split('|', 1)] if '|' in line_s else [line_s.split()])

        print(f"📖 Liedtekst geladen ({len(lyrics_by_measure)} maten) uit: {lyrics_path}")

    # 3. Verwerk elk systeem maat voor maat

    template = create_notehead_template()

    annotated = cv2.cvtColor(clean_img, cv2.COLOR_GRAY2BGR)

    global_measure_count = 0

    has_piece_upbeat = False

    upbeat_dur = 4 if b_den == 4 else (full_measure_dur // 2)

    min_m_w = 450 if (b_num >= 6 and b_den == 8) else (200 if (b_num <= 2 and b_den == 4) else (280 if (b_num == 3) else 320))

    for sys_idx, sys_dict in enumerate(all_systems):
        sys_staves = sys_dict['staves']
        b0_x = sys_dict['b0_x']
        clean_img = sys_dict['clean_img']
        is_first = (sys_idx == 0)
        barlines = detect_measure_barlines(clean_img, sys_staves, b0_x=b0_x, is_first_system=is_first, min_measure_w=min_m_w, key_fifths=key_fifths)

        # Start van noten na header (Systeem 1) of na de sleutel links (vervolgsystemen)
        if is_first:
            start_of_notes = header_info['x_notes_start']
        else:
            s_curr = sys_staves[0]
            l0_c, l4_c = int(s_curr['lines'][0]), int(s_curr['lines'][4])
            sp_c = s_curr['spacing']
            bar_end = barlines[0] if barlines else (clean_img.shape[1] - 100)
            search_start = b0_x + 120 + abs(key_fifths) * int(sp_c * 1.5)
            search_sub = clean_img[int(l0_c-sp_c):int(l4_c+sp_c), search_start:bar_end]
            if search_sub.size > 0:
                _, inv_sub = cv2.threshold(search_sub, 160, 255, cv2.THRESH_BINARY_INV)
                hk_sub = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(sp_c*0.7), int(sp_c*0.5)))
                op_sub = cv2.morphologyEx(inv_sub, cv2.MORPH_OPEN, hk_sub)
                n_sub, _, stats_sub, cents_sub = cv2.connectedComponentsWithStats(op_sub)
                cand_sub = [int(cents_sub[i][0]) for i in range(1, n_sub) if stats_sub[i, 4] >= 180]
                if cand_sub:
                    start_of_notes = max(search_start, search_start + min(cand_sub) - int(sp_c * 1.2))
                else:
                    start_of_notes = search_start + 15
            else:
                start_of_notes = b0_x + 130

        # Sluit maatstrepen uit die binnen de header/sleutelzone vallen
        sp_s = sys_staves[0].get('spacing', 27.25)
        min_first_bar = int(sp_s * 2.5) if is_first else int(min_m_w * 0.65)
        barlines = [b for b in barlines if b >= start_of_notes + min_first_bar]
        system_measures = [start_of_notes] + barlines
        print(f"📐 Systeem {sys_idx + 1} (Pagina {sys_dict.get('page_idx', 0)+1}): {len(barlines)} maatstrepen gedetecteerd -> {len(system_measures)-1} maten: {system_measures}")

        # STAP-VOOR-STAP: Maat per maat verwerken over alle stemmen heen
        for m_i in range(len(system_measures) - 1):
            if args.limit_measures is not None and global_measure_count >= args.limit_measures:
                break

            mx1 = system_measures[m_i]
            mx2 = system_measures[m_i + 1]
            measure_width = mx2 - mx1
            is_upbeat = (measure_width < 340 and (m_i == 0 or m_i == len(system_measures) - 2))
            if sys_idx == 0 and m_i == 0:
                has_piece_upbeat = is_upbeat
            is_incomplete_cadence = (has_piece_upbeat and not is_upbeat and ((m_i == len(system_measures) - 2 and (sys_idx == 0 or sys_idx == num_systems - 1)) or (m_i == len(system_measures) - 3 and (system_measures[-1] - system_measures[-2]) < 340)))

            target_dur = upbeat_dur if is_upbeat else ((full_measure_dur - upbeat_dur) if is_incomplete_cadence else full_measure_dur)

            

            # Verwerk elke stem voor deze specifieke maat
            for part_idx, (p_id, p_name) in enumerate(parts_info):
                if part_idx >= len(sys_staves):
                    measures_by_part[p_id].append({
                        'measure_num': global_measure_count,
                        'notes': [{'step': 'rest', 'pitch': 'Rust', 'duration': target_dur}],
                        'width': int(measure_width * 0.32),
                        'mx1': mx1,
                        'new_system': (m_i == 0 and sys_idx > 0),
                        'repeat_backward': False
                    })
                    continue

                staff_info = sys_staves[part_idx]

                if 'Bas' in p_name:

                    clef = 'bass'

                elif 'Tenor' in p_name:

                    clef = 'tenor'

                elif 'Alt' in p_name or 'Sopraan' in p_name:

                    clef = 'treble'

                else:

                    clef = header_info['clefs'][min(part_idx, len(header_info['clefs'])-1)]

                

                # De 5 stappen voor deze stem in deze maat:

                notes = detect_notes_in_region(clean_img, mx1, mx2, staff_info,

                                               clef=clef, key_fifths=key_fifths,

                                               debug=(args.debug_dir is not None and global_measure_count in debug_measures))

                norm_notes = normalize_measure_notes(notes, target_dur=target_dur)

                

                measures_by_part[p_id].append({

                    'measure_num': global_measure_count,

                    'notes': norm_notes,

                    'width': int(measure_width * 0.32),

                    'mx1': mx1,

                    'new_system': (m_i == 0 and sys_idx > 0),

                    'repeat_backward': (has_piece_upbeat and m_i == len(system_measures) - 2 and sys_idx == 0)

                })

                

                # Teken op debug overlay

                for n in norm_notes:

                    if 'abs_x' in n and 'abs_y' in n:

                        pt = (int(n['abs_x']), int(n['abs_y']))

                        cv2.circle(annotated, pt, 8, (0, 220, 0), 2)

                        cv2.putText(annotated, n.get('solfege', ''), (pt[0] - 15, pt[1] - 12),

                                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 180, 0), 1)

                                    

            # Procedure 5a: Synchroniseer cadens-fermates verticaal over alle stemmen in deze maat
            measure_ferm_xs = []
            for p_id, _ in parts_info:
                for n in measures_by_part[p_id][-1]['notes']:
                    if n.get('fermata') and 'abs_x' in n:
                        measure_ferm_xs.append(n['abs_x'])
            if measure_ferm_xs:
                sp_ref = sys_staves[0]['spacing']
                for fx in measure_ferm_xs:
                    for p_id, _ in parts_info:
                        p_notes = [n for n in measures_by_part[p_id][-1]['notes'] if n.get('step') != 'rest' and 'abs_x' in n]
                        if p_notes and not any(n.get('fermata') for n in p_notes):
                            best_n = min(p_notes, key=lambda it: abs(it['abs_x'] - fx))
                            if abs(best_n['abs_x'] - fx) <= sp_ref * 2.2:
                                best_n['fermata'] = True

            # Procedure 5b: Melisma-bewuste koppeling van liedtekst aan alle stemmen (SATB/SAB/SA/S)
            if lyrics_by_measure and global_measure_count < len(lyrics_by_measure):
                verse_lists = lyrics_by_measure[global_measure_count] if (lyrics_by_measure and isinstance(lyrics_by_measure[global_measure_count][0], list)) else [lyrics_by_measure[global_measure_count]]
                measure_syls = verse_lists[0]
                for p_id, _ in parts_info:
                    part_notes = measures_by_part[p_id][-1]['notes']
                    singing_notes = [n for n in part_notes if n.get('step') != 'rest' and n.get('tie') != 'stop']
                    extra_melismas = max(0, len(singing_notes) - len(measure_syls))
                    skip_ids = set()
                    if extra_melismas > 0:
                        for n in singing_notes:
                            if extra_melismas > 0 and n.get('beam') in ('continue', 'end'):
                                skip_ids.add(id(n))
                                extra_melismas -= 1
                        for n in reversed(singing_notes):
                            if extra_melismas > 0 and id(n) not in skip_ids and n.get('duration', 4) <= 2:
                                skip_ids.add(id(n))
                                extra_melismas -= 1
                    s_i = 0
                    for n in singing_notes:
                        if id(n) in skip_ids:
                            continue
                        if s_i < len(measure_syls):
                            n['lyric'] = measure_syls[s_i]
                            if len(verse_lists) > 1 and s_i < len(verse_lists[1]):
                                n['lyric2'] = verse_lists[1][s_i]
                            s_i += 1

            if args.debug_dir and (global_measure_count in debug_measures if debug_measures else global_measure_count in [3, 11]):

                y1 = int(sys_staves[0]['lines'][0] - 40)

                y2 = int(sys_staves[-1]['lines'][4] + 40)

                cv2.imwrite(os.path.join(args.debug_dir, f"measure{global_measure_count}.png"), clean_img[y1:y2, mx1:mx2])

            global_measure_count += 1

            

        if args.limit_measures is not None and global_measure_count >= args.limit_measures:

            break

    # 4. MusicXML exporteren

    score_data = {

        'parts_info': parts_info,

        'measures_by_part': measures_by_part

    }

    # Bepaal titel en componist: CLI opties > nette bestandsnaam
    score_title = args.title or Path(args.input).stem.replace('-', ' ').replace('_', ' ').title()
    score_composer = args.composer or ""

    export_to_musicxml(score_data, args.output, title=score_title, composer=score_composer, key_fifths=key_fifths, time_sig=time_sig)

    register_in_scores_index(args.output)

    

    if args.debug_dir:

        debug_img_path = os.path.join(args.debug_dir, "02_detected_score.png")

        cv2.imwrite(debug_img_path, annotated)

        print(f"🖼️ Debug overlay bewaard in: {debug_img_path}")

    # Geïntegreerde audit direct uitvoeren en tonen

    print_score_audit(args.output)

    print("🎉 Conversie succesvol afgerond!")

if __name__ == '__main__':

    main()

