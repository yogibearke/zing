# Universele OMR Ontwikkelregels (Zing! & Antigravity)

## 0. Hoofddoel & Werkwijze (Incrementele Universele Verfijning)
- **Doel:** Het bouwen van één universeel OMR-conversieprogramma (`tools/scan_to_musicxml.py`) dat **alle mogelijke partituren** (ongeacht bezetting, maatsoort, toonsoort of opmaak) vlekkeloos omzet naar MusicXML.
- **Incrementele Regressie-Werkwijze:**
  - We verfijnen `tools/scan_to_musicxml.py` punt voor punt aan de hand van opeenvolgende referentiepartituren:
    1. `assets/sample-scores/calypso.pdf` (1-balkig S, 2/4 maat, 0 kruisen/mollen) — **100% voltooid (referentie)**.
    2. `assets/sample-scores/befiehl-du-deine-wege.pdf` (4-balkig SATB, 4/4 Common Time `C`, 2 kruisen, met opmaat en herhaling) — **nu in uitvoering**.
    3. `assets/sample-scores/komt-vrienden-in-het-ronde.pdf` (volgende partituur na *Befiehl*).
    4. Alle verdere partituren.
  - Elke verfijning in `tools/scan_to_musicxml.py` moet ervoor zorgen dat de nieuwe partituur vlekkeloos werkt **zonder dat eerder voltooide partituren (zoals *Calypso*) achteruitgaan**.
  - Gebruik voor testen en inspectie altijd rechtstreeks `python tools/scan_to_musicxml.py ...` (met de ingebouwde `SCORE AUDIT` en `--debug-dir`), geen losse ad-hoc `scratch/` scripts.

---

## 1. Absolute Grondregel: 100% Mechanisch & Universeel (Enkel uit de Scan)
- **MUSICXML ENKEL UIT OPTISCHE SCAN & BEELDANALYSE:**
  - De volledige MusicXML (inclusief **bezetting/stemmen, sleutels, toonsoort/aantal kruisen of mollen, maatsoort, maatstrepen, noten, rusten, ritmes, bogen en fermates**) mag **uitsluitend** verkregen worden door optische scanning en computer-vision analyse van de partituur-afbeelding zelf.
  - Het meegeven van muzikale voorkennis via de command-line (zoals `--key-fifths 2`, `--time 4/4` of `--voices SATB`) is niet de bedoeling: alles moet standaard op `auto` staan en rechtstreeks uit de pixels van de scan worden afgeleid.
- **STRIKT VERBODEN:**
  - Geen enkele stuk-specifieke variabele, teksttabel of dictionary (zoals `BEFIEHL_...`, liedtitels, dichters).
  - Geen maat- of stadafhankelijke uitzonderingen (zoals `if m_idx == ...`, `if global_m_idx == ...`, `if part_id == 'P2'`).
  - Geen hardcoded lijsten van noten of toonhoogtes.
- **ALTIJD VERPLICHT:**
  - Elke beslissing in `tools/scan_to_musicxml.py` moet gebaseerd zijn op **universele computer vision en geometrie** (pixelanalyse, morfologische filters, lokale balklijnen $L_1 \dots L_5$, zwaartepunten, dwarsbalken en bogen).
  - Een algoritme moet identiek werken op elke partituur (ongeacht toonsoort, bezetting of componist).
  - Werk rustig en transparant stap voor stap (Stap 1 $\rightarrow$ Stap 2 $\rightarrow$ Stap 3 $\rightarrow$ Stap 4 $\rightarrow$ Stap 5) zodat de gebruiker elke stap kan volgen en controleren.

---

## 2. Vaste 5-Stappenprocedure (Van Systeem & Maten naar Maat-voor-Maat)
Bij het ontwikkelen en controleren van een partituur volgen we altijd stipt deze volgorde:

1. **Stap 1: Systeem- & Balklijndetectie:**
   - Detectie van alle notenbalken ($L_1 \dots L_5$) en balkafstand (`spacing`) via horizontale morfologie en kamfilter.
   - Automatische bepaling van de systeemstructuur en bezetting (1-balkig S, of verticaal gekoppeld SA / SAB / SATB).
2. **Stap 2: Maatstrepen & Maatvakken (Barline-First):**
   - Detectie van alle maatstrepen per systeem vóórdat er naar noten wordt gekeken.
   - Afbakening van de exacte maatvensters `[mx1, mx2]` (inclusief herkenning van opmaat en onvolledige cadens-/slotmaat).
3. **Stap 3: Systeem-Header (Sleutels, Toonsoort, Maatsoort & Start van de Noten):**
   - Analyse van de header-zone links van de eerste maatstreep ($B_1$):
     - Sleutel per balk (G-sleutel, G-8 tenorsleutel, F-sleutel).
     - Toonsoort (aantal kruisen/mollen na de sleutel).
     - Maatsoort (`4/4` Common Time, `2/2` Alla Breve, `2/4`, etc.).
     - Exacte startpositie van de eerste noot (`x_notes_start`) ná sleutel, toonsoort en maatteken.
4. **Stap 4: Maat-voor-Maat Noot- & Symboolanalyse (per maat over alle stemmen):**
   - Binnen elk afgebakend maatvenster `[mx1, mx2]` worden per stem de symbolen in eliminatie-volgorde geanalyseerd:
     1. *Kandidaat-blobs & Open Holtes (`floodFill`):* gesloten en open nootkoppen.
     2. *Toevallige voortekens eerst ($\sharp, \flat, \natural$):* direct links van de nootkop koppelen zodat ze nooit een spooknoot worden.
     3. *Fermates & Nootkop-filtering:* fermates boven de balk detecteren en ruis/boogfragmenten wegfilteren.
     4. *Koptype, Toonhoogte ($L_1 \dots L_5$) & Verlengingspunten (Dots):* exacte projectie op de lokale balklijnen en vrij zwevende punten rechts van de kop.
     5. *Rusten, Stokken, Dwarsbalken (`<beam>`) & Bogen:* stokrichting en stokeinde (`stem_tip_y`) volgen voor achtsten/zestienden, vaantjes, rusten en overbindingen (ties).
5. **Stap 5: Maatharmonisatie, Liedtekst & MusicXML-export:**
   - Controle per maat of de som van de nootduren in elke stem klopt met de doelduur van die maat (opmaat, reguliere maat of slotmaat).
   - Koppeling van liedtekst-syllaben en export naar MusicXML met audit-tabel.

---

## 3. Verificatie-Protocol bij Elke Wijziging
Voorafgaand aan elke codewijziging moet de AI altijd motiveren:
1. **De Universele Formule / Filter:** Welke algemene visuele eigenschap wordt gemeten op de scan-pixels.
2. **De Generieke Werking:** Waarom deze wijziging wiskundig en visueel op elke partituur werkt, zonder enige aanname over een specifieke maat of lied.

---

## 4. Scheiding tussen Tool-Ontwikkeling (Puur Visueel) en Finale Evaluatie (Muzikaal)
- **TIJDENS DE ONTWIKKELING IN DE TOOL (`tools/scan_to_musicxml.py`):**
  - Deze strenge beperking (geen muzikaal redeneren of voorkennis aannemen) geldt **enkel en alleen voor het tool**.
  - De detectielogica mag uitsluitend sturen op visuele feiten: inkt, geometrie, component-dimensies, en lokale balklijnen $L_1 \dots L_5$.
- **NA DE CONVERSIE (MET MUZIKALE OGEN KIJKEN):**
  - Als de conversie door het tool voltooid is en de MusicXML geëxporteerd is, **mag (en moet) de AI wél met muzikale ogen naar het eindresultaat kijken**:
    - Kloppen de zangstemmen en harmonieën samen?
    - Zijn de muzikale fraseringen, ritmes, bogen en tekstplaatsingen logisch en zingbaar in de app Zing!?
    - Zijn er muzikaal onlogische sprongen die wijzen op een gemiste nootkop of verkeerde sleutel?
  - Blijkt uit de muzikale blik dat er iets niet klopt, dan gaan we terug naar de scan om te onderzoeken welke *visuele* eigenschap in het tool moet worden verfijnd om het mechanisch correct te detecteren.

---

## 5. De "Stem-First & Subtractieve Eliminatie" Architectuur
Voor de maat-voor-maat symbooldetectie hanteren we het universele principe:

### A. Stok-Eerst Detectie (Stem-First)
1. **Verticale Stokisolatie:**
   - Een verticaal morfologisch filter ($1 \times \text{int}(2.5 \cdot sp)$) isoleert alle verticale lijnen met een minimale lengte van $\ge 2.5 \cdot sp$.
   - Omdat voortekens ($\sharp, \natural, \flat$) en tekstletters korter zijn ($< 1.5 \cdot sp$), worden ze hier direct en universeel van noten onderscheiden.
2. **Uiteinde A — De Nootkop:**
   - Aan één van de uiteinden zit de nootkop (het dikkere inktlichaam of de open ovaal).
   - **Toonhoogte:** Exacte projectie van het kopcentrum op $L_1 \dots L_5$.
   - **Voortekens:** Zoek direct links van de nootkop naar toevallige tekens ($\sharp, \flat, \natural$).
   - **Verlengingspunten:** Zoek direct rechts van de nootkop naar losse punten (dots, $\times 1.5$ duur).
3. **Uiteinde B — Het Stokeinde (Ritme & Beams):**
   - Aan het andere uiteinde (`stem_tip_y`) bepaalt de horizontale omgeving direct de nootwaarde en balkgroep:
     - **Horizontale inkt alleen naar rechts:** `<beam>begin</beam>` (start van balkgroep).
     - **Horizontale inkt naar links én rechts:** `<beam>continue</beam>` (midden van balkgroep).
     - **Horizontale inkt alleen naar links:** `<beam>end</beam>` (einde van balkgroep).
     - **Aantal evenwijdige balken:** 1 balk = achtste ($2\text{d}$), 2 balken = zestiende ($1\text{d}$).
     - **Vaantje (geen buurnoot):** Achtste ($2\text{d}$) of zestiende ($1\text{d}$).
     - **Kaal stokeinde (witruimte rondom):** Kwartnoot ($4\text{d}$).
4. **Hele Noten (Zonder Stok):**
   - Hele noten zijn de enige uitzondering zonder stok: zij worden gedetecteerd als losstaande grote open holtes (`floodFill`) op de balklijnen.

### B. Subtractieve Eliminatie (Residuele Rusten)
- Nadat alle balklijnen, maatstrepen, noten en bogen zijn geïdentificeerd, worden hun pixels uit het binaire beeld "weggegumd" (gemaskeerd op 0).
- **Wat overblijft in het balkvenster is het zuivere residu: automatisch de rusten!**
  - Kwartrust: typische gekrulde vorm/bliksemschicht in het centrum van de balk.
  - Achtsterust: 7-vormig vlaggetje in de tussenruimtes.
  - Halve/hele rust: rechthoekig inktblokje rustend op of hangend aan een balklijn.
- Doordat de noten eerst zijn verwijderd, kunnen noten en rusten elkaar optisch nooit meer verstoren.
