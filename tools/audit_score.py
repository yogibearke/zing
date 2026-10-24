import xml.etree.ElementTree as ET
import sys
import os

def audit(xml_path=None):
    if xml_path is None:
        xml_path = sys.argv[1] if len(sys.argv) > 1 else 'assets/sample-scores/komt-vrienden-in-het-ronde.musicxml'
    
    if not os.path.exists(xml_path):
        print(f"Bestand niet gevonden: {xml_path}")
        return

    tree = ET.parse(xml_path)
    root = tree.getroot()
    parts = {p.get('id'): p for p in root.findall('part')}
    p1 = parts.get('P1') or list(parts.values())[0]
    m_nums = [m.get('number') for m in p1.findall('measure')]
    
    print(f"=== SATB AUDIT: {os.path.basename(xml_path)} ({len(m_nums)} maten) ===")
    for m_num in m_nums:
        parts_notes = []
        for pid, name in [('P1','Sopraan'), ('P2','Alt'), ('P3','Tenor'), ('P4','Bas')]:
            target_m = None
            for m in parts[pid].findall('measure'):
                if m.get('number') == m_num:
                    target_m = m
                    break
            notes = []
            if target_m is not None:
                for n in target_m.findall('note'):
                    if n.find('rest') is not None:
                        notes.append('Rust')
                    else:
                        p = n.find('pitch')
                        if p is not None:
                            step = p.find('step').text
                            octave = p.find('octave').text
                            alter = p.find('alter')
                            acc = '#' if alter is not None and alter.text == '1' else ('b' if alter is not None and alter.text == '-1' else '')
                            notes.append(f"{step}{acc}{octave}")
            parts_notes.append(f"{name}: {','.join(notes)}")
        
        # Tekst van sopraan
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
        print(f"Maat {m_num:>3} | {' | '.join(parts_notes)} | Tekst: {lyric_str}")

if __name__ == '__main__':
    audit()
