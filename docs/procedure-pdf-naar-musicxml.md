# Universele Procedure: Van Partituur-PDF naar 500 DPI & MusicXML

Deze handleiding beschrijft de gestandaardiseerde, reproduceerbare werkwijze om **elke willekeurige partituur-PDF** (koor, zang, solo, instrumentaal) om te zetten naar:
1. **Haarscherpe 500 DPI afbeeldingen** (PNG).
2. **MusicXML (.musicxml / .xml)** compatibel met MuseScore, Finale, Sibelius en de Zing! interactieve score-viewer.

---

## 🎯 Waarom 500 DPI?
Optische Muziekherkenning (OMR - *Optical Music Recognition*) is veel gevoeliger voor resolutie dan gewone tekst-OCR:
- **Notenbalklijnen (staff lines):** Zijn slechts 1 à 2 pixels dik bij 150–200 DPI. Bij 500 DPI blijven lijnen continu en ononderbroken.
- **Notenkoppen & Vlaggetjes:** Open noten (halve/hele noten) versus gesloten noten (kwart/achtste) worden feilloos onderscheiden.
- **Voortekens & Verlengingspunten:** Mollen (♭), kruisen (♯), herstellingstekens (♮) en puntjes achter noten raken niet versmeerd met de balklijnen.
- **Liedteksten (Lyrics):** Lettergrepen en koppelingstekens onder de balken blijven perfect leesbaar voor OCR.

---

## 🛠️ Stap 1: PDF omzetten naar 500 DPI Afbeeldingen

In het project is het geautomatiseerde script [`tools/pdf_to_500dpi.py`](file:///c:/programmas/html/muziek/tools/pdf_to_500dpi.py) beschikbaar.

### Enkele PDF converteren
Open een terminal in de hoofdmap van het project (`c:\programmas\html\muziek`) en voer uit:

```powershell
python tools/pdf_to_500dpi.py "assets/sample-scores/jouw-partituur.pdf"
```

### Handige opties:
- **Aangepaste uitvoermap opgeven:**
  ```powershell
  python tools/pdf_to_500dpi.py "pad/naar/bestand.pdf" -o "assets/sample-scores"
  ```
- **Aangepaste prefix voor de pagina's:**
  ```powershell
  python tools/pdf_to_500dpi.py "assets/sample-scores/komt-vrienden.pdf" --prefix "score"
  # Genereert: score_page_1.png, score_page_2.png
  ```
- **Volledige map met meerdere PDF's in batch verwerken:**
  ```powershell
  python tools/pdf_to_500dpi.py "assets/sample-scores" --dpi 500
  ```

---

## 🎼 Stap 2: 500 DPI Afbeeldingen omzetten naar MusicXML

Kies één van onderstaande 3 beproefde methodes:

### Methode A: Audiveris (Open Source OMR — Aanbevolen voor offline gebruik)
[Audiveris](https://github.com/Audiveris/audiveris) is de toonaangevende open-source OMR-software (geschreven in Java).
1. Download en installeer de laatste versie van Audiveris (versie 5.3+).
2. Start Audiveris en sleep de gegenereerde 500 DPI PNG's (`*_page_1.png`, etc.) in het venster.
3. Klik op **Book ➔ Process All Steps** (of druk op `F5`).
4. Controleer eventuele gele/rode waarschuwingsmarkeringen (zoals ontbrekende maatstrepen of maattelling).
5. Kies **Book ➔ Export Book as... ➔ MusicXML (.musicxml)**.
6. Sla het bestand op in `assets/sample-scores/naam-van-lied.musicxml`.

### Methode B: MuseScore Import (Directe workflow)
MuseScore heeft een cloud-gebaseerde OMR service:
1. Open MuseScore 4.
2. Ga naar **Bestand ➔ Importeer PDF...** (of upload via [musescore.com/sheetmusic](https://musescore.com)).
3. MuseScore zet de PDF / 500 DPI afbeeldingen om naar een bewerkbare `.mscz` partituur.
4. Exporteer vanuit MuseScore via **Bestand ➔ Exporteer ➔ MusicXML (.musicxml)**.

### Methode C: AI / LLM Multi-Modal Transcriptie (Uiterst accuraat voor SATB koor)
Voor liederen met specifieke zangstemmen (Sopraan, Alt, Tenor, Bas) en Nederlandse liedteksten kan de visual transcriptie prompt direct worden gebruikt in combinatie met de 500 DPI afbeeldingen:

```text
Transcribeer deze 500 DPI partituurpagina naar een 100% syntactisch valide MusicXML 3.1 partwise bestand.
Let nauwkeurig op:
1. Maatsoort (bijv. 2/4 of 4/4) en toonsoort (aantal kruisen/mollen).
2. Opmaat (measure number="0" implicit="yes" met correcte duur).
3. SATB koorpartijen:
   - Part P1: Sopraan (Treble clef)
   - Part P2: Alt (Treble clef)
   - Part P3: Tenor (G-clef met 8va bassa of F-clef)
   - Part P4: Bas (Bass clef F-4)
4. Voeg onder elke noot de exacte tekstlettergrepen toe (<lyric number="1"><syllabic>...</syllabic><text>...</text></lyric>).
5. Zorg voor exacte maatverdeling en stembalans.
```

---

## 🔍 Stap 3: Validatie in MuseScore & Checklist

Controleer het resulterende `.musicxml` bestand altijd even in MuseScore:
1. **Afspelen (`Spatiebalk`):** Klinkt het ritme en de harmonie zuiver?
2. **Opmaat controle:** Begint maat 1 na de opmaat op tel 1?
3. **Voortekens:** Kloppen incidentele kruisen/mollen (bijvoorbeeld C# in D-mineur)?
4. **SATB Bereik:**
   - Sopraan: C4 – A5
   - Alt: G3 – D5
   - Tenor: C3 – G4
   - Bas: E2 – D4

---

## 🚀 Stap 4: Integratie in Zing!

Zodra het MusicXML-bestand en de 500 DPI PNG's gereed zijn:

1. **Bestanden plaatsen:**
   - Plaats het PDF-bestand in: `assets/sample-scores/[liednaam].pdf`
   - Plaats de MusicXML in: `assets/sample-scores/[liednaam].musicxml`
   - Plaats de 500 DPI scans in: `assets/sample-scores/[liednaam]_page_1.png`

2. **Koppelen in `js/content-data.js`:**
   Voeg het lied toe aan de repertoirelijst met PDF-link, Spotify-track en MusicXML download.

3. **Koppelen in `js/score-viewer.js`:**
   Voeg de noot-arrays toe aan de interactieve audio companion om realtime meezingen en stem-isolatie (Sopraan/Alt/Tenor/Bas) te activeren.
