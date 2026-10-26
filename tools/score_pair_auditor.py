#!/usr/bin/env python3
"""
Zing! - Gesproken Partituur Auditor ("Voice-Assisted Pair-Auditing Tool")
========================================================================
Hiermee controleren we samen noot voor noot elke partituur.
De computer SPREEKT elke noot direct hardop uit in Solfège (Do, Re, Mi, Fa, Sol, La, Si, Rust).

Bediening:
  - Luister naar de uitgesproken noot en kijk op de partituur.
  - Druk simpelweg op <ENTER> (of typ 'ok'): noot is goedgekeurd!
  - Typ een correctie (bv. 'C4' of 'Do' of 'f' voor fout) als de noot niet klopt.
  - Typ 'b': ga één noot terug.
  - Typ 'q': stop en bekijk het audit-rapport.
"""

import sys
import os
import xml.etree.ElementTree as ET
import subprocess
import tempfile
import atexit

# Unicode ondersteuning voor Windows terminal
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Initialiseer Windows Speech Engine via wscript (werkt native zonder extra pip packages)
SPEECH_VBS = os.path.join(tempfile.gettempdir(), "zing_speech_engine.vbs")
try:
    with open(SPEECH_VBS, "w", encoding="utf-8") as f:
        f.write('CreateObject("SAPI.SpVoice").Speak WScript.Arguments(0)\n')
except Exception:
    pass

def speak_solfege(text):
    """Spreekt het solfège-woord (Do, Re, Mi...) asynchroon uit."""
    if not text:
        return
    try:
        if os.path.exists(SPEECH_VBS):
            subprocess.Popen(["wscript", "//nologo", SPEECH_VBS, text], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

STEP_TO_SOLFEGE = {
    'C': 'Do',
    'D': 'Re',
    'E': 'Mi',
    'F': 'Fa',
    'G': 'Sol',
    'A': 'La',
    'B': 'Si'
}

SOLFEGE_TO_STEP = {
    'do': 'C',
    're': 'D',
    'mi': 'E',
    'fa': 'F',
    'sol': 'G',
    'la': 'A',
    'si': 'B'
}

DUR_TYPES = {
    '16th': 'zestiende',
    'eighth': 'achtste',
    'quarter': 'kwart',
    'half': 'halve',
    'whole': 'hele'
}

def parse_musicxml(filepath):
    """Parseert MusicXML en geeft een gestructureerde lijst terug."""
    tree = ET.parse(filepath)
    root = tree.getroot()
    
    parts_data = []
    
    for part in root.findall('part'):
        part_id = part.get('id')
        
        part_name = part_id
        for pinfo in root.findall('.//score-part'):
            if pinfo.get('id') == part_id:
                pname = pinfo.find('part-name')
                if pname is not None and pname.text:
                    part_name = pname.text.strip()
                break
                
        measures = []
        for m in part.findall('measure'):
            m_num = m.get('number', '?')
            notes = []
            for n in m.findall('note'):
                is_chord = n.find('chord') is not None
                is_rest = n.find('rest') is not None
                is_dot = n.find('dot') is not None
                
                tie_elem = n.find('tie')
                tie_type = tie_elem.get('type') if tie_elem is not None else None
                
                slur_elem = n.find('.//slur')
                slur_type = slur_elem.get('type') if slur_elem is not None else None
                
                ntype = n.find('type').text if n.find('type') is not None else ''
                dur_text = n.find('duration').text if n.find('duration') is not None else ''
                
                pitch_str = ''
                solfege_str = ''
                speech_word = ''
                
                if is_rest:
                    pitch_str = 'RUST'
                    solfege_str = 'Rust'
                    speech_word = 'Rust'
                else:
                    p = n.find('pitch')
                    if p is not None:
                        step = p.find('step').text if p.find('step') is not None else ''
                        octave = p.find('octave').text if p.find('octave') is not None else ''
                        alter = p.find('alter')
                        alt_s = ''
                        alt_sol = ''
                        alt_spoken = ''
                        if alter is not None:
                            if alter.text == '1':
                                alt_s = '#'
                                alt_sol = '-kruis'
                                alt_spoken = ' kruis'
                            elif alter.text == '-1':
                                alt_s = 'b'
                                alt_sol = '-mol'
                                alt_spoken = ' mol'
                        pitch_str = f"{step}{alt_s}{octave}"
                        base_sol = STEP_TO_SOLFEGE.get(step, step)
                        solfege_str = f"{base_sol}{alt_sol}{octave}"
                        speech_word = f"{base_sol}{alt_spoken}"
                        
                lyrics = []
                for lyr in n.findall('lyric'):
                    lyr_num = lyr.get('number', '1')
                    txt = lyr.find('text')
                    if txt is not None and txt.text:
                        lyrics.append((lyr_num, txt.text.strip()))
                        
                notes.append({
                    'pitch': pitch_str,
                    'solfege': solfege_str,
                    'speech_word': speech_word,
                    'type': ntype,
                    'duration': dur_text,
                    'is_dot': is_dot,
                    'is_rest': is_rest,
                    'tie': tie_type,
                    'slur': slur_type,
                    'lyrics': lyrics
                })
            measures.append({'measure': m_num, 'notes': notes})
        parts_data.append({'id': part_id, 'name': part_name, 'measures': measures})
    return parts_data

def run_auditor(xml_file=None):
    if not xml_file:
        default_dir = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sample-scores')
        scores = [f for f in os.listdir(default_dir) if f.endswith('.musicxml')]
        print("\n=== Zing! Gesproken Partituur Pair-Auditor ===")
        print("Beschikbare partituren:")
        for idx, s in enumerate(scores, 1):
            print(f"  [{idx}] {s}")
        choice = input("\nKies een partituur [1]: ").strip()
        if choice and choice.isdigit() and 1 <= int(choice) <= len(scores):
            xml_file = os.path.join(default_dir, scores[int(choice)-1])
        else:
            xml_file = os.path.join(default_dir, scores[0])
            
    print(f"\nInladen: {os.path.basename(xml_file)}")
    parts = parse_musicxml(xml_file)
    
    print("\nBeschikbare stemmen:")
    print("  [0] Alle stemmen door elkaar per maat")
    for idx, p in enumerate(parts, 1):
        print(f"  [{idx}] Enkel {p['name']}")
    vchoice = input("Kies stemoptie [0]: ").strip()
    
    selected_voice = 0
    if vchoice and vchoice.isdigit():
        selected_voice = int(vchoice)
        
    start_m = input("Starten vanaf maat [1]: ").strip()
    start_measure = int(start_m) if start_m.isdigit() else 1
    
    work_items = []
    
    if selected_voice == 0:
        max_measures = max(len(p['measures']) for p in parts)
        for m_idx in range(max_measures):
            for p in parts:
                if m_idx < len(p['measures']):
                    m_data = p['measures'][m_idx]
                    m_num = int(m_data['measure']) if m_data['measure'].isdigit() else m_idx+1
                    if m_num >= start_measure:
                        for n_idx, note in enumerate(m_data['notes'], 1):
                            work_items.append({
                                'voice': p['name'],
                                'measure': m_num,
                                'total_measures': max_measures,
                                'note_idx': n_idx,
                                'total_notes': len(m_data['notes']),
                                'data': note
                            })
    else:
        p = parts[selected_voice - 1]
        for m_data in p['measures']:
            m_num = int(m_data['measure']) if m_data['measure'].isdigit() else 1
            if m_num >= start_measure:
                for n_idx, note in enumerate(m_data['notes'], 1):
                    work_items.append({
                        'voice': p['name'],
                        'measure': m_num,
                        'total_measures': len(p['measures']),
                        'note_idx': n_idx,
                        'total_notes': len(m_data['notes']),
                        'data': note
                    })
                    
    print("\n" + "="*65)
    print("START GESPROKEN PAIR-AUDITING")
    print("  - De computer SPREEKT elke noot (Do, Re, Mi, Fa...) hardop uit!")
    print("  - Druk op <ENTER> om de noot GOED TE KEUREN (OK).")
    print("  - Typ een correctie (bv. 'C4', 'Do', of 'f') als de noot fout is.")
    print("  - Typ 'b' om terug te gaan naar de vorige noot.")
    print("  - Typ 'r' om de huidige noot OPNIEUW te laten uitspreken.")
    print("  - Typ 'q' om te stoppen en het rapport te bekijken.")
    print("="*65 + "\n")
    
    idx = 0
    corrections = []
    approved_count = 0
    
    while idx < len(work_items):
        item = work_items[idx]
        n = item['data']
        
        # Spreek de noot hardop uit in Solfège!
        speak_solfege(n['speech_word'])
        
        dot_str = " (gepunct.)" if n['is_dot'] else ""
        type_nl = DUR_TYPES.get(n['type'], n['type']) + dot_str
        
        lyric_str = ""
        if n['lyrics']:
            lyric_parts = [f'"{txt}"' for c, txt in n['lyrics']]
            lyric_str = " | Tekst: " + ", ".join(lyric_parts)
            
        tie_str = f" [Tie: {n['tie']}]" if n['tie'] else ""
        
        # Heldere, prominente weergave van de noot
        solfege_display = n['speech_word'].upper()
        prompt_line = (
            f"[{item['voice']}] Maat {item['measure']}/{item['total_measures']} "
            f"(Noot {item['note_idx']}/{item['total_notes']}):  >>> {solfege_display} <<<  "
            f"({n['pitch']} {type_nl}){tie_str}{lyric_str}"
        )
        
        print(f"\n{prompt_line}")
        ans = input("  [ENTER=OK | 'f'=fout | 'r'=herhaal | 'b'=terug]: ").strip()
        
        if ans.lower() == 'q':
            print("\nAudit onderbroken door gebruiker.")
            break
        elif ans.lower() == 'r':
            # Herhaal uitspraak, blijf op dezelfde noot
            continue
        elif ans.lower() == 'b':
            if idx > 0:
                idx -= 1
                print("  Terug naar vorige noot.")
            else:
                print("  Eerste noot bereikt.")
            continue
        elif ans == '' or ans.lower() == 'ok':
            approved_count += 1
            idx += 1
        else:
            corr_note = ans
            print(f"  [GEREGISTREERD] Correctie voor maat {item['measure']}: '{corr_note}' (was {n['solfege']} / {n['pitch']})")
            corrections.append({
                'voice': item['voice'],
                'measure': item['measure'],
                'note_idx': item['note_idx'],
                'original': n['pitch'],
                'original_solfege': n['solfege'],
                'correction': corr_note,
                'lyrics': lyric_str
            })
            idx += 1
            
    print("\n" + "="*65)
    print("AUDIT RESULTAAT")
    print(f"  [OK] Goedgekeurd: {approved_count} noten")
    print(f"  [!]  Correcties:  {len(corrections)} noten")
    print("="*65)
    
    if corrections:
        print("\nLijst met doorgegeven correcties:")
        for c in corrections:
            print(f"  - [{c['voice']}] Maat {c['measure']}, Noot {c['note_idx']}: {c['original_solfege']} ({c['original']}) -> Correctie: {c['correction']}{c['lyrics']}")
            
        report_file = os.path.splitext(xml_file)[0] + "_audit_report.txt"
        with open(report_file, 'w', encoding='utf-8') as rf:
            rf.write(f"Partituur Audit Rapport: {os.path.basename(xml_file)}\n\n")
            for c in corrections:
                rf.write(f"[{c['voice']}] Maat {c['measure']}, Noot {c['note_idx']}: {c['original_solfege']} ({c['original']}) -> {c['correction']}\n")
        print(f"\nRapport opgeslagen in: {report_file}")
    else:
        print("\nGeen enkele fout gevonden! De partituur is 100% goedgekeurd.")

if __name__ == '__main__':
    arg_file = sys.argv[1] if len(sys.argv) > 1 else None
    run_auditor(arg_file)
