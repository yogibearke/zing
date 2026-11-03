# Universele OMR Ontwikkelregels (Zing!, Antigravity & Audiveris-Methodiek)

## 0. Hoofddoel & Werkwijze (Incrementele Universele Verfijning)
- **Doel:** Het bouwen van één universeel OMR-conversieprogramma (`tools/scan_to_musicxml.py`) dat **alle mogelijke partituren** (ongeacht bezetting, maatsoort, toonsoort of opmaak) vlekkeloos omzet naar MusicXML.
- **Incrementele Regressie-Werkwijze:**
  - We verfijnen `tools/scan_to_musicxml.py` punt voor punt aan de hand van opeenvolgende referentiepartituren:
    1. `assets/sample-scores/calypso.pdf` (1-balkig S, 2/4 maat, 0 kruisen/mollen) — **100% voltooid (referentie)**.
    2. `assets/sample-scores/befiehl-du-deine-wege.pdf` (4-balkig SATB, 4/4 Common Time `C`, 2 kruisen, met opmaat en herhaling) — **100% voltooid (referentie)**.
    3. `assets/sample-scores/drink-to-me-only.pdf` (3-balkig SAB, 6/8 maat, 1 mol, 2 pagina's) — **nu in uitvoering**.
    4. `assets/sample-scores/komt-vrienden-in-het-ronde.pdf` (4-balkig SATB, 2/4 maat, 1 mol, 2 pagina's) — **referentie 4**.
    5. Alle verdere partituren.
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

## 2. De Audiveris-Filosofie & Sequentiële Pipeline
We volgen de beproefde methodiek van **Audiveris** (de toonaangevende open-source OMR-architectuur), waarin muziektekens worden onderverdeeld in:
1. **Variabele vormen (Varying-shape):** Waardestrepen (`BEAMS`), notenstokken (`STEMS`), bogen (`CURVES`).
2. **Vaste vormen (Fixed-shape glyphs):** Nootkoppen (`HEADS`), sleutels, voortekens, rusten.

De kernles van Audiveris is de **volgorde van detectie**:
* **`BEAMS` (Waardestrepen) moeten ALTIJD VÓÓR `HEADS` (Nootkoppen) worden geïdentificeerd en gemaskeerd.** Omdat waardestrepen dik zijn, worden ze anders door morfologische filters onterecht als nootkoppen (op lage hulplijnen zoals F2/G2) herkend.
* **`STEMS` (Nootstokken) verbinden de nootkoppen met de reeds gevonden beams of vaantjes.**
* **`SIG` (Symbol Interpretation Graph):** Elk inktdeeltje wordt paarsgewijs gekoppeld (`HeadStemRelation`, `BeamStemRelation`), waarbij conflicterende hypotheses worden geëlimineerd.

---

## 3. Vaste 5-Stappenprocedure (Audiveris-Georiënteerd)

1. **Stap 1: Systeem- & Balklijndetectie via de Initiële Maatstreep ($B_0$):**
   - Detectie van alle notenbalken ($L_1 \dots L_5$) en balkafstand (`spacing` $sp$) via horizontale morfologie en kamfilter.
   - **Initiële Maatstreep ($B_0$):** De doorlopende verticale lijn/accolade direct aan het begin van de balklijnen ($x_{\text{staff\_start}}$) is de formele eerste maatstreep ($B_0$).
   - **Universele Systeemgroepering:** Inspectie van verticale doorgang $Y_{\text{gap}}$ op de $B_0$-positie:
     - Loopt de inkt van $B_0$ door tussen balken? Dan behoren die balken tot hetzelfde systeem (1-balkig S, 2-balkig SA/piano, 3-balkig SAB, of 4-balkig SATB).
     - Geen hardcoded aannames: de partituur-gravure dicteert zelf zuiver visueel de systeemstructuur.
2. **Stap 2: Binnenmaatstrepen & Maatvakken met Volheidscontrole:**
   - Detectie van alle binnenmaatstrepen per systeem ($B_1, B_2, \dots, B_{\text{end}}$) vóórdat er naar noten wordt gekeken.
   - **Volheidsmeting (`staff_fullness`):** Maatstrepen lopen van de bovenste balklijn $L_0$ tot de onderste $L_4$.
     - Witte pixels, print-onderbrekingen en scan-dropouts worden overbrugd met een verticale sluiting (`cv2.MORPH_CLOSE` met kernel `1x7`).
     - Over de hele hoogte $L_0 \dots L_4$ wordt de dekkingsgraad (volheid) gemeten. Een echte maatstreep vereist hoge volheid ($\ge 70\%$) in alle balken.
   - Afbakening van de exacte maatvensters `[mx1, mx2]` (waarbij maatstrepen aan de randen netjes worden afgeknipt).
3. **Stap 3: Systeem-Header (Sleutels, Toonsoort, Maatsoort & Start van de Noten):**
   - Analyse van de header-zone tussen de initiële maatstreep ($B_0$) en de eerste binnenmaatstreep ($B_1$):
     - Sleutel per balk (G-sleutel, G-8 tenorsleutel, F-sleutel).
     - Toonsoort (aantal kruisen/mollen na de sleutel).
     - Maatsoort (`4/4`, `2/2`, `2/4`, `3/4`, `6/8`, etc.).
     - Exacte startpositie van de eerste noot (`x_notes_start`) ná de header.
4. **Stap 4: Maat-voor-Maat Semantische Ontleding (Audiveris-Volgorde):**
   - Binnen elk maatvenster `[mx1 + 4, mx2 - 4]` per balk worden de componenten in deze volgorde ontleed:
     1. **Waardestrepen eerst (`BEAMS`):** Brede horizontale of licht hellende balken (breedte $\ge 1.8 \cdot sp$, dikte $0.25 \dots 0.45 \cdot sp$). Deze worden direct als balkgroep geregistreerd en **gemaskeerd uit het binaire beeld**.
     2. **Nootkoppen (`HEADS`):** Op het beam-vrije beeld worden gesloten nootkoppen (elliptisch filter $\approx 0.52 \cdot sp \times 0.36 \cdot sp$) en open holtes (`floodFill`) gedetecteerd. Hierdoor kunnen beams **nooit meer als spooknootkoppen worden gezien**.
     3. **Nootstokken (`STEMS`):** Verticale lijnen (hoogte $\ge 1.3 \cdot sp$, dikte 1–3 px) die nootkoppen verbinden met beams of vaantjes.
     4. **Bipartite Koppeling (`HeadStemRelation`):** Paarsgewijze binding van koppen en stokken. Aan het vrije stokeinde (`stem_tip_y`) bepaalt de koppeling met de eerder gevonden beams of vlaggetjes het ritme (achtste, zestiende, kwartnoot).
     5. **Toevallige Voortekens (`SYMBOLS`):** $\sharp, \flat, \natural$ direct links van de nootkop koppelen.
     6. **Bogen (`CURVES`):** Legatobogen en ties die zweven boven of onder de nootkoppen.
     7. **Residuele Rusten:** Na aftrek van alle lijnen, noten en beams blijft het zuivere rusten-residu over.
5. **Stap 5: Maatharmonisatie, Liedtekst & MusicXML-export:**
   - Controle per maat of de som van de nootduren klopt met de nominale maatduur (bijv. 12 divisions voor 6/8, 16 voor 4/4).
   - Koppeling van liedtekst-syllaben per maat (inclusief meerstemmige coupletten via `|`).
   - Export naar MusicXML met audit-tabel.

---

## 4. Verificatie-Protocol bij Elke Wijziging
Voorafgaand aan elke codewijziging moet de AI altijd motiveren:
1. **De Universele Formule / Filter:** Welke algemene visuele eigenschap wordt gemeten op de scan-pixels.
2. **De Generieke Werking:** Waarom deze wijziging wiskundig en visueel op elke partituur werkt, zonder enige aanname over een specifieke maat of lied.

---

## 5. Scheiding tussen Tool-Ontwikkeling (Puur Visueel) en Finale Evaluatie (Muzikaal)
- **TIJDENS DE ONTWIKKELING IN DE TOOL (`tools/scan_to_musicxml.py`):**
  - Detectielogica mag uitsluitend sturen op visuele feiten: inkt, geometrie, component-dimensies, en lokale balklijnen $L_1 \dots L_5$.
- **NA DE CONVERSIE (MET MUZIKALE OGEN KIJKEN):**
  - Als de conversie voltooid is, kijkt de AI met muzikale ogen naar het eindresultaat:
    - Kloppen de zangstemmen en harmonieën samen?
    - Zijn de muzikale fraseringen, ritmes, bogen en tekstplaatsingen logisch en zingbaar in de app Zing!?
    - Wijzen onlogische sprongen op een gemiste nootkop of verwisselde balk?
  - Bij afwijkingen onderzoeken we welke *visuele* eigenschap in het tool moet worden verfijnd om het mechanisch correct te detecteren.
