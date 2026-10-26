"""
tools/omr_measure_detector.py
==============================
100% Mechanische Computervisie Score Detector (OMR)
Puur wiskundige en geometrische detectie van partituurscans:
1. Comb-filter staff-line tracking (geen aannames over skew of kromming)
2. Elliptische template-matching voor nootkoppen (ongevoelig voor waardestrepen/stokken)
3. Geometrische pitch-berekening: k = round((L1 - y_noot) / (spacing / 2))
4. Automatische visuele verificatiebeelden met overlays (groene cirkels, rode balklijnen, nootlabels)
"""

import os
import cv2
import numpy as np

SCALE_MAP_TREBLE = {
    10: ('La5', 'A5', 'Hulplijn 1 boven'),
    9:  ('Sol5', 'G5', 'Ruimte boven L5'),
    8:  ('Fa5', 'F5', 'Lijn 5'),
    7:  ('Mi5', 'E5', 'Tussenruimte 4'),
    6:  ('Re5', 'D5', 'Lijn 4'),
    5:  ('Do5', 'C5', 'Tussenruimte 3'),
    4:  ('Si4', 'Bb4', 'Lijn 3'),
    3:  ('La4', 'A4', 'Tussenruimte 2'),
    2:  ('Sol4', 'G4', 'Lijn 2'),
    1:  ('Fa4', 'F4', 'Tussenruimte 1'),
    0:  ('Mi4', 'E4', 'Lijn 1'),
    -1: ('Re4', 'D4', 'Ruimte onder L1'),
    -2: ('Do4', 'C4', 'Hulplijn 1 onder')
}

SCALE_MAP_BASS = {
    10: ('Do4', 'C4', 'Hulplijn 1 boven'),
    9:  ('Si3', 'Bb3', 'Ruimte boven L5'),
    8:  ('La3', 'A3', 'Lijn 5'),
    7:  ('Sol3', 'G3', 'Tussenruimte 4'),
    6:  ('Fa3', 'F3', 'Lijn 4'),
    5:  ('Mi3', 'E3', 'Tussenruimte 3'),
    4:  ('Re3', 'D3', 'Lijn 3'),
    3:  ('Do3', 'C3', 'Tussenruimte 2'),
    2:  ('Si2', 'Bb2', 'Lijn 2'),
    1:  ('La2', 'A2', 'Tussenruimte 1'),
    0:  ('Sol2', 'G2', 'Lijn 1'),
    -1: ('Fa2', 'F2', 'Ruimte onder L1'),
    -2: ('Mi2', 'E2', 'Hulplijn 1 onder')
}

def create_notehead_template(width=40, height=32, angle=-20):
    """Genereert een ideale synthetische nootkop-template."""
    template = np.full((height, width), 255, dtype=np.uint8)
    cv2.ellipse(template, (width // 2, height // 2), (16, 11), angle, 0, 360, 0, -1)
    template = cv2.GaussianBlur(template, (3, 3), 0)
    return template

def get_staff_lines_at_x(full_img, target_x, est_y_center, search_radius=120):
    """
    Vindt via een kam-filter (comb filter) de exacte 5 balklijnen rond een specifieke x-kolom.
    Werkt ongeacht scheefstand of lichte golving van het papier.
    """
    y_min = max(0, est_y_center - search_radius)
    y_max = min(full_img.shape[0], est_y_center + search_radius)
    x_min = max(0, target_x - 40)
    x_max = min(full_img.shape[1], target_x + 40)
    
    slice_col = 255.0 - np.mean(full_img[y_min:y_max, x_min:x_max], axis=1)
    
    best_score = -1
    best_top = 0
    best_sp = 31.5
    
    for sp in np.arange(30.5, 33.0, 0.25):
        max_top = len(slice_col) - int(round(4 * sp)) - 1
        for top_y in range(5, max(6, max_top)):
            teeth = [int(round(top_y + j * sp)) for j in range(5)]
            sc = sum(slice_col[y] for y in teeth)
            if sc > best_score:
                best_score = sc
                best_top = top_y
                best_sp = sp
                
    abs_top = y_min + best_top
    lines = [abs_top + j * best_sp for j in range(5)]
    return lines, best_sp

def detect_measure_notes(image_path, x_range, y_range, est_staff_center, clef='treble',
                         corr_thresh=0.44, output_annotated_path=None):
    """
    Mechanische analyse van één specifieke maat en stem:
    1. Template matching voor nootkoppen
    2. Bepalen van lokale balklijnen per noot
    3. Wiskundige toewijzing van k en toonhoogte
    4. Genereren van annotatiebeeld
    """
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise FileNotFoundError(f"Kon afbeelding niet laden: {image_path}")
        
    x1, x2 = x_range
    y1, y2 = y_range
    crop = img[y1:y2, x1:x2]
    
    template = create_notehead_template()
    tw, th = template.shape[1], template.shape[0]
    
    res = cv2.matchTemplate(crop, template, cv2.TM_CCOEFF_NORMED)
    locs = np.where(res >= corr_thresh)
    pts = sorted(zip(locs[1], locs[0]), key=lambda p: res[p[1], p[0]], reverse=True)
    
    selected = []
    for x, y in pts:
        if all(abs(x - sx) > 28 or abs(y - sy) > 18 for sx, sy in selected):
            # Als er al een kandidaat is op dezelfde stok (|dx| < 25), behoud de bovenste (kleinere y = nootkop)
            same_stem = [cand for cand in selected if abs(x - cand[0]) < 25]
            if same_stem:
                # Als huidige kandidaat hoger ligt dan bestaande, vervang hem
                if y < same_stem[0][1]:
                    selected.remove(same_stem[0])
                    selected.append((x, y))
                continue
            selected.append((x, y))
            
    selected.sort(key=lambda p: p[0])
    scale_map = SCALE_MAP_TREBLE if clef == 'treble' else SCALE_MAP_BASS
    
    notes = []
    annotated = cv2.cvtColor(crop, cv2.COLOR_GRAY2BGR)
    
    # Teken referentie-balklijnen
    for sx in range(0, x2 - x1, 15):
        lines, _ = get_staff_lines_at_x(img, x1 + sx, est_staff_center)
        for ly in lines:
            annotated[int(round(ly - y1)), sx] = [0, 0, 255]
            
    note_idx = 1
    for x, y in selected:
        cx = x + tw // 2
        cy = y + th // 2
        abs_x = x1 + cx
        abs_y = y1 + cy
        
        lines, sp = get_staff_lines_at_x(img, abs_x, est_staff_center)
        L5, L4, L3, L2, L1 = lines
        step = sp / 2.0
        
        # Wiskundige step k
        k = int(round((L1 - abs_y) / step))
        solf, pitch, pos_name = scale_map.get(k, ('?', f'k={k}', '?'))
        
        # Filter vlaggen onder de notenbalk weg als we in treble werken
        if clef == 'treble' and k < -1:
            continue
            
        corr = float(res[y, x])
        notes.append({
            'index': note_idx,
            'x': abs_x,
            'y': abs_y,
            'k': k,
            'solf': solf,
            'pitch': pitch,
            'position': pos_name,
            'correlation': corr
        })
        
        # Visuele overlay
        cv2.circle(annotated, (cx, cy), 10, (0, 255, 0), 2)
        cv2.putText(annotated, f'N{note_idx}:{solf}', (cx - 20, cy - 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 180, 0), 2)
        cv2.putText(annotated, pos_name, (cx - 25, cy + 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, (255, 0, 0), 1)
        note_idx += 1
        
    if output_annotated_path:
        os.makedirs(os.path.dirname(output_annotated_path), exist_ok=True)
        cv2.imwrite(output_annotated_path, annotated)
        
    return notes

if __name__ == '__main__':
    print("=== TEST OMR MEASURE DETECTOR OP MAAT 9 & 10 SOPRAAN ===")
    p2 = 'assets/sample-scores/drink-to-me-only_page_2.png'
    
    print("\n--- Maat 9 Sopraan ---")
    m9 = detect_measure_notes(p2, (750, 2200), (900, 1120), est_staff_center=1020, clef='treble',
                              output_annotated_path='scratch/omr_visual_checks/omr_tool_m9_soprano.png')
    for n in m9:
        print(f"  Noot {n['index']}: {n['solf']} ({n['pitch']}) op {n['position']} (k={n['k']}, x={n['x']}, corr={n['correlation']:.3f})")
        
    print("\n--- Maat 10 Sopraan ---")
    m10 = detect_measure_notes(p2, (2150, 3600), (900, 1120), est_staff_center=1020, clef='treble',
                               output_annotated_path='scratch/omr_visual_checks/omr_tool_m10_soprano.png')
    for n in m10:
        print(f"  Noot {n['index']}: {n['solf']} ({n['pitch']}) op {n['position']} (k={n['k']}, x={n['x']}, corr={n['correlation']:.3f})")
