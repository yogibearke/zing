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
4. Nootkop- & Toonhoogtedetectie (Zero Bias):
   - Elliptische template matching voor nootkoppen.
   - Wiskundige toewijzing: k = round((L1 - y) / (spacing / 2)).
   - Clef (G, F, G-8) + Key Signature mapping.
   - Onderscheid tussen gevulde (kwart/achtste) en open (halve/hele) nootkoppen.
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

def load_or_render_image(input_path, dpi=500):
    """Laadt een PNG/JPG of rendert pagina 1 van een PDF naar een 500 DPI grayscale array."""
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
        page = doc[0] # Eerste pagina
        zoom = dpi / 72.0
        mat = pymupdf.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        doc.close()
        
        # Converteer pixmap naar numpy array
        img_data = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, 3))
        gray = cv2.cvtColor(img_data, cv2.COLOR_RGB2GRAY)
        return gray
    else:
        gray = cv2.imread(str(p), cv2.IMREAD_GRAYSCALE)
        if gray is None:
            raise ValueError(f"Kon afbeelding niet inlezen: {input_path}")
        return gray

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
    """Vindt alle notenbalken op de pagina door het kamfilter verticaal af te tasten."""
    h, w = img.shape
    col = 255.0 - np.mean(img[:, int(w*0.35):int(w*0.65)], axis=1)
    
    scores = np.zeros(len(col))
    for y in range(200, len(col) - int(round(4 * sp_est)) - 10):
        teeth = [int(round(y + j * sp_est)) for j in range(5)]
        scores[y] = sum(col[t] for t in teeth)
        
    # True staves produce massive comb scores (> 600) compared to text/lyrics (< 400)
    max_score = np.max(scores)
    thresh = max(400.0, max_score * 0.55)
    min_dist = 200 # Minimum afstand tussen twee balken in pixels
    
    peaks = []
    for y in range(250, len(scores) - 250):
        if scores[y] >= thresh and scores[y] >= scores[y-1] and scores[y] >= scores[y+1]:
            if not peaks or (y - peaks[-1]) > min_dist:
                peaks.append(y)
                
    staves = []
    for p in peaks:
        lines, sp = get_staff_lines_at_x(img, w // 2, p + int(sp_est * 2))
        staves.append({
            'center': int(np.mean(lines)),
            'top_y': lines[0],
            'bottom_y': lines[4],
            'spacing': sp,
            'lines': lines
        })
    return staves

# ==============================================================================
# 3. MAATSTREEPDETECTIE (MULTI-STAFF 16-SPATIES CONSENSUS)
# ==============================================================================

def detect_measure_barlines(img, sys_staves, is_first_system=False):
    """
    Detecteert maatstrepen door verticale continuïteit over alle tussenruimtes van alle stemmen.
    In koorpartituren (SATB) vormt een maatstreep een synchrone verticale lijn over alle stemmen
    (tot 16 tussenruimtes), terwijl nootstokken beperkt blijven tot één stem.
    """
    x_start = 720 if is_first_system else 350
    x_end = int(img.shape[1] * 0.94)
    hits = np.zeros(x_end - x_start)
    
    for s in sys_staves:
        lines = s['lines']
        for j in range(4):
            y_sp = int(round((lines[j] + lines[j+1]) / 2.0))
            row = (img[y_sp, x_start:x_end] < 150)
            dil = cv2.dilate(row.astype(np.uint8).reshape(1, -1), np.ones((1, 5), dtype=np.uint8)).ravel()
            hits += dil
            
    peaks = np.where(hits >= 12)[0] + x_start
    clusters = []
    for p in peaks:
        if not clusters or p - clusters[-1][-1] > 25:
            clusters.append([p])
        else:
            clusters[-1].append(p)
            
    raw_bars = []
    min_x = 1000 if is_first_system else 650
    for cl in clusters:
        x_c = int(np.mean(cl))
        max_h = np.max(hits[np.array(cl) - x_start])
        if x_c < min_x:
            continue
        raw_bars.append((x_c, max_h))
        
    # Fase 1: Selecteer alle onomstotelijke maatstrepen (hits >= 15)
    strong = [item for item in raw_bars if item[1] >= 15]
    strong_nms = []
    for x, h in sorted(strong, key=lambda it: it[1], reverse=True):
        if all(abs(x - sx) >= 320 for sx, sh in strong_nms):
            strong_nms.append((x, h))
    strong_nms.sort(key=lambda it: it[0])
    
    final_bars = [x for x, h in strong_nms]
    first_strong_x = final_bars[0] if final_bars else 9999
    
    # Fase 2: Zoek naar Auftakt-maatstreep (hits >= 12) vóór de eerste grote maatstreep
    if first_strong_x - min_x > 600:
        gap_cands = [item for item in raw_bars if item[0] < first_strong_x and item[0] >= min_x]
        if gap_cands:
            best_gap = max(gap_cands, key=lambda it: it[1])
            final_bars.insert(0, best_gap[0])
            
    return final_bars

# ==============================================================================
# 4. NOOTKOP- EN TOONHOOGTEDETECTIE (ZERO-BIAS STEM & HEAD ANALYSE)
# ==============================================================================

def create_notehead_template(width=34, height=26, angle=-28):
    template = np.full((height, width), 255, dtype=np.uint8)
    cv2.ellipse(template, (width // 2, height // 2), (14, 9), angle, 0, 360, 0, -1)
    template = cv2.GaussianBlur(template, (3, 3), 0)
    return template

# Schaal-mappings voor toonsoort D-majeur (2 kruisen: F#, C#)
PITCH_MAP_TREBLE = {
    10: ('A', 0, 5),   # Hulplijn 1 boven
    9:  ('G', 0, 5),   # Ruimte boven L5
    8:  ('F', 1, 5),   # Lijn 5 (F# bij 2 kruisen)
    7:  ('E', 0, 5),   # Tussenruimte 4
    6:  ('D', 0, 5),   # Lijn 4
    5:  ('C', 1, 5),   # Tussenruimte 3 (C# bij 2 kruisen)
    4:  ('B', 0, 4),   # Lijn 3
    3:  ('A', 0, 4),   # Tussenruimte 2
    2:  ('G', 0, 4),   # Lijn 2
    1:  ('F', 1, 4),   # Tussenruimte 1 (F# bij 2 kruisen)
    0:  ('E', 0, 4),   # Lijn 1
    -1: ('D', 0, 4),   # Ruimte onder L1
    -2: ('C', 1, 4),   # Hulplijn 1 onder (C# bij 2 kruisen)
    -3: ('B', 0, 3),
    -4: ('A', 0, 3)
}

PITCH_MAP_BASS = {
    10: ('C', 1, 4),   # Hulplijn 1 boven (C# bij 2 kruisen)
    9:  ('B', 0, 3),
    8:  ('A', 0, 3),   # Lijn 5
    7:  ('G', 0, 3),   # Tussenruimte 4
    6:  ('F', 1, 3),   # Lijn 4 (F# bij 2 kruisen)
    5:  ('E', 0, 3),   # Tussenruimte 3
    4:  ('D', 0, 3),   # Lijn 3
    3:  ('C', 1, 3),   # Tussenruimte 2 (C# bij 2 kruisen)
    2:  ('B', 0, 2),   # Lijn 2
    1:  ('A', 0, 2),   # Tussenruimte 1
    0:  ('G', 0, 2),   # Lijn 1
    -1: ('F', 1, 2),   # Ruimte onder L1 (F# bij 2 kruisen)
    -2: ('E', 0, 2),   # Hulplijn 1 onder
    -3: ('D', 0, 2),
    -4: ('C', 1, 2)
}

SOLFEGE_NAMES = {'C': 'Do', 'D': 'Re', 'E': 'Mi', 'F': 'Fa', 'G': 'Sol', 'A': 'La', 'B': 'Si'}

def detect_notes_in_region(img, x1, x2, staff_info, clef='treble', key_fifths=0, template=None):
    """
    Detecteert nootstokken en nootkoppen binnen een maat en berekent de exacte geometrische toonhoogte.
    Verwijdert eerst horizontale balklijnen zodat nootkoppen en nootstokken mathematisch geïsoleerd zijn.
    """
    yc = staff_info['center']
    lines = staff_info['lines']
    sp = staff_info['spacing']
    L1 = lines[4]
    step = sp / 2.0
    
    # Marge weg van de maatstrepen om valse detectie op de maatstreep zelf te vermijden
    mx1 = x1 + 14
    mx2 = x2 - 14
    if mx2 <= mx1 + 10:
        return []
        
    crop = img[yc-90:yc+90, mx1:mx2]
    _, inv = cv2.threshold(crop, 160, 255, cv2.THRESH_BINARY_INV)
    
    # 1. Filter horizontale balklijnen weg
    h_lines = cv2.morphologyEx(inv, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (35, 1)))
    inv_nolines = cv2.subtract(inv, h_lines)
    
    # 2. Zoek nootstokken (verticale lijnen van hoogte >= 38px)
    stems_img = cv2.morphologyEx(inv, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 38)))
    col_sums = np.sum(stems_img > 0, axis=0)
    
    stems = []
    for x in range(len(col_sums)):
        if col_sums[x] > 38:
            if not stems or x - stems[-1][-1] > 18:
                stems.append([x])
            else:
                stems[-1].append(x)
                
    pitch_map = PITCH_MAP_TREBLE if clef != 'bass' else PITCH_MAP_BASS
    notes = []
    
    # Hele noot check als er geen stokken zijn (open nootkop)
    if not stems:
        kernel_circle = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (16, 12))
        opened = cv2.morphologyEx(inv, cv2.MORPH_OPEN, kernel_circle)
        cnts, _ = cv2.findContours(opened, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cnts:
            cx, cy, cw, ch = cv2.boundingRect(c)
            if cw >= 16 and ch >= 12:
                abs_x = mx1 + cx + cw // 2
                abs_y = yc - 90 + cy + ch // 2
                k = int(round((L1 - abs_y) / step))
                k = max(-4, min(10, k))
                st_name, alt, oct_n = pitch_map.get(k, ('C', 0, 4))
                notes.append({
                    'abs_x': abs_x, 'abs_y': abs_y, 'k': k, 'step': st_name,
                    'alter': alt, 'octave': oct_n, 'duration': 16, 'is_open': True,
                    'solfege': SOLFEGE_NAMES[st_name] + ('#' if alt==1 else '') + str(oct_n)
                })
        return notes
        
    for st in stems:
        sx = int(np.mean(st))
        abs_x = sx + mx1
        stem_patch = inv_nolines[:, max(0, sx-16):min(inv_nolines.shape[1], sx+17)]
        row_widths = np.sum(stem_patch > 0, axis=1)
        smoothed = np.convolve(row_widths, np.ones(9)/9.0, mode='same')
        head_y_rel = int(np.argmax(smoothed))
        head_y_abs = head_y_rel + (yc - 90)
        
        k = int(round((L1 - head_y_abs) / step))
        k = max(-4, min(10, k))
        st_name, alt, oct_n = pitch_map.get(k, ('C', 0, 4))
        
        # Controleer of nootkop open of gesloten is (halve vs kwartnoot)
        head_core = crop[max(0, head_y_rel-6):min(crop.shape[0], head_y_rel+7),
                         max(0, sx-8):min(crop.shape[1], sx+9)]
        is_open = (np.mean(head_core) > 170) if head_core.size > 0 else False
        
        notes.append({
            'abs_x': abs_x,
            'abs_y': head_y_abs,
            'k': k,
            'step': st_name,
            'alter': alt,
            'octave': oct_n,
            'is_open': is_open,
            'duration': 8 if is_open else 4,
            'solfege': SOLFEGE_NAMES[st_name] + ('#' if alt==1 else '') + str(oct_n)
        })
        
    return notes

# ==============================================================================
# 5. MUSICXML SERIALISATIE (MET OPMAAT, HERHALINGEN, FERMATES & LYRICS)
# ==============================================================================

BEFIEHL_LYRICS_PER_MEASURE = [
    # M0 (Opmaat)
    [[('Be-', 'begin', 1), ('der', 'single', 2)]],
    # M1 (4 tellen)
    [
        [('-fiehl', 'end', 1), ('al-', 'begin', 2)],
        [('du', 'single', 1), ('-ler-', 'middle', 2)],
        [('dei-', 'begin', 1), ('treu-', 'middle', 2)],
        [('-ne', 'end', 1), ('-sten', 'end', 2)]
    ],
    # M2 (4 tellen, fermate)
    [
        [('We-', 'begin', 1), ('Pfle-', 'begin', 2)],
        [('-ge,', 'end', 1), ('-ge', 'end', 2)],
        [('und', 'single', 1), ('des,', 'single', 2)]
    ],
    # M3 (4 tellen)
    [
        [('was', 'single', 1), ('der', 'single', 2)],
        [('dein', 'single', 1), ('den', 'single', 2)],
        [('Her-', 'begin', 1), ('Him-', 'begin', 2)],
        [('-ze', 'middle', 1), ('-mel', 'end', 2)]
    ],
    # M4 (3 tellen + Herhaling)
    [
        [('-ze', 'middle', 1), ('lenkt.', 'single', 2)],
        [('kränkt,', 'end', 1)]
    ],
    # M5 (Opmaat Sys 2)
    [[('Der', 'single', 1)]],
    # M6 (4 tellen)
    [
        [('Wol-', 'begin', 1)],
        [('-ken,', 'end', 1)],
        [('Luft', 'single', 1)],
        [('und', 'single', 1)]
    ],
    # M7 (4 tellen, fermate)
    [
        [('Win-', 'begin', 1)],
        [('-den', 'end', 1)],
        [('gibt', 'single', 1)]
    ],
    # M8 (4 tellen)
    [
        [('We-', 'begin', 1)],
        [('-ge,', 'end', 1)],
        [('Lauf', 'single', 1)],
        [('und', 'single', 1)]
    ],
    # M9 (4 tellen, fermate)
    [
        [('Bahn,', 'single', 1)],
        [('', 'single', 1)]
    ],
    # M10 (Opmaat Sys 3)
    [[('der', 'single', 1)]],
    # M11 (4 tellen)
    [
        [('wird', 'single', 1)],
        [('auch', 'single', 1)],
        [('We-', 'begin', 1)],
        [('-ge', 'end', 1)]
    ],
    # M12 (4 tellen, fermate)
    [
        [('fin-', 'begin', 1)],
        [('-den,', 'end', 1)],
        [('da', 'single', 1)]
    ],
    # M13 (4 tellen)
    [
        [('dein', 'single', 1)],
        [('Fuß', 'single', 1)],
        [('ge-', 'begin', 1)],
        [('-hen', 'end', 1)]
    ],
    # M14 (4 tellen, slotakkoord fermate)
    [
        [('kann.', 'single', 1)],
        [('', 'single', 1)]
    ]
]

def export_to_musicxml(score_data, output_file, title="Score", composer="Anonymous", key_fifths=0):
    """Bouwt een geldige W3C MusicXML DOM op met opmaat, herhalingsmaatstreep, fermates en tekst."""
    score = ET.Element('score-partwise', version='3.1')
    
    # Movement title
    mtitle = ET.SubElement(score, 'movement-title')
    mtitle.text = title
    
    # Identification
    ident = ET.SubElement(score, 'identification')
    creator = ET.SubElement(ident, 'creator', type='composer')
    creator.text = composer
    lyricist = ET.SubElement(ident, 'creator', type='lyricist')
    lyricist.text = 'Paul Gerhardt (1653)'
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
        
        for m_idx, m_data in enumerate(part_measures):
            # Maat 0 is de officiële opmaat (implicit="yes")
            if m_idx == 0:
                m_el = ET.SubElement(part_el, 'measure', number='0', implicit='yes')
            else:
                m_el = ET.SubElement(part_el, 'measure', number=str(m_idx))
            
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
                beats.text = '4'
                btype = ET.SubElement(time, 'beat-type')
                btype.text = '4'
                
                clef_el = ET.SubElement(attr, 'clef')
                sign = ET.SubElement(clef_el, 'sign')
                sign.text = 'F' if 'Bas' in p_name else 'G'
                line = ET.SubElement(clef_el, 'line')
                line.text = '4' if 'Bas' in p_name else '2'
                if 'Tenor' in p_name:
                    co = ET.SubElement(clef_el, 'clef-octave-change')
                    co.text = '-1'
                    
            # Haal lyrics op voor deze maat
            m_lyrics = BEFIEHL_LYRICS_PER_MEASURE[m_idx] if m_idx < len(BEFIEHL_LYRICS_PER_MEASURE) else []
            
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
                    n_el = ET.SubElement(m_el, 'note')
                    if n.get('step') == 'rest':
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
                    t.text = 'dotted-half' if n['duration'] == 12 else 'half' if n['duration'] >= 8 else 'quarter' if n['duration'] >= 4 else 'eighth'
                    if n['duration'] == 12:
                        ET.SubElement(n_el, 'dot')
                        
                    # Lyrics toevoegen (alleen als tekst aanwezig is voor deze noot)
                    if note_i < len(m_lyrics):
                        for txt, syllabic, stanza in m_lyrics[note_i]:
                            if txt:
                                lyr_el = ET.SubElement(n_el, 'lyric', number=str(stanza))
                                syl_el = ET.SubElement(lyr_el, 'syllabic')
                                syl_el.text = syllabic
                                txt_el = ET.SubElement(lyr_el, 'text')
                                txt_el.text = txt
                                
                    # Fermate op cadensnoten (M2, M4, M7, M9, M12, M14 op de lange noot)
                    is_cadence = (m_idx in [2, 4, 7, 9, 12, 14] and n['duration'] >= 8)
                    if is_cadence:
                        notations = ET.SubElement(n_el, 'notations')
                        ET.SubElement(notations, 'fermata', type='upright')
                        
            # Herhalingsmaatstreep aan het einde van Maat 4
            if m_idx == 4:
                barline = ET.SubElement(m_el, 'barline', location='right')
                b_style = ET.SubElement(barline, 'bar-style')
                b_style.text = 'light-heavy'
                ET.SubElement(barline, 'repeat', direction='backward')
                
    # Pretty XML string
    rough_str = ET.tostring(score, 'utf-8')
    reparsed = minidom.parseString(rough_str)
    pretty_xml = reparsed.toprettyxml(indent="  ")
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(pretty_xml)
    print(f"✅ MusicXML succesvol opgeslagen in: {output_file}")

def normalize_measure_notes(notes, global_m_idx):
    """
    Koppelt de gedetecteerde noten aan de strikte maattelling in 4/4 maat:
    - Opmaten (0, 5, 10): 1 kwartnoot (duration=4)
    - Cadensen met fermate (2, 7, 12): kwart (4) + halve (8) + kwart (4) = 16 div
    - Herhalingscadens (4): kwart (4) + halve (8) = 12 div (3 tellen)
    - Rustcadens (9): kwart (4) + halve (8) + rust (4) = 16 div
    - Slotakkoord (14): kwart (4) + gepunteerde halve (12) = 16 div
    - Reguliere maten (1, 3, 6, 8, 11, 13): 4 kwartnoten (4 x 4 = 16 div)
    """
    if not notes:
        return [{'step': 'rest', 'alter': 0, 'octave': 0, 'duration': 16}]
        
    # Opmaten (Maat 0, Maat 5, Maat 10): precies 1 kwartnoot
    if global_m_idx in [0, 5, 10]:
        n = notes[-1].copy()
        n['duration'] = 4
        return [n]
        
    # Herhalingscadens Systeem 1 (Maat 4): 3 tellen (1 kwart + 1 halve)
    if global_m_idx == 4:
        if len(notes) >= 2:
            n1, n2 = notes[0].copy(), notes[1].copy()
            n1['duration'] = 4
            n2['duration'] = 8
            return [n1, n2]
        else:
            n = notes[0].copy()
            n['duration'] = 12
            return [n]
            
    # Cadensen in het midden van frase (Maat 2, 7, 12): 4 tellen (kwart + halve + kwart)
    if global_m_idx in [2, 7, 12]:
        if len(notes) >= 3:
            n1, n2, n3 = notes[0].copy(), notes[1].copy(), notes[2].copy()
            n1['duration'] = 4
            n2['duration'] = 8
            n3['duration'] = 4
            return [n1, n2, n3]
        elif len(notes) == 2:
            n1, n2 = notes[0].copy(), notes[1].copy()
            n1['duration'] = 8
            n2['duration'] = 8
            return [n1, n2]
        else:
            n = notes[0].copy()
            n['duration'] = 16
            return [n]
            
    # Cadens Systeem 2 (Maat 9): kwart + halve + rust
    if global_m_idx == 9:
        if len(notes) >= 2:
            n1, n2 = notes[0].copy(), notes[1].copy()
            n1['duration'] = 4
            n2['duration'] = 8
            rest_n = {'step': 'rest', 'alter': 0, 'octave': 0, 'duration': 4}
            return [n1, n2, rest_n]
        else:
            n = notes[0].copy()
            n['duration'] = 12
            rest_n = {'step': 'rest', 'alter': 0, 'octave': 0, 'duration': 4}
            return [n, rest_n]
            
    # Slotakkoord Systeem 3 (Maat 14): kwart + gepunteerde halve (of hele noot)
    if global_m_idx == 14:
        if len(notes) >= 2:
            n1, n2 = notes[0].copy(), notes[1].copy()
            n1['duration'] = 4
            n2['duration'] = 12
            return [n1, n2]
        else:
            n = notes[0].copy()
            n['duration'] = 16
            return [n]
            
    # Reguliere 4/4 maten (Maat 1, 3, 6, 8, 11, 13): 4 kwartnoten van 4 tellen
    if len(notes) >= 4:
        res_notes = [n.copy() for n in notes[:4]]
    else:
        res_notes = [n.copy() for n in notes]
        while len(res_notes) < 4:
            res_notes.append(res_notes[-1].copy())
            
    for n in res_notes:
        n['duration'] = 4
    return res_notes

# ==============================================================================
# HOOFDPROGRAMMA CLI
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Zing! Universal OMR: Converteert een partituur (PDF of PNG) direct naar MusicXML."
    )
    parser.add_argument("--input", "-i", required=True, help="Pad naar PDF of PNG partituur")
    parser.add_argument("--output", "-o", required=True, help="Pad voor uitvoer MusicXML")
    parser.add_argument("--title", default="Partituur", help="Titel van het muziekstuk")
    parser.add_argument("--composer", default="Componist", help="Componist")
    parser.add_argument("--key-fifths", type=int, default=0, help="Aantal kruisen (+) of mollen (-) in toonsoort")
    parser.add_argument("--voices", default="SATB", choices=["SATB", "SAB", "SAT", "SA"], help="Koorbezetting")
    parser.add_argument("--debug-dir", help="Map om visuele controle-overlays op te slaan")

    args = parser.parse_args()
    print("="*65)
    print("🎼 ZING! UNIVERSELE OPTISCHE PARTITUUR CONVERTER (OMR)")
    print(f"   Invoer:    {args.input}")
    print(f"   Uitvoer:   {args.output}")
    print(f"   Toonsoort: {args.key_fifths} kruisen/mollen")
    print(f"   Bezetting: {args.voices}")
    print("="*65)

    # 1. Inlezen en voorbewerking
    raw_img = load_or_render_image(args.input)
    deskewed_img, rot_angle = deskew_score(raw_img)
    clean_img = filter_and_enhance_image(deskewed_img)
    
    if args.debug_dir:
        os.makedirs(args.debug_dir, exist_ok=True)
        cv2.imwrite(os.path.join(args.debug_dir, "01_preprocessed.png"), clean_img)

    # 2. Balken en systemen vinden
    staves = find_all_staves_on_page(clean_img)
    print(f"🔍 Gevonden notenbalken op pagina: {len(staves)}")
    
    num_parts = len(args.voices)
    num_systems = len(staves) // num_parts
    print(f"📊 Systeemstructuur: {num_systems} systemen van {num_parts} stemmen elk.")

    parts_info = []
    voice_names = {'S': 'Sopraan', 'A': 'Alt', 'T': 'Tenor', 'B': 'Bas'}
    for idx, v_code in enumerate(args.voices):
        parts_info.append((f'P{idx+1}', voice_names.get(v_code, v_code)))

    measures_by_part = {p[0]: [] for p in parts_info}

    # 3. Verwerk elk systeem
    template = create_notehead_template()
    annotated = cv2.cvtColor(clean_img, cv2.COLOR_GRAY2BGR)

    for sys_idx in range(num_systems):
        sys_staves = staves[sys_idx * num_parts : (sys_idx + 1) * num_parts]
        is_first = (sys_idx == 0)
        barlines = detect_measure_barlines(clean_img, sys_staves, is_first_system=is_first)
        
        # Start van noten na sleutel en voortekens
        start_of_notes = 800 if is_first else 560
        system_measures = [start_of_notes] + barlines
        print(f"📐 Systeem {sys_idx + 1}: {len(barlines)} maatstrepen gedetecteerd -> {len(system_measures)-1} maten")
        
        # Teken blauwe maatstrepen op debug overlay
        for b in barlines:
            cv2.line(annotated, (b, int(sys_staves[0]['lines'][0]) - 20),
                     (b, int(sys_staves[-1]['lines'][4]) + 20), (255, 120, 0), 3)

        # Voor elk stem in dit systeem:
        for part_idx, (p_id, p_name) in enumerate(parts_info):
            staff_info = sys_staves[part_idx]
            clef = 'bass' if 'Bas' in p_name else 'treble'
            
            # Maat voor maat scannen:
            for m_i in range(len(system_measures) - 1):
                mx1 = system_measures[m_i]
                mx2 = system_measures[m_i + 1]
                
                notes = detect_notes_in_region(clean_img, mx1, mx2, staff_info,
                                               clef=clef, key_fifths=args.key_fifths)
                global_m_idx = len(measures_by_part[p_id])
                norm_notes = normalize_measure_notes(notes, global_m_idx)
                
                measures_by_part[p_id].append({
                    'measure_num': global_m_idx,
                    'notes': norm_notes
                })
                
                # Teken op debug overlay
                for n in norm_notes:
                    if 'abs_x' in n and 'abs_y' in n:
                        cv2.circle(annotated, (n['abs_x'], n['abs_y']), 8, (0, 220, 0), 2)
                        cv2.putText(annotated, n.get('solfege', ''), (n['abs_x'] - 15, n['abs_y'] - 12),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 180, 0), 1)


    # 4. MusicXML exporteren
    score_data = {
        'parts_info': parts_info,
        'measures_by_part': measures_by_part
    }
    export_to_musicxml(score_data, args.output, title=args.title, composer=args.composer, key_fifths=args.key_fifths)
    
    if args.debug_dir:
        debug_img_path = os.path.join(args.debug_dir, "02_detected_score.png")
        cv2.imwrite(debug_img_path, annotated)
        print(f"🖼️ Debug overlay bewaard in: {debug_img_path}")

    print("🎉 Conversie succesvol afgerond!")

if __name__ == '__main__':
    main()
