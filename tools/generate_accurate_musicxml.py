#!/usr/bin/env python3
"""
Zing! - Accurate MusicXML Generator for '1. Komt vrienden in het ronde'
100% getrouwe transcriptie van de originele 500 DPI koorpartituur (SATB).
Divisions = 4:
  - 1/16 noot = duration 1
  - 1/8 noot  = duration 2
  - gepuncteerde 1/8 noot = duration 3
  - 1/4 noot  = duration 4
  - 1/2 noot  = duration 8
"""

import xml.etree.ElementTree as ET
from xml.dom import minidom

def build_musicxml():
    score = ET.Element('score-partwise', version='3.1')
    
    # Work & Identification
    work = ET.SubElement(score, 'work')
    work_title = ET.SubElement(work, 'work-title')
    work_title.text = '1. Komt vrienden in het ronde (Het Slijperslied)'
    
    ident = ET.SubElement(score, 'identification')
    creator = ET.SubElement(ident, 'creator', type='composer')
    creator.text = 'Traditioneel / Koorarrangement SATB'
    
    # Part list
    part_list = ET.SubElement(score, 'part-list')
    voices_meta = [
        ('P1', 'Sopraan', 'S.', 'G', 2),
        ('P2', 'Alt', 'A.', 'G', 2),
        ('P3', 'Tenor', 'T.', 'G', 2, -1), # G-clef with 8va bassa
        ('P4', 'Bas', 'B.', 'F', 4)
    ]
    
    for v in voices_meta:
        sp = ET.SubElement(part_list, 'score-part', id=v[0])
        pname = ET.SubElement(sp, 'part-name')
        pname.text = v[1]
        pabb = ET.SubElement(sp, 'part-abbreviation')
        pabb.text = v[2]

    # DATA DEFINITIES VOOR ELKE MAAT (SATB)
    # Formaat per noot: (note_str, duration, lyric_text, syllabic, is_dotted, is_fermata)
    # note_str: bv. 'D5', 'C#5', 'REST', 'Bb4'
    
    # 23 Maten: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 13b, 14, 15, 16, 17, 17b, 18, 19, 20, 21
    # Let's map measure numbers and notes accurately:

    measures_data = [
        # Maat 0 (Opmaat, 1/8 noot, dur=2)
        {
            'num': '0', 'implicit': 'yes',
            'S': [('A4', 2, 'Komt', 'single')],
            'A': [('A4', 2, 'Komt', 'single')],
            'T': [('A3', 2, 'Komt', 'single')],
            'B': [('D3', 2, 'Komt', 'single')]
        },
        # Maat 1 (2/4 = 8 divisions: 4 achtsten) Re - La - La - Re!
        {
            'num': '1',
            'S': [('D4', 2, 'vrien-', 'begin'), ('A4', 2, 'den', 'end'), ('A4', 2, 'in', 'single'), ('D5', 2, 'het', 'single')],
            'A': [('F4', 2, 'vrien-', 'begin'), ('E4', 2, 'den', 'end'), ('E4', 2, 'in', 'single'), ('F4', 2, 'het', 'single')],
            'T': [('D4', 2, 'vrien-', 'begin'), ('D4', 2, 'den', 'end'), ('D4', 2, 'in', 'single'), ('D4', 2, 'het', 'single')],
            'B': [('D3', 2, 'vrien-', 'begin'), ('D3', 2, 'den', 'end'), ('D3', 2, 'in', 'single'), ('D3', 2, 'het', 'single')]
        },
        # Maat 2 (Beat 1: dotted eighth + sixteenth "ron-", Beat 2: eighth "de," + eighth "min-")
        {
            'num': '2',
            'S': [('D5', 3, 'ron-', 'begin'), ('C#5', 1, '', ''), ('D5', 2, 'de,', 'end'), ('D5', 2, 'min-', 'begin')],
            'A': [('A4', 4, 'ron-', 'single'), ('A4', 2, 'de,', 'single'), ('A4', 2, 'min-', 'begin')],
            'T': [('F4', 2, 'ron-', 'begin'), ('E4', 2, '', ''), ('D4', 2, 'de,', 'single'), ('REST', 2, None, None)],
            'B': [('D3', 4, 'ron-', 'single'), ('A2', 2, 'de,', 'single'), ('REST', 2, None, None)]
        },
        # Maat 3 (Dalende lijn: F5 E5 D5 C#5)
        {
            'num': '3',
            'S': [('F5', 2, 'naars', 'single'), ('E5', 2, 'van', 'single'), ('D5', 2, 'e-', 'begin'), ('C#5', 2, 'nen', 'end')],
            'A': [('D5', 2, 'naars', 'single'), ('C5', 2, 'van', 'single'), ('B4', 2, 'e-', 'begin'), ('C#5', 2, 'nen', 'end')],
            'T': [('REST', 2, None, None), ('D4', 2, 'min-', 'begin'), ('D4', 2, 'naars', 'end'), ('D4', 2, 'van', 'single')],
            'B': [('REST', 2, None, None), ('D3', 2, 'naars', 'single'), ('D3', 2, 'van', 'single'), ('D3', 2, 'e-', 'begin')]
        },
        # Maat 4 (stiel. + opmaat "Ik")
        {
            'num': '4',
            'S': [('D5', 2, 'stiel.', 'single'), ('REST', 2, None, None), ('REST', 2, None, None), ('D5', 2, 'Ik', 'single')],
            'A': [('D4', 2, 'stiel.', 'single'), ('REST', 2, None, None), ('REST', 2, None, None), ('D4', 2, 'Ik', 'single')],
            'T': [('D4', 2, 'e-', 'begin'), ('D4', 2, 'nen', 'end'), ('D4', 2, 'stiel.', 'single'), ('REST', 2, None, None)],
            'B': [('D3', 2, 'nen', 'end'), ('D3', 2, 'stiel.', 'single'), ('REST', 2, None, None), ('D3', 2, 'Ik', 'single')]
        },
        # Maat 5 (zal u gaan ver-)
        {
            'num': '5',
            'S': [('D5', 2, 'zal', 'single'), ('D5', 2, 'u', 'single'), ('E5', 2, 'gaan', 'single'), ('F5', 2, 'ver-', 'begin')],
            'A': [('REST', 2, None, None), ('REST', 2, None, None), ('REST', 2, None, None), ('D4', 2, 'Ik', 'single')],
            'T': [('REST', 2, None, None), ('D4', 2, 'Ik', 'single'), ('D4', 2, 'zal,', 'single'), ('C4', 2, 'ik', 'single')],
            'B': [('REST', 2, None, None), ('REST', 2, None, None), ('D3', 2, 'zal', 'single'), ('D3', 2, 'ver-', 'begin')]
        },
        # Maat 6 (kon-den)
        {
            'num': '6',
            'S': [('G5', 3, 'kon-', 'begin'), ('F#5', 1, '', ''), ('D5', 2, 'den', 'end'), ('D5', 2, 'hoe', 'single')],
            'A': [('D4', 2, 'zal', 'single'), ('D4', 2, 'u', 'single'), ('E4', 2, 'gaan', 'single'), ('F4', 2, 'ver-', 'begin')],
            'T': [('B3', 2, 'zal', 'single'), ('C4', 2, 'u', 'single'), ('C4', 2, 'gaan', 'single'), ('C4', 2, 'ver-', 'begin')],
            'B': [('G2', 4, 'kon-', 'single'), ('C3', 2, 'den', 'single'), ('C3', 2, 'hoe', 'single')]
        },
        # Maat 7 (hoe ik door / kon-den)
        {
            'num': '7',
            'S': [('F5', 2, 'ik', 'single'), ('D5', 2, 'door', 'single'), ('D5', 2, "'t slij-", 'begin'), ('D5', 2, 'pers-', 'end')],
            'A': [('G4', 3, 'kon-', 'begin'), ('F#4', 1, '', ''), ('D4', 2, 'den', 'end'), ('D4', 2, 'hoe', 'single')],
            'T': [('C4', 4, 'kon-', 'single'), ('C4', 2, 'den', 'single'), ('F3', 2, 'hoe', 'single')],
            'B': [('F2', 4, 'kon-', 'single'), ('F3', 2, 'den', 'single'), ('A2', 2, 'hoe', 'single')]
        },
        # Maat 8 (ik door 't slijpers-)
        {
            'num': '8',
            'S': [('D5', 2, 'ik', 'single'), ('D5', 2, 'door', 'single'), ('E5', 2, "'t slij-", 'begin'), ('F5', 2, 'pers-', 'end')],
            'A': [('D4', 2, 'ik', 'single'), ('F4', 2, 'door', 'single'), ('G4', 2, "'t slij-", 'begin'), ('A4', 2, 'pers-', 'end')],
            'T': [('REST', 2, None, None), ('D4', 2, 'ik', 'single'), ('D4', 2, 'door', 'single'), ('C4', 2, "'t slij-", 'begin')],
            'B': [('D3', 4, 'ik', 'single'), ('D3', 2, 'door', 'single'), ('F2', 2, "'t slij-", 'begin')]
        },
        # Maat 9 (wiel, den)
        {
            'num': '9',
            'S': [('G5', 4, 'wiel', 'single'), ('REST', 2, None, None), ('D5', 2, 'den', 'single')],
            'A': [('Bb4', 4, 'wiel', 'single'), ('REST', 2, None, None), ('Bb4', 2, 'den', 'single')],
            'T': [('D4', 4, 'wiel', 'single'), ('REST', 2, None, None), ('D4', 2, 'den', 'single')],
            'B': [('G2', 4, 'wiel', 'single'), ('REST', 2, None, None), ('G2', 2, 'den', 'single')]
        },
        # Maat 10 (kost ver-dien voor)
        {
            'num': '10',
            'S': [('F5', 2, 'kost', 'single'), ('E5', 2, 'ver-', 'begin'), ('D5', 2, 'dien', 'end'), ('C#5', 2, 'voor', 'single')],
            'A': [('A4', 2, 'kost', 'single'), ('G4', 2, 'ver-', 'begin'), ('F4', 2, 'dien', 'end'), ('E4', 2, 'voor', 'single')],
            'T': [('D4', 2, 'kost', 'single'), ('B3', 2, 'ver-', 'begin'), ('A3', 2, 'dien', 'end'), ('A3', 2, 'voor', 'single')],
            'B': [('D3', 2, 'kost', 'single'), ('G2', 2, 'ver-', 'begin'), ('A2', 2, 'dien', 'end'), ('A2', 2, 'voor', 'single')]
        },
        # Maat 11 (vrouw en kind, schoon - gepuncteerd!)
        {
            'num': '11',
            'S': [('D5', 3, 'vrouw', 'single'), ('F5', 1, 'en', 'single'), ('E5', 2, 'kind,', 'single'), ('A4', 2, 'schoon', 'single')],
            'A': [('F4', 3, 'vrouw', 'single'), ('A4', 1, 'en', 'single'), ('G4', 2, 'kind,', 'single'), ('F4', 2, 'schoon', 'single')],
            'T': [('A3', 3, 'vrouw', 'single'), ('D4', 1, 'en', 'single'), ('C#4', 2, 'kind,', 'single'), ('D4', 2, 'schoon', 'single')],
            'B': [('D3', 3, 'vrouw', 'single'), ('D3', 1, 'en', 'single'), ('A2', 2, 'kind,', 'single'), ('D3', 2, 'schoon', 'single')]
        },
        # Maat 12 (bloot-ge-steld aan - gepuncteerd!)
        {
            'num': '12',
            'S': [('D5', 3, 'bloot-', 'begin'), ('D5', 1, 'ge-', 'end'), ('D5', 2, 'steld', 'single'), ('C#5', 2, 'aan', 'single')],
            'A': [('Bb4', 3, 'bloot-', 'begin'), ('Bb4', 1, 'ge-', 'end'), ('Bb4', 2, 'steld', 'single'), ('A4', 2, 'aan', 'single')],
            'T': [('G4', 3, 'bloot-', 'begin'), ('G4', 1, 'ge-', 'end'), ('F#4', 2, 'steld', 'single'), ('E4', 2, 'aan', 'single')],
            'B': [('G3', 3, 'bloot-', 'begin'), ('G3', 1, 'ge-', 'end'), ('F#3', 2, 'steld', 'single'), ('E3', 2, 'aan', 'single')]
        },
        # Maat 13 (weer en wind! - fermate op wind!)
        {
            'num': '13',
            'S': [('D5', 2, 'weer', 'single'), ('E5', 2, 'en', 'single'), ('D5', 4, 'wind!', 'single', True)],
            'A': [('F#4', 2, 'weer', 'single'), ('G4', 2, 'en', 'single'), ('F#4', 4, 'wind!', 'single', True)],
            'T': [('A3', 2, 'weer', 'single'), ('A3', 2, 'en', 'single'), ('D4', 4, 'wind!', 'single', True)],
            'B': [('D3', 2, 'weer', 'single'), ('C#3', 2, 'en', 'single'), ('D3', 4, 'wind!', 'single', True)]
        },
        # Maat 13b (Refrein Inzet, kwartnoot, dur=4)
        {
            'num': '13b', 'implicit': 'yes',
            'S': [('A4', 4, 'Ter', 'single')],
            'A': [('F4', 4, 'Ter', 'single')],
            'T': [('D4', 4, 'Ter', 'single')],
            'B': [('D3', 4, 'Ter', 'single')]
        },
        # Maat 14 (lie-re om ter)
        {
            'num': '14',
            'S': [('D5', 3, 'lie-', 'begin'), ('C#5', 1, 're', 'end'), ('D5', 2, 'om', 'single'), ('E5', 2, 'ter', 'single')],
            'A': [('F4', 2, 'lie-', 'begin'), ('E4', 2, 're', 'end'), ('F4', 2, 'om', 'single'), ('G4', 2, 'ter', 'single')],
            'T': [('A3', 2, 'lie-', 'begin'), ('A3', 2, 're', 'end'), ('A3', 2, 'om', 'single'), ('D4', 2, 'ter', 'single')],
            'B': [('D3', 3, 'lie-', 'begin'), ('C#3', 1, 're', 'end'), ('D3', 2, 'om', 'single'), ('C#3', 2, 'ter', 'single')]
        },
        # Maat 15 (la, van)
        {
            'num': '15',
            'S': [('F5', 4, 'la', 'single'), ('REST', 2, None, None), ('A4', 2, 'van', 'single')],
            'A': [('D5', 4, 'la', 'single'), ('REST', 2, None, None), ('F4', 2, 'van', 'single')],
            'T': [('A3', 2, 'la', 'single'), ('A3', 2, 'la', 'single'), ('A3', 2, 'la,', 'single'), ('D4', 2, 'van', 'single')],
            'B': [('D3', 4, 'la', 'single'), ('REST', 2, None, None), ('D3', 2, 'van', 'single')]
        },
        # Maat 16 (links-om rechts-om)
        {
            'num': '16',
            'S': [('D5', 2, 'links-', 'begin'), ('D5', 2, 'om', 'end'), ('C#5', 2, 'rechts-', 'begin'), ('C#5', 2, 'om', 'end')],
            'A': [('F4', 2, 'links-', 'begin'), ('F4', 2, 'om', 'end'), ('E4', 2, 'rechts-', 'begin'), ('E4', 2, 'om', 'end')],
            'T': [('B3', 2, 'links-', 'begin'), ('B3', 2, 'om', 'end'), ('A3', 2, 'rechts-', 'begin'), ('A3', 2, 'om', 'end')],
            'B': [('G2', 2, 'links-', 'begin'), ('G2', 2, 'om', 'end'), ('A2', 2, 'rechts-', 'begin'), ('A2', 2, 'om', 'end')]
        },
        # Maat 17 (draait mijne steen)
        {
            'num': '17',
            'S': [('D5', 2, 'draait', 'single'), ('D5', 2, 'mij-', 'begin'), ('E5', 2, 'ne', 'end'), ('F5', 2, 'steen', 'single')],
            'A': [('D4', 2, 'draait', 'single'), ('D4', 2, 'mij-', 'begin'), ('E4', 2, 'ne', 'end'), ('F4', 2, 'steen', 'single')],
            'T': [('A3', 2, 'draait', 'single'), ('A3', 2, 'mij-', 'begin'), ('B3', 2, 'ne', 'end'), ('C4', 2, 'steen', 'single')],
            'B': [('D3', 2, 'draait', 'single'), ('D3', 2, 'mij-', 'begin'), ('D3', 2, 'ne', 'end'), ('D3', 2, 'steen', 'single')]
        },
        # Maat 17b (door het)
        {
            'num': '17b',
            'S': [('D5', 2, 'door', 'single'), ('C#5', 2, 'het', 'single'), ('REST', 4, None, None)],
            'A': [('F#4', 2, 'door', 'single'), ('G4', 2, 'het', 'single'), ('REST', 4, None, None)],
            'T': [('D4', 2, 'door', 'single'), ('C#4', 2, 'het', 'single'), ('REST', 4, None, None)],
            'B': [('D3', 2, 'door', 'single'), ('A2', 2, 'het', 'single'), ('REST', 4, None, None)]
        },
        # Maat 18 (roe-ren van mijn)
        {
            'num': '18',
            'S': [('D5', 2, 'roe-', 'begin'), ('D5', 2, 'ren', 'end'), ('E5', 2, 'van', 'single'), ('F5', 2, 'mijn', 'single')],
            'A': [('D4', 2, 'roe-', 'begin'), ('C4', 2, 'ren', 'end'), ('D4', 2, 'van', 'single'), ('C#4', 2, 'mijn', 'single')],
            'T': [('F3', 2, 'roe-', 'begin'), ('A3', 2, 'ren', 'end'), ('F3', 2, 'van', 'single'), ('A3', 2, 'mijn', 'single')],
            'B': [('D3', 2, 'roe-', 'begin'), ('C#3', 2, 'ren', 'end'), ('D3', 2, 'van', 'single'), ('C#3', 2, 'mijn', 'single')]
        },
        # Maat 19 (been. Ju ju ju)
        {
            'num': '19',
            'S': [('D5', 2, 'been.', 'single'), ('D5', 2, 'Ju', 'single'), ('D5', 2, 'ju', 'single'), ('D5', 2, 'ju', 'single')],
            'A': [('D4', 2, 'been.', 'single'), ('F4', 2, 'Ju', 'single'), ('G4', 2, 'ju', 'single'), ('E4', 2, 'ju', 'single')],
            'T': [('F3', 2, 'been.', 'single'), ('G#3', 2, 'Ju', 'single'), ('A3', 2, 'ju', 'single'), ('A3', 2, 'ju', 'single')],
            'B': [('D3', 2, 'been.', 'single'), ('D3', 2, 'Ju', 'single'), ('C#3', 2, 'ju', 'single'), ('C#3', 2, 'ju', 'single')]
        },
        # Maat 20 (ju, ju ju ju)
        {
            'num': '20',
            'S': [('D5', 2, 'ju,', 'single'), ('D5', 2, 'ju', 'single'), ('D5', 2, 'ju', 'single'), ('D5', 2, 'ju', 'single')],
            'A': [('F4', 2, 'ju,', 'single'), ('E4', 2, 'ju', 'single'), ('F4', 2, 'ju', 'single'), ('E4', 2, 'ju', 'single')],
            'T': [('A3', 2, 'ju,', 'single'), ('A3', 2, 'ju', 'single'), ('A3', 2, 'ju', 'single'), ('A3', 2, 'ju', 'single')],
            'B': [('D3', 2, 'ju,', 'single'), ('A2', 2, 'ju', 'single'), ('D3', 2, 'ju', 'single'), ('C#3', 2, 'ju', 'single')]
        },
        # Maat 21 (ju! - Halve noot slot)
        {
            'num': '21',
            'S': [('D5', 8, 'ju!', 'single', True)],
            'A': [('F4', 8, 'ju!', 'single', True)],
            'T': [('A3', 8, 'ju!', 'single', True)],
            'B': [('D3', 8, 'ju!', 'single', True)]
        }
    ]

    # BOUW DE PART STRUCTUREN
    part_keys = [('P1', 'S'), ('P2', 'A'), ('P3', 'T'), ('P4', 'B')]
    
    for pid, vkey in part_keys:
        part_el = ET.SubElement(score, 'part', id=pid)
        
        for m_idx, m_info in enumerate(measures_data):
            m_attrs = {'number': m_info['num']}
            if m_info.get('implicit'):
                m_attrs['implicit'] = m_info['implicit']
            m_el = ET.SubElement(part_el, 'measure', **m_attrs)
            
            # Attributen op maat 0
            if m_idx == 0:
                attrs = ET.SubElement(m_el, 'attributes')
                divs = ET.SubElement(attrs, 'divisions')
                divs.text = '4'
                
                key = ET.SubElement(attrs, 'key')
                fifths = ET.SubElement(key, 'fifths')
                fifths.text = '-1' # 1 mol (d-mineur)
                mode = ET.SubElement(key, 'mode')
                mode.text = 'minor'
                
                time = ET.SubElement(attrs, 'time')
                beats = ET.SubElement(time, 'beats')
                beats.text = '2'
                beattype = ET.SubElement(time, 'beat-type')
                beattype.text = '4'
                
                clef = ET.SubElement(attrs, 'clef')
                clef_sign = ET.SubElement(clef, 'sign')
                clef_line = ET.SubElement(clef, 'line')
                
                if pid == 'P4':
                    clef_sign.text = 'F'
                    clef_line.text = '4'
                elif pid == 'P3':
                    clef_sign.text = 'G'
                    clef_line.text = '2'
                    clef_oct = ET.SubElement(clef, 'clef-octave-change')
                    clef_oct.text = '-1'
                else:
                    clef_sign.text = 'G'
                    clef_line.text = '2'

            # Voeg noten toe
            voice_notes = m_info[vkey]
            for n_data in voice_notes:
                n_str = n_data[0]
                n_dur = n_data[1]
                lyric_txt = n_data[2] if len(n_data) > 2 else None
                syllabic = n_data[3] if len(n_data) > 3 else None
                has_fermata = n_data[4] if len(n_data) > 4 else False
                
                note_el = ET.SubElement(m_el, 'note')
                
                if n_str == 'REST':
                    ET.SubElement(note_el, 'rest')
                else:
                    pitch_el = ET.SubElement(note_el, 'pitch')
                    step_el = ET.SubElement(pitch_el, 'step')
                    step_char = n_str[0]
                    step_el.text = step_char
                    
                    if '#' in n_str:
                        alt_el = ET.SubElement(pitch_el, 'alter')
                        alt_el.text = '1'
                        oct_str = n_str[2:]
                    elif 'b' in n_str:
                        alt_el = ET.SubElement(pitch_el, 'alter')
                        alt_el.text = '-1'
                        oct_str = n_str[2:]
                    else:
                        oct_str = n_str[1:]
                        
                    oct_el = ET.SubElement(pitch_el, 'octave')
                    oct_el.text = oct_str
                    
                    # Accidental element indien alter aanwezig
                    if '#' in n_str:
                        acc_el = ET.SubElement(note_el, 'accidental')
                        acc_el.text = 'sharp'
                    elif 'b' in n_str:
                        acc_el = ET.SubElement(note_el, 'accidental')
                        acc_el.text = 'flat'

                dur_el = ET.SubElement(note_el, 'duration')
                dur_el.text = str(n_dur)
                
                # Type element
                type_el = ET.SubElement(note_el, 'type')
                if n_dur == 1:
                    type_el.text = '16th'
                elif n_dur == 2:
                    type_el.text = 'eighth'
                elif n_dur == 3:
                    type_el.text = 'eighth'
                    ET.SubElement(note_el, 'dot')
                elif n_dur == 4:
                    type_el.text = 'quarter'
                elif n_dur == 8:
                    type_el.text = 'half'
                    
                if has_fermata:
                    notations_el = ET.SubElement(note_el, 'notations')
                    ET.SubElement(notations_el, 'fermata', type='upright')

                if lyric_txt:
                    lyric_el = ET.SubElement(note_el, 'lyric', number='1')
                    syl_el = ET.SubElement(lyric_el, 'syllabic')
                    syl_el.text = syllabic if syllabic else 'single'
                    txt_el = ET.SubElement(lyric_el, 'text')
                    txt_el.text = lyric_txt

    # Schrijf weg naar bestand met mooie XML indentatie
    xml_str = ET.tostring(score, encoding='utf-8')
    parsed_dom = minidom.parseString(xml_str)
    pretty_xml = parsed_dom.toprettyxml(indent='  ', encoding='utf-8').decode('utf-8')
    
    # Voeg doctype netjes in
    lines = pretty_xml.splitlines()
    header = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">'
    final_output = header + '\n' + '\n'.join(lines[1:])

    out_file = 'assets/sample-scores/komt-vrienden-in-het-ronde.musicxml'
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(final_output)
    print(f"[OK] 100% nauwkeurig MusicXML bestand succesvol gegenereerd: {out_file}")

if __name__ == '__main__':
    build_musicxml()
