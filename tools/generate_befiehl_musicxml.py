#!/usr/bin/env python3
"""
Zing! - Accurate MusicXML Generator for 'Befiehl du deine Wege'
J.S. Bach, Matthäus-Passion (BWV 244), Nr. 44 Choral (SATB).
Quelle: Bärenreiter BA 5038a / CPDL Gereon Behrendt (2016).
Toonsoort: D-groot (2 kruisen: F#, C#).
Maatsoort: 4/4 (Common time).
Divisions = 4:
  - 1/16 noot = 1
  - 1/8 noot  = 2
  - gepuncteerde 1/8 noot = 3
  - 1/4 noot  = 4
  - gepuncteerde 1/4 noot = 6
  - 1/2 noot  = 8
  - gepuncteerde 1/2 noot = 12
  - hele noot = 16
"""

import xml.etree.ElementTree as ET
from xml.dom import minidom
import os

def parse_note(note_str):
    if note_str == 'REST':
        return None
    step = note_str[0]
    rest = note_str[1:]
    alter = 0
    if rest.startswith('#'):
        alter = 1
        octave = int(rest[1:])
    elif rest.startswith('b'):
        alter = -1
        octave = int(rest[1:])
    else:
        octave = int(rest)
    return step, alter, octave

def add_note_element(measure_el, note_data, voice_idx=1):
    pitch_str = note_data[0]
    duration = note_data[1]
    lyrics = note_data[2] if len(note_data) > 2 else None
    slur = note_data[3] if len(note_data) > 3 else None
    is_fermata = note_data[4] if len(note_data) > 4 else False
    is_dotted = note_data[5] if len(note_data) > 5 else False

    note_el = ET.SubElement(measure_el, 'note')

    if pitch_str == 'REST':
        ET.SubElement(note_el, 'rest')
    else:
        p_info = parse_note(pitch_str)
        pitch_el = ET.SubElement(note_el, 'pitch')
        step_el = ET.SubElement(pitch_el, 'step')
        step_el.text = p_info[0]
        if p_info[1] != 0:
            alt_el = ET.SubElement(pitch_el, 'alter')
            alt_el.text = str(p_info[1])
        oct_el = ET.SubElement(pitch_el, 'octave')
        oct_el.text = str(p_info[2])

    dur_el = ET.SubElement(note_el, 'duration')
    dur_el.text = str(duration)

    v_el = ET.SubElement(note_el, 'voice')
    v_el.text = str(voice_idx)

    type_map = {1: '16th', 2: 'eighth', 3: 'eighth', 4: 'quarter', 6: 'quarter', 8: 'half', 12: 'half', 16: 'whole'}
    t_el = ET.SubElement(note_el, 'type')
    t_el.text = type_map.get(duration, 'quarter')

    if is_dotted or duration in (3, 6, 12):
        ET.SubElement(note_el, 'dot')

    if pitch_str != 'REST' and p_info[1] != 0:
        acc_el = ET.SubElement(note_el, 'accidental')
        acc_el.text = 'sharp' if p_info[1] == 1 else 'flat'

    notations_el = None
    if is_fermata:
        if notations_el is None:
            notations_el = ET.SubElement(note_el, 'notations')
        ferm = ET.SubElement(notations_el, 'fermata', type='upright')

    if slur in ('start', 'stop'):
        if notations_el is None:
            notations_el = ET.SubElement(note_el, 'notations')
        ET.SubElement(notations_el, 'slur', type=slur, number='1')

    if lyrics:
        if isinstance(lyrics, tuple):
            lyrics = [lyrics]
        for item in lyrics:
            lyric_text = item[0]
            syllabic = item[1] if len(item) > 1 else 'single'
            v_num = str(item[2]) if len(item) > 2 else '1'

            lyric_el = ET.SubElement(note_el, 'lyric', number=v_num)
            syl_el = ET.SubElement(lyric_el, 'syllabic')
            syl_el.text = syllabic
            txt_el = ET.SubElement(lyric_el, 'text')
            txt_el.text = lyric_text

def build_befiehl_musicxml(single_voice_id=None):
    score = ET.Element('score-partwise', version='3.1')

    work = ET.SubElement(score, 'work')
    wtitle = ET.SubElement(work, 'work-title')
    wtitle.text = '44. Choral: Befiehl du deine Wege (Matthäus-Passion BWV 244)'

    ident = ET.SubElement(score, 'identification')
    creator = ET.SubElement(ident, 'creator', type='composer')
    creator.text = 'Johann Sebastian Bach (1685–1750)'
    rights = ET.SubElement(ident, 'rights')
    rights.text = 'Public Domain / CPDL Gereon Behrendt (2016)'

    part_list = ET.SubElement(score, 'part-list')
    voices_info = [
        ('P1', 'Sopraan', 'S.', 'G', 2, 0),
        ('P2', 'Alt', 'A.', 'G', 2, 0),
        ('P3', 'Tenor', 'T.', 'G', 2, -1),
        ('P4', 'Bas', 'B.', 'F', 4, 0)
    ]

    selected_voices = [v for v in voices_info if (single_voice_id is None or v[0] == single_voice_id)]

    for v in selected_voices:
        sp = ET.SubElement(part_list, 'score-part', id=v[0])
        pname = ET.SubElement(sp, 'part-name')
        pname.text = v[1]
        pabb = ET.SubElement(sp, 'part-abbreviation')
        pabb.text = v[2]

    measures = [
        # Maat 0 (Opmaat, 1 kwartnoot, dur=4)
        {
            'num': '0', 'implicit': 'yes',
            'S': [('F#4', 4, [('Be-', 'begin', 1), ('der', 'single', 2)])],
            'A': [('D4', 4, [('Be-', 'begin', 1), ('der', 'single', 2)])],
            'T': [('A3', 4, [('Be-', 'begin', 1), ('der', 'single', 2)])],
            'B': [('D3', 4, [('Be-', 'begin', 1), ('der', 'single', 2)])]
        },
        # Maat 1 (4 kwartnoten = 16 divs)
        {
            'num': '1',
            'S': [
                ('B4', 4, [('fiehl', 'end', 1), ('al-', 'begin', 2)]),
                ('A4', 4, [('du', 'single', 1), ('-ler-', 'middle', 2)]),
                ('G4', 4, [('dei-', 'begin', 1), ('-treu-', 'middle', 2)]),
                ('F#4', 4, [('-ne', 'end', 1), ('-sten', 'end', 2)])
            ],
            'A': [
                ('D4', 4),
                ('D4', 4),
                ('D4', 2, None, 'start'),
                ('E4', 2, None, 'stop'),
                ('F#4', 2, None, 'start'),
                ('G4', 2, None, 'stop')
            ],
            'T': [
                ('G3', 4),
                ('A3', 4),
                ('B3', 2, None, 'start'),
                ('C#4', 2, None, 'stop'),
                ('D4', 4)
            ],
            'B': [
                ('G3', 4),
                ('F#3', 4),
                ('E3', 2, None, 'start'),
                ('D3', 2, None, 'stop'),
                ('B2', 4)
            ]
        },
        # Maat 2 (We- ge und / Pfle- ge des,)
        {
            'num': '2',
            'S': [
                ('E4', 8, [('We-', 'begin', 1), ('Pfle-', 'begin', 2)]),
                ('D4', 4, [('-ge', 'end', 1), ('-ge,', 'end', 2)], None, True),
                ('F#4', 4, [('und', 'single', 1), ('des,', 'single', 2)])
            ],
            'A': [
                ('E4', 4, None, 'start'),
                ('D4', 4, None, 'stop'),
                ('A3', 4, None, None, True),
                ('D4', 4)
            ],
            'T': [
                ('A3', 4, None, 'start'),
                ('G3', 4, None, 'stop'),
                ('F#3', 4, None, None, True),
                ('A3', 4)
            ],
            'B': [
                ('C#3', 4, None, 'start'),
                ('B2', 4, None, 'stop'),
                ('D3', 4, None, None, True),
                ('D3', 4)
            ]
        },
        # Maat 3 (was dein Her- ze / der den Him- mel)
        {
            'num': '3',
            'S': [
                ('F#4', 4, [('was', 'single', 1), ('der', 'single', 2)]),
                ('G4', 4, [('dein', 'single', 1), ('den', 'single', 2)]),
                ('A4', 2, [('Her-', 'begin', 1), ('Him-', 'begin', 2)], 'start'),
                ('B4', 2, None, 'stop'),
                ('A4', 4, [('-ze', 'end', 1), ('-mel', 'end', 2)])
            ],
            'A': [
                ('D4', 2, None, 'start'),
                ('E4', 2, None, 'stop'),
                ('D4', 4),
                ('D4', 6),
                ('C#4', 2)
            ],
            'T': [
                ('D4', 4),
                ('D4', 4),
                ('D4', 4),
                ('C#4', 4)
            ],
            'B': [
                ('B2', 2, None, 'start'),
                ('C#3', 2, None, 'stop'),
                ('D3', 2, None, 'start'),
                ('E3', 2, None, 'stop'),
                ('F#3', 4),
                ('A2', 4)
            ]
        },
        # Maat 4 (kränkt / lenkt.) - 3 kwartnoten (dur=12) met herhalingsteken (:|)
        {
            'num': '4',
            'repeat_backward': True,
            'S': [
                ('F#4', 12, [('kränkt', 'single', 1), ('lenkt.', 'single', 2)], None, True, True)
            ],
            'A': [
                ('D4', 12, None, None, True, True)
            ],
            'T': [
                ('F#3', 12, None, None, True, True)
            ],
            'B': [
                ('D3', 12, None, None, True, True)
            ]
        },
        # Maat 5 (Opmaat naar Abgesang: "Der", dur=4)
        {
            'num': '5', 'implicit': 'yes',
            'S': [('B4', 4, [('Der', 'single', 1)])],
            'A': [('G4', 4, [('Der', 'single', 1)])],
            'T': [
                ('D4', 2, [('Der', 'single', 1)], 'start'),
                ('E4', 2, None, 'stop')
            ],
            'B': [('G3', 4, [('Der', 'single', 1)])]
        },
        # Maat 6 (Wol- ken, Luft und)
        {
            'num': '6',
            'S': [
                ('A4', 4, [('Wol-', 'begin', 1)]),
                ('G4', 2, [('-ken,', 'end', 1)], 'start'),
                ('F#4', 2, None, 'stop'),
                ('E4', 4, [('Luft', 'single', 1)]),
                ('F#4', 4, [('und', 'single', 1)])
            ],
            'A': [
                ('F#4', 4),
                ('E4', 2, None, 'start'),
                ('D4', 2, None, 'stop'),
                ('C#4', 2, None, 'start'),
                ('B3', 2, None, 'stop'),
                ('C#4', 4)
            ],
            'T': [
                ('D4', 2, None, 'start'),
                ('C#4', 2, None, 'stop'),
                ('B3', 4),
                ('B3', 2, None, 'start'),
                ('A3', 2, None, 'stop'),
                ('A3', 4)
            ],
            'B': [
                ('D3', 4),
                ('E3', 4),
                ('G3', 2, None, 'start'),
                ('F#3', 2, None, 'stop'),
                ('E3', 2, None, 'start'),
                ('D3', 2, None, 'stop')
            ]
        },
        # Maat 7 (Win- den gibt)
        {
            'num': '7',
            'S': [
                ('G4', 8, [('Win-', 'begin', 1)]),
                ('F#4', 4, [('-den', 'end', 1)], None, True),
                ('B4', 4, [('gibt', 'single', 1)])
            ],
            'A': [
                ('D4', 4),
                ('D4', 2, None, 'start'),
                ('E4', 2, None, 'stop'),
                ('D4', 4, None, None, True),
                ('D4', 4)
            ],
            'T': [
                ('B3', 4),
                ('B3', 2, None, 'start'),
                ('C#4', 2, None, 'stop'),
                ('D4', 4, None, None, True),
                ('D4', 4)
            ],
            'B': [
                ('B2', 4),
                ('C#3', 4),
                ('D3', 4, None, None, True),
                ('G3', 4)
            ]
        },
        # Maat 8 (We- ge, Lauf und)
        {
            'num': '8',
            'S': [
                ('A4', 4, [('We-', 'begin', 1)]),
                ('A4', 4, [('-ge,', 'end', 1)]),
                ('B4', 4, [('Lauf', 'single', 1)]),
                ('C#5', 4, [('und', 'single', 1)])
            ],
            'A': [
                ('D4', 4),
                ('D4', 4),
                ('D4', 4),
                ('E4', 4)
            ],
            'T': [
                ('D4', 4),
                ('C4', 4),
                ('B3', 4),
                ('B3', 4)
            ],
            'B': [
                ('D3', 2, None, 'start'),
                ('C#3', 2, None, 'stop'),
                ('B2', 2, None, 'start'),
                ('A#2', 2, None, 'stop'),
                ('B2', 2, None, 'start'),
                ('C#3', 2, None, 'stop'),
                ('D3', 2, None, 'start'),
                ('E3', 2, None, 'stop')
            ]
        },
        # Maat 9 (Bahn [3 kwart fermata] + opmaat "der" [1 kwart])
        {
            'num': '9',
            'S': [
                ('D5', 12, [('Bahn', 'single', 1)], None, True, True),
                ('A4', 4, [('der', 'single', 1)])
            ],
            'A': [
                ('F#4', 12, None, None, True, True),
                ('D4', 4)
            ],
            'T': [
                ('A3', 12, None, None, True, True),
                ('F#3', 4)
            ],
            'B': [
                ('B2', 12, None, None, True, True),
                ('D#3', 4)
            ]
        },
        # Maat 10 (wird auch We- ge)
        {
            'num': '10',
            'S': [
                ('B4', 4, [('wird', 'single', 1)]),
                ('C#5', 4, [('auch', 'single', 1)]),
                ('D5', 4, [('We-', 'begin', 1)]),
                ('D5', 4, [('-ge', 'end', 1)])
            ],
            'A': [
                ('D4', 4),
                ('E4', 4),
                ('F#4', 2, None, 'start'),
                ('G#4', 2, None, 'stop'),
                ('A4', 4)
            ],
            'T': [
                ('G3', 4),
                ('A3', 4),
                ('A3', 2, None, 'start'),
                ('B3', 2, None, 'stop'),
                ('C#4', 2, None, 'start'),
                ('B3', 2, None, 'stop')
            ],
            'B': [
                ('E3', 4),
                ('G#3', 4),
                ('A3', 4),
                ('B3', 4)
            ]
        },
        # Maat 11 (fin- den, da)
        {
            'num': '11',
            'S': [
                ('C#5', 8, [('fin-', 'begin', 1)]),
                ('B4', 4, [('-den,', 'end', 1)], None, True),
                ('F#4', 4, [('da', 'single', 1)])
            ],
            'A': [
                ('F#4', 4, None, 'start'),
                ('E#4', 4, None, 'stop'),
                ('F#4', 4, None, None, True),
                ('D4', 2, None, 'start'),
                ('C#4', 2, None, 'stop')
            ],
            'T': [
                ('C#4', 8),
                ('D4', 4, None, None, True),
                ('B3', 4)
            ],
            'B': [
                ('C#3', 2, None, 'start'),
                ('D3', 2, None, 'stop'),
                ('E3', 4),
                ('B2', 4, None, None, True),
                ('B2', 4)
            ]
        },
        # Maat 12 (dein Fuß ge- hen)
        {
            'num': '12',
            'S': [
                ('G4', 4, [('dein', 'single', 1)]),
                ('F#4', 4, [('Fuß', 'single', 1)]),
                ('E4', 4, [('ge-', 'begin', 1)]),
                ('E4', 4, [('-hen', 'end', 1)])
            ],
            'A': [
                ('B3', 2, None, 'start'),
                ('C#4', 2, None, 'stop'),
                ('D4', 2, None, 'start'),
                ('C#4', 2, None, 'stop'),
                ('B3', 4),
                ('E4', 2, None, 'start'),
                ('D4', 2, None, 'stop')
            ],
            'T': [
                ('E3', 4),
                ('F#3', 4),
                ('G3', 4),
                ('A3', 4)
            ],
            'B': [
                ('E3', 4),
                ('D3', 2, None, 'start'),
                ('C#3', 2, None, 'stop'),
                ('B2', 4),
                ('C#3', 4)
            ]
        },
        # Maat 13 (kann. - 3 kwartnoten / dotted half note met slotfermate)
        {
            'num': '13',
            'S': [
                ('D4', 12, [('kann.', 'single', 1)], None, True, True)
            ],
            'A': [
                ('A3', 12, None, None, True, True)
            ],
            'T': [
                ('F#3', 12, None, None, True, True)
            ],
            'B': [
                ('D3', 12, None, None, True, True)
            ]
        }
    ]

    for pid, pname, pabb, clef_sign, clef_line, clef_oct in selected_voices:
        part_el = ET.SubElement(score, 'part', id=pid)
        voice_key = {'P1': 'S', 'P2': 'A', 'P3': 'T', 'P4': 'B'}[pid]

        for m_idx, m_data in enumerate(measures):
            m_el = ET.SubElement(part_el, 'measure', number=m_data['num'])
            if m_data.get('implicit') == 'yes':
                m_el.set('implicit', 'yes')

            if m_idx == 0:
                attr = ET.SubElement(m_el, 'attributes')
                divs = ET.SubElement(attr, 'divisions')
                divs.text = '4'
                
                key_el = ET.SubElement(attr, 'key')
                fifths = ET.SubElement(key_el, 'fifths')
                fifths.text = '2'
                mode = ET.SubElement(key_el, 'mode')
                mode.text = 'major'

                time_el = ET.SubElement(attr, 'time')
                beats = ET.SubElement(time_el, 'beats')
                beats.text = '4'
                btype = ET.SubElement(time_el, 'beat-type')
                btype.text = '4'

                clef_el = ET.SubElement(attr, 'clef')
                csign = ET.SubElement(clef_el, 'sign')
                csign.text = clef_sign
                cline = ET.SubElement(clef_el, 'line')
                cline.text = str(clef_line)
                if clef_oct != 0:
                    coct = ET.SubElement(clef_el, 'clef-octave-change')
                    coct.text = str(clef_oct)

            notes_list = m_data[voice_key]
            for n in notes_list:
                add_note_element(m_el, n, voice_idx=1)

            if m_data.get('repeat_backward'):
                barline = ET.SubElement(m_el, 'barline', location='right')
                bstyle = ET.SubElement(barline, 'bar-style')
                bstyle.text = 'light-heavy'
                rep = ET.SubElement(barline, 'repeat', direction='backward')

            if m_idx == len(measures) - 1:
                barline = ET.SubElement(m_el, 'barline', location='right')
                bstyle = ET.SubElement(barline, 'bar-style')
                bstyle.text = 'light-heavy'

    raw_xml = ET.tostring(score, encoding='utf-8')
    dom = minidom.parseString(raw_xml)
    return dom.toprettyxml(indent='  ', encoding='utf-8').decode('utf-8')

def main():
    target_dir = 'assets/sample-scores'
    os.makedirs(target_dir, exist_ok=True)

    full_xml = build_befiehl_musicxml()
    full_path = os.path.join(target_dir, 'befiehl-du-deine-wege.musicxml')
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(full_xml)
    print(f"[OK] Full SATB MusicXML: {full_path} ({os.path.getsize(full_path)} bytes)")

    voices = [
        ('P1', 'Sopraan'),
        ('P2', 'Alt'),
        ('P3', 'Tenor'),
        ('P4', 'Bas')
    ]
    for vid, vname in voices:
        part_xml = build_befiehl_musicxml(single_voice_id=vid)
        part_path = os.path.join(target_dir, f'befiehl-du-deine-wege-{vname}.musicxml')
        with open(part_path, 'w', encoding='utf-8') as f:
            f.write(part_xml)
        print(f"[OK] Partij {vname} MusicXML: {part_path} ({os.path.getsize(part_path)} bytes)")

if __name__ == '__main__':
    main()
