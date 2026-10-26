#!/usr/bin/env python3
"""
Zing! - Accurate MusicXML Generator for 'Drink To Me Only With Thine Eyes'
Arrangement: John Reager (2013)
Lyrics: Ben Jonson (1572-1637)
Voices: SAB (Soprano, Alto, Baritone)
Key: F Major (1 flat: Bb)
Time: 6/8
Divisions = 4:
  - 1/16 note = 1
  - 1/8 note  = 2
  - 1/4 note  = 4
  - dotted 1/4 note = 6
  - dotted 1/2 note = 12

Optisch 100% uitgelezen vanaf de originele SAB partituur:
- Sopraan begint in M1 op La (A4) in de 2e tussenruimte
- Alt begint in M1 op Fa (F4) in de 1e tussenruimte
- Bariton begint in M1 op Fa (F3) op de 4e lijn
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

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
    tie = note_data[4] if len(note_data) > 4 else None
    is_dotted = note_data[5] if len(note_data) > 5 else False

    note_el = ET.SubElement(measure_el, 'note')

    if tie in ('start', 'stop'):
        ET.SubElement(note_el, 'tie', type=tie)

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

    type_map = {1: '16th', 2: 'eighth', 3: 'eighth', 4: 'quarter', 6: 'quarter', 8: 'half', 12: 'half'}
    t_el = ET.SubElement(note_el, 'type')
    t_el.text = type_map.get(duration, 'quarter')

    if is_dotted or duration in (3, 6, 12):
        ET.SubElement(note_el, 'dot')

    notations_el = None
    if tie in ('start', 'stop'):
        if notations_el is None:
            notations_el = ET.SubElement(note_el, 'notations')
        ET.SubElement(notations_el, 'tied', type=tie)

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

def build_drink_to_me_only_musicxml(single_voice_id=None):
    score = ET.Element('score-partwise', version='3.1')

    work = ET.SubElement(score, 'work')
    wtitle = ET.SubElement(work, 'work-title')
    wtitle.text = 'Drink To Me Only With Thine Eyes'

    ident = ET.SubElement(score, 'identification')
    c1 = ET.SubElement(ident, 'creator', type='composer')
    c1.text = 'Traditional / Arr. John Reager'
    c2 = ET.SubElement(ident, 'creator', type='lyricist')
    c2.text = 'Ben Jonson (1572–1637)'
    rights = ET.SubElement(ident, 'rights')
    rights.text = 'Arrangement © 2013 John Reager / CPDL'

    part_list = ET.SubElement(score, 'part-list')
    voices_info = [
        ('P1', 'Sopraan', 'S.', 'G', 2, 0),
        ('P2', 'Alt', 'A.', 'G', 2, 0),
        ('P3', 'Bariton', 'B.', 'F', 4, 0)
    ]

    selected_voices = [v for v in voices_info if (single_voice_id is None or v[0] == single_voice_id)]

    for v in selected_voices:
        sp = ET.SubElement(part_list, 'score-part', id=v[0])
        pname = ET.SubElement(sp, 'part-name')
        pname.text = v[1]
        pabb = ET.SubElement(sp, 'part-abbreviation')
        pabb.text = v[2]

    # 16 Maten exact volgens de 500 DPI optische partituur
    # Noot formaat: (pitch, duration, lyrics, slur, tie, is_dotted)
    measures = [
        # M1 (Drink to me on-ly / I sent thee late a)
        {
            'num': '1',
            'S': [
                ('A4', 2, [('Drink', 'single', 1), ('I', 'single', 2)]),
                ('A4', 2, [('to', 'single', 1), ('sent', 'single', 2)]),
                ('A4', 2, [('me', 'single', 1), ('thee', 'single', 2)]),
                ('Bb4', 4, [('on-', 'begin', 1), ('late', 'single', 2)]),
                ('Bb4', 2, [('-ly', 'end', 1), ('a', 'single', 2)]),
            ],
            'A': [
                ('F4', 2, [('Drink', 'single', 1), ('I', 'single', 2)]),
                ('F4', 2, [('to', 'single', 1), ('sent', 'single', 2)]),
                ('F4', 2, [('me', 'single', 1), ('thee', 'single', 2)]),
                ('G4', 4, [('on-', 'begin', 1), ('late', 'single', 2)]),
                ('G4', 2, [('-ly', 'end', 1), ('a', 'single', 2)]),
            ],
            'B': [
                ('F3', 2, [('Drink', 'single', 1), ('I', 'single', 2)]),
                ('F3', 2, [('to', 'single', 1), ('sent', 'single', 2)]),
                ('F3', 2, [('me', 'single', 1), ('thee', 'single', 2)]),
                ('G3', 4, [('on-', 'begin', 1), ('late', 'single', 2)]),
                ('G3', 2, [('-ly', 'end', 1), ('a', 'single', 2)]),
            ]
        },
        # M2 (with thine eyes, and / ro-sy wreath, Not)
        {
            'num': '2',
            'S': [
                ('C5', 2, [('with', 'single', 1), ('ro-', 'begin', 2)], 'start'),
                ('Bb4', 2, None, 'stop'),
                ('A4', 2, [('thine', 'single', 1), ('-sy', 'end', 2)]),
                ('G4', 2, [('eyes,', 'single', 1), ('wreath,', 'single', 2)], 'start'),
                ('A4', 2, None, 'stop'),
                ('Bb4', 2, [('and', 'single', 1), ('Not', 'single', 2)]),
            ],
            'A': [
                ('A4', 4, [('with', 'single', 1), ('ro-', 'begin', 2)]),
                ('F4', 2, [('thine', 'single', 1), ('-sy', 'end', 2)]),
                ('G4', 4, [('eyes,', 'single', 1), ('wreath,', 'single', 2)]),
                ('E4', 2, [('and', 'single', 1), ('Not', 'single', 2)]),
            ],
            'B': [
                ('A3', 2, [('with', 'single', 1), ('ro-', 'begin', 2)], 'start'),
                ('F3', 2, None, 'stop'),
                ('D3', 2, [('thine', 'single', 1), ('-sy', 'end', 2)]),
                ('G2', 2, [('eyes,', 'single', 1), ('wreath,', 'single', 2)], 'start'),
                ('A2', 2, None, 'stop'),
                ('Bb2', 2, [('and', 'single', 1), ('Not', 'single', 2)]),
            ]
        },
        # M3 (I will pledge with / so much hon-'ring)
        {
            'num': '3',
            'S': [
                ('C5', 2, [('I', 'single', 1), ('so', 'single', 2)], 'start'),
                ('F4', 2, None, 'stop'),
                ('Bb4', 2, [('will', 'single', 1), ('much', 'single', 2)]),
                ('A4', 4, [('pledge', 'single', 1), ('hon-', 'begin', 2)]),
                ('G4', 2, [('with', 'single', 1), ("-'ring", 'end', 2)]),
            ],
            'A': [
                ('F4', 4, [('I', 'single', 1), ('so', 'single', 2)]),
                ('E4', 2, [('will', 'single', 1), ('much', 'single', 2)]),
                ('D4', 4, [('pledge', 'single', 1), ('hon-', 'begin', 2)]),
                ('C4', 2, [('with', 'single', 1), ("-'ring", 'end', 2)]),
            ],
            'B': [
                ('G2', 4, [('I', 'single', 1), ('so', 'single', 2)]),
                ('A2', 2, [('will', 'single', 1), ('much', 'single', 2)]),
                ('Bb2', 4, [('pledge', 'single', 1), ('hon-', 'begin', 2)]),
                ('C3', 2, [('with', 'single', 1), ("-'ring", 'end', 2)]),
            ]
        },
        # M4 (mine; / thee;)
        {
            'num': '4',
            'S': [
                ('F4', 6, [('mine;', 'single', 1), ('thee;', 'single', 2)], None, 'start', True),
                ('F4', 4, None, None, 'stop'),
                ('REST', 2),
            ],
            'A': [
                ('C4', 6, [('mine;', 'single', 1), ('thee;', 'single', 2)], None, 'start', True),
                ('C4', 4, None, None, 'stop'),
                ('REST', 2),
            ],
            'B': [
                ('F3', 6, [('mine;', 'single', 1), ('thee;', 'single', 2)], None, 'start', True),
                ('F3', 4, None, None, 'stop'),
                ('REST', 2),
            ]
        },
        # M5 (Or leave a kiss with- / As giv-ing it a)
        {
            'num': '5',
            'S': [
                ('A4', 2, [('Or', 'single', 1), ('As', 'single', 2)]),
                ('A4', 2, [('leave', 'single', 1), ('giv-', 'begin', 2)]),
                ('A4', 2, [('a', 'single', 1), ('-ing', 'end', 2)]),
                ('Bb4', 4, [('kiss', 'single', 1), ('it', 'single', 2)]),
                ('Bb4', 2, [('with-', 'begin', 1), ('a', 'single', 2)]),
            ],
            'A': [
                ('F4', 2, [('Or', 'single', 1), ('As', 'single', 2)]),
                ('F4', 2, [('leave', 'single', 1), ('giv-', 'begin', 2)]),
                ('F4', 2, [('a', 'single', 1), ('-ing', 'end', 2)]),
                ('G4', 4, [('kiss', 'single', 1), ('it', 'single', 2)]),
                ('G4', 2, [('with-', 'begin', 1), ('a', 'single', 2)]),
            ],
            'B': [
                ('F3', 2, [('Or', 'single', 1), ('As', 'single', 2)]),
                ('F3', 2, [('leave', 'single', 1), ('giv-', 'begin', 2)]),
                ('F3', 2, [('a', 'single', 1), ('-ing', 'end', 2)]),
                ('G3', 4, [('kiss', 'single', 1), ('it', 'single', 2)]),
                ('G3', 2, [('with-', 'begin', 1), ('a', 'single', 2)]),
            ]
        },
        # M6 (-in the cup and / hope that there: It)
        {
            'num': '6',
            'S': [
                ('C5', 2, [('-in', 'end', 1), ('hope', 'single', 2)], 'start'),
                ('Bb4', 2, None, 'stop'),
                ('A4', 2, [('the', 'single', 1), ('that', 'single', 2)]),
                ('G4', 2, [('cup', 'single', 1), ('there:', 'single', 2)], 'start'),
                ('A4', 2, None, 'stop'),
                ('Bb4', 2, [('and', 'single', 1), ('It', 'single', 2)]),
            ],
            'A': [
                ('A4', 4, [('-in', 'end', 1), ('hope', 'single', 2)]),
                ('F4', 2, [('the', 'single', 1), ('that', 'single', 2)]),
                ('G4', 4, [('cup', 'single', 1), ('there:', 'single', 2)]),
                ('E4', 2, [('and', 'single', 1), ('It', 'single', 2)]),
            ],
            'B': [
                ('A3', 2, [('-in', 'end', 1), ('hope', 'single', 2)], 'start'),
                ('F3', 2, None, 'stop'),
                ('D3', 2, [('the', 'single', 1), ('that', 'single', 2)]),
                ('G2', 2, [('cup', 'single', 1), ('there:', 'single', 2)], 'start'),
                ('A2', 2, None, 'stop'),
                ('Bb2', 2, [('and', 'single', 1), ('It', 'single', 2)]),
            ]
        },
        # M7 (I'll not look for / could not with-er'd)
        {
            'num': '7',
            'S': [
                ('C5', 2, [("I'll", 'single', 1), ('could', 'single', 2)], 'start'),
                ('F4', 2, None, 'stop'),
                ('Bb4', 2, [('not', 'single', 1), ('not', 'single', 2)]),
                ('A4', 4, [('look', 'single', 1), ('with-', 'begin', 2)]),
                ('G4', 2, [('for', 'single', 1), ("-er'd", 'end', 2)]),
            ],
            'A': [
                ('F4', 4, [("I'll", 'single', 1), ('could', 'single', 2)]),
                ('E4', 2, [('not', 'single', 1), ('not', 'single', 2)]),
                ('D4', 4, [('look', 'single', 1), ('with-', 'begin', 2)]),
                ('C4', 2, [('for', 'single', 1), ("-er'd", 'end', 2)]),
            ],
            'B': [
                ('G2', 4, [("I'll", 'single', 1), ('could', 'single', 2)]),
                ('A2', 2, [('not', 'single', 1), ('not', 'single', 2)]),
                ('Bb2', 4, [('look', 'single', 1), ('with-', 'begin', 2)]),
                ('C3', 2, [('for', 'single', 1), ("-er'd", 'end', 2)]),
            ]
        },
        # M8 (wine. The / be. But)
        {
            'num': '8',
            'S': [
                ('F4', 6, [('wine.', 'single', 1), ('be.', 'single', 2)], None, None, True),
                ('REST', 4),
                ('C5', 2, [('The', 'single', 1), ('But', 'single', 2)]),
            ],
            'A': [
                ('C4', 6, [('wine.', 'single', 1), ('be.', 'single', 2)], None, None, True),
                ('REST', 4),
                ('C4', 2, [('The', 'single', 1), ('But', 'single', 2)]),
            ],
            'B': [
                ('F3', 6, [('wine.', 'single', 1), ('be.', 'single', 2)], None, None, True),
                ('REST', 4),
                ('F3', 2, [('The', 'single', 1), ('But', 'single', 2)]),
            ]
        },
        # M9 (thirst that from the / thou there-on didst)
        {
            'num': '9',
            'S': [
                ('C5', 2, [('thirst', 'single', 1), ('thou', 'single', 2)], 'start'),
                ('A4', 2, None, 'stop'),
                ('C5', 2, [('that', 'single', 1), ('there-', 'begin', 2)]),
                ('F5', 4, [('from', 'single', 1), ('-on', 'end', 2)]),
                ('C5', 2, [('the', 'single', 1), ('didst', 'single', 2)]),
            ],
            'A': [
                ('F4', 2, [('thirst', 'single', 1), ('thou', 'single', 2)], 'start'),
                ('G4', 2, None, 'stop'),
                ('F4', 2, [('that', 'single', 1), ('there-', 'begin', 2)]),
                ('G4', 4, [('from', 'single', 1), ('-on', 'end', 2)]),
                ('F4', 2, [('the', 'single', 1), ('didst', 'single', 2)]),
            ],
            'B': [
                ('A3', 4, [('thirst', 'single', 1), ('thou', 'single', 2)]),
                ('F3', 2, [('that', 'single', 1), ('there-', 'begin', 2)]),
                ('D3', 4, [('from', 'single', 1), ('-on', 'end', 2)]),
                ('Bb2', 2, [('the', 'single', 1), ('didst', 'single', 2)]),
            ]
        },
        # M10 (soul doth rise, Doth / on-ly breathe, And)
        {
            'num': '10',
            'S': [
                ('C5', 2, [('soul', 'single', 1), ('on-', 'begin', 2)], 'start'),
                ('A4', 2, None, 'stop'),
                ('C5', 2, [('doth', 'single', 1), ('-ly', 'end', 2)]),
                ('C5', 4, [('rise,', 'single', 1), ('breathe,', 'single', 2)]),
                ('C5', 2, [('Doth', 'single', 1), ('And', 'single', 2)]),
            ],
            'A': [
                ('E4', 2, [('soul', 'single', 1), ('on-', 'begin', 2)], 'start'),
                ('G4', 2, None, 'stop'),
                ('E4', 2, [('doth', 'single', 1), ('-ly', 'end', 2)]),
                ('F4', 4, [('rise,', 'single', 1), ('breathe,', 'single', 2)]),
                ('C4', 2, [('Doth', 'single', 1), ('And', 'single', 2)]),
            ],
            'B': [
                ('C3', 4, [('soul', 'single', 1), ('on-', 'begin', 2)]),
                ('C3', 2, [('doth', 'single', 1), ('-ly', 'end', 2)]),
                ('F2', 4, [('rise,', 'single', 1), ('breathe,', 'single', 2)]),
                ('A2', 2, [('Doth', 'single', 1), ('And', 'single', 2)]),
            ]
        },
        # M11 (ask a drink di- / sent'st it back to)
        {
            'num': '11',
            'S': [
                ('E5', 4, [('ask', 'single', 1), ("sent'st", 'single', 2)]),
                ('D5', 2, [('a', 'single', 1), ('it', 'single', 2)]),
                ('D5', 2, [('drink', 'single', 1), ('back', 'single', 2)], 'start'),
                ('C5', 2, None, 'stop'),
                ('Bb4', 2, [('di-', 'begin', 1), ('to', 'single', 2)]),
            ],
            'A': [
                ('G4', 4, [('ask', 'single', 1), ("sent'st", 'single', 2)]),
                ('F4', 2, [('a', 'single', 1), ('it', 'single', 2)]),
                ('F4', 4, [('drink', 'single', 1), ('back', 'single', 2)]),
                ('F4', 2, [('di-', 'begin', 1), ('to', 'single', 2)]),
            ],
            'B': [
                ('Bb2', 4, [('ask', 'single', 1), ("sent'st", 'single', 2)]),
                ('F3', 2, [('a', 'single', 1), ('it', 'single', 2)]),
                ('G3', 4, [('drink', 'single', 1), ('back', 'single', 2)]),
                ('Bb3', 2, [('di-', 'begin', 1), ('to', 'single', 2)]),
            ]
        },
        # M12 (-vine; / me;)
        {
            'num': '12',
            'S': [
                ('C5', 6, [('-vine;', 'end', 1), ('me;', 'single', 2)], None, 'start', True),
                ('C5', 4, None, None, 'stop'),
                ('REST', 2),
            ],
            'A': [
                ('E4', 6, [('-vine;', 'end', 1), ('me;', 'single', 2)], None, 'start', True),
                ('E4', 4, None, None, 'stop'),
                ('REST', 2),
            ],
            'B': [
                ('C3', 6, [('-vine;', 'end', 1), ('me;', 'single', 2)], None, 'start', True),
                ('C3', 4, None, None, 'stop'),
                ('REST', 2),
            ]
        },
        # M13 (But might I of Jove's / Since when it looks and)
        {
            'num': '13',
            'S': [
                ('A4', 2, [('But', 'single', 1), ('Since', 'single', 2)]),
                ('A4', 2, [('might', 'single', 1), ('when', 'single', 2)]),
                ('A4', 2, [('I', 'single', 1), ('it', 'single', 2)]),
                ('Bb4', 4, [('of', 'single', 1), ('looks', 'single', 2)]),
                ('Bb4', 2, [("Jove's", 'single', 1), ('and', 'single', 2)]),
            ],
            'A': [
                ('F4', 2, [('But', 'single', 1), ('Since', 'single', 2)]),
                ('F4', 2, [('might', 'single', 1), ('when', 'single', 2)]),
                ('F4', 2, [('I', 'single', 1), ('it', 'single', 2)]),
                ('G4', 4, [('of', 'single', 1), ('looks', 'single', 2)]),
                ('G4', 2, [("Jove's", 'single', 1), ('and', 'single', 2)]),
            ],
            'B': [
                ('F3', 2, [('But', 'single', 1), ('Since', 'single', 2)]),
                ('F3', 2, [('might', 'single', 1), ('when', 'single', 2)]),
                ('F3', 2, [('I', 'single', 1), ('it', 'single', 2)]),
                ('G3', 4, [('of', 'single', 1), ('looks', 'single', 2)]),
                ('G3', 2, [("Jove's", 'single', 1), ('and', 'single', 2)]),
            ]
        },
        # M14 (nec- -tar sup; I / smells, I swear: Not)
        {
            'num': '14',
            'S': [
                ('C5', 2, [('nec-', 'begin', 1), ('smells,', 'single', 2)], 'start'),
                ('Bb4', 2, None, 'stop'),
                ('A4', 2, [('-tar', 'end', 1), ('I', 'single', 2)]),
                ('G4', 2, [('sup;', 'single', 1), ('swear:', 'single', 2)], 'start'),
                ('A4', 2, None, 'stop'),
                ('Bb4', 2, [('I', 'single', 1), ('Not', 'single', 2)]),
            ],
            'A': [
                ('A4', 4, [('nec-', 'begin', 1), ('smells,', 'single', 2)]),
                ('F4', 2, [('-tar', 'end', 1), ('I', 'single', 2)]),
                ('G4', 4, [('sup;', 'single', 1), ('swear:', 'single', 2)]),
                ('E4', 2, [('I', 'single', 1), ('Not', 'single', 2)]),
            ],
            'B': [
                ('A3', 2, [('nec-', 'begin', 1), ('smells,', 'single', 2)], 'start'),
                ('F3', 2, None, 'stop'),
                ('D3', 2, [('-tar', 'end', 1), ('I', 'single', 2)]),
                ('G2', 2, [('sup;', 'single', 1), ('swear:', 'single', 2)], 'start'),
                ('A2', 2, None, 'stop'),
                ('Bb2', 2, [('I', 'single', 1), ('Not', 'single', 2)]),
            ]
        },
        # M15 (would not change for / of it-self but)
        {
            'num': '15',
            'S': [
                ('C5', 2, [('would', 'single', 1), ('of', 'single', 2)], 'start'),
                ('F4', 2, None, 'stop'),
                ('Bb4', 2, [('not', 'single', 1), ('it-', 'begin', 2)]),
                ('A4', 4, [('change', 'single', 1), ('-self', 'end', 2)]),
                ('G4', 2, [('for', 'single', 1), ('but', 'single', 2)]),
            ],
            'A': [
                ('F4', 2, [('would', 'single', 1), ('of', 'single', 2)], 'start'),
                ('C4', 2, None, 'stop'),
                ('D4', 2, [('not', 'single', 1), ('it-', 'begin', 2)]),
                ('C4', 4, [('change', 'single', 1), ('-self', 'end', 2)]),
                ('Bb3', 2, [('for', 'single', 1), ('but', 'single', 2)]),
            ],
            'B': [
                ('Bb2', 4, [('would', 'single', 1), ('of', 'single', 2)]),
                ('C3', 2, [('not', 'single', 1), ('it-', 'begin', 2)]),
                ('C3', 4, [('change', 'single', 1), ('-self', 'end', 2)]),
                ('C3', 2, [('for', 'single', 1), ('but', 'single', 2)]),
            ]
        },
        # M16 (thine. / thee.)
        {
            'num': '16',
            'S': [
                ('F4', 6, [('thine.', 'single', 1), ('thee.', 'single', 2)], None, 'start', True),
                ('F4', 4, None, None, 'stop'),
                ('REST', 2),
            ],
            'A': [
                ('A3', 6, [('thine.', 'single', 1), ('thee.', 'single', 2)], None, 'start', True),
                ('A3', 4, None, None, 'stop'),
                ('REST', 2),
            ],
            'B': [
                ('F3', 6, [('thine.', 'single', 1), ('thee.', 'single', 2)], None, 'start', True),
                ('F3', 4, None, None, 'stop'),
                ('REST', 2),
            ]
        }
    ]

    for v_id, v_name, v_abb, clef_sign, clef_line, oct_ch in selected_voices:
        part_el = ET.SubElement(score, 'part', id=v_id)
        voice_part_key = 'S' if v_id == 'P1' else ('A' if v_id == 'P2' else 'B')

        for m_data in measures:
            m_el = ET.SubElement(part_el, 'measure', number=m_data['num'])

            if m_data['num'] == '1':
                attr_el = ET.SubElement(m_el, 'attributes')
                div_el = ET.SubElement(attr_el, 'divisions')
                div_el.text = '4'

                key_el = ET.SubElement(attr_el, 'key')
                fifths_el = ET.SubElement(key_el, 'fifths')
                fifths_el.text = '-1' # F Major
                mode_el = ET.SubElement(key_el, 'mode')
                mode_el.text = 'major'

                time_el = ET.SubElement(attr_el, 'time')
                b_el = ET.SubElement(time_el, 'beats')
                b_el.text = '6'
                bt_el = ET.SubElement(time_el, 'beat-type')
                bt_el.text = '8'

                clef_el = ET.SubElement(attr_el, 'clef')
                s_el = ET.SubElement(clef_el, 'sign')
                s_el.text = clef_sign
                l_el = ET.SubElement(clef_el, 'line')
                l_el.text = str(clef_line)

                # Direction / Tempo (alleen op de bovenste stem P1)
                if v_id == 'P1':
                    dir_el = ET.SubElement(m_el, 'direction', placement='above')
                    d_type = ET.SubElement(dir_el, 'direction-type')
                    words = ET.SubElement(d_type, 'words')
                    words.text = 'Andante espressivo (♩. = 50)'
                    snd = ET.SubElement(dir_el, 'sound', tempo='75')

            notes = m_data[voice_part_key]
            for n in notes:
                add_note_element(m_el, n, 1)

            if m_data['num'] == '16':
                barline = ET.SubElement(m_el, 'barline', location='right')
                bstyle = ET.SubElement(barline, 'bar-style')
                bstyle.text = 'light-heavy'

    # XML formatteren
    xml_str = ET.tostring(score, encoding='utf-8')
    dom = minidom.parseString(xml_str)
    pretty_xml = dom.toprettyxml(indent='  ', encoding='UTF-8')

    lines = [line for line in pretty_xml.decode('utf-8').split('\n') if line.strip()]
    return '\n'.join(lines) + '\n'

if __name__ == '__main__':
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sample-scores')
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, 'drink-to-me-only.musicxml')

    xml_content = build_drink_to_me_only_musicxml()
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(xml_content)

    print(f'Successfully generated {out_file} ({len(xml_content.splitlines())} lines)')
