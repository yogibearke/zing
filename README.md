# Zing! 🎵 — Mobiele Zangtrainer & Partituren (PWA)

Een interactieve, moderne webapplicatie (Progressive Web App) ontworpen voor zangers en koren, direct bruikbaar op desktop en smartphone.

## 🌟 De 4 Pijlers

1. **🌬️ 01 • Basis — Ademhaling & Houding:**
   * Ingebouwde 4-4-8 S-klank ademcirkel met rustgevende chimes.
   * Techniekles buikademhaling door operazangeres Francis van Broekhuizen en oefeningen voor lage flankademhaling.
2. **🔥 02 • Inzingen — Opwarmen & Stemregisters:**
   * Complete 7-daagse opwarmreeks van coach Maggie (*Zangles met Maggie*): Dag 1 t/m 4 en volledige afspeellijst.
   * Automatische piano-vocalises voor Bas/Alt, Bariton/Mezzo en Tenor/Sopraan.
   * Bespeelbaar virtueel referentieklavier (C3 - C5).
3. **🎼 03 • Repertoire — Partituren & Repertoire:**
   * Interactieve MusicXML-partituren (via OpenSheetMusicDisplay) en originele PDF-scans.
   * Ingebouwde koor-oefenspeler per stempartij (Sopraan, Alt, Tenor, Bariton, Bas of Tutti) met instelbaar tempo (BPM).
   * Alle partituren en muzikale gegevens (titel, componist, stempartijen, maatsoort, toonsoort, noten, herhalingen en tempo) worden rechtstreeks en zonder defaults ingeladen vanuit `assets/scores/scores-index.json` en de bijbehorende `.musicxml`- en `.pdf`-bestanden in `assets/scores/`.
4. **🛠️ 04 • Tools — Tools & Zanghulpmiddelen:**
   * Realtime Web Audio stemtrainer met microfoondetectie (exacte noot, bijv. A3 of C4, frequentie in Hz en afwijking in cents).
   * Interactieve visuele metronoom (40 – 200 BPM).
   * Externe zanghulpmiddelen voor gehoortraining, solfège en AI stem-splitters.

---

## 📂 Partituren Beheren (`assets/scores/`)

De app werkt volledig statisch zonder serverbeheer of uploadfunctie in de browser:
1. Plaats nieuwe `.musicxml`- en bijbehorende `.pdf`-bestanden in de map `assets/scores/`.
2. Teksten of extra liedstrofes zet je in MuseScore in een **tekstvak** (kader); die worden mee geëxporteerd in de `.musicxml` en automatisch onder de partituur getoond.
3. Voeg de bestandsnaam van het `.musicxml`-bestand toe aan `assets/scores/scores-index.json`.
4. Bij het openen van de app worden alle gegevens automatisch uit de XML- en PDF-bestanden gelezen.

---

## 📱 Installeren als App op Smartphone

Open de GitHub Pages link op je telefoon:
* **Android (Chrome):** Tik op de knop *"Installeer App"* in de header of kies via de 3 puntjes *"App installeren"*.
* **iPhone (Safari):** Tik onderaan op het deel-icoontje (vierkantje met pijl omhoog) en kies *"Zet op beginscherm"*.
