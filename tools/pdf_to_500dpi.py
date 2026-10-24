#!/usr/bin/env python3
"""
Zing! - Universele PDF naar 500 DPI Beeldconverter
Zet elke partituur-PDF om naar ultra-scherpe 500 DPI PNG-afbeeldingen.
Ideaal voor Optical Music Recognition (Audiveris, MuseScore, PlayScore) en high-res weergave in Zing!

Gebruik:
    python tools/pdf_to_500dpi.py "assets/sample-scores/komt-vrienden-in-het-ronde.pdf"
    python tools/pdf_to_500dpi.py "pad/naar/partituur.pdf" --dpi 500 --output-dir "assets/sample-scores"
    python tools/pdf_to_500dpi.py "pad/naar/map-met-pdfs" --dpi 500
"""

import os
import sys
import argparse
from pathlib import Path

# Zorg dat Windows console UTF-8 tekens veilig kan weergeven
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

try:
    import pymupdf  # PyMuPDF v2.0+
except ImportError:
    try:
        import fitz as pymupdf
    except ImportError:
        print("Fout: PyMuPDF is niet geïnstalleerd. Installeer het via: pip install pymupdf", file=sys.stderr)
        sys.exit(1)


def convert_pdf_to_500dpi(pdf_path, output_dir=None, dpi=500, prefix=None, overwrite=True):
    """
    Converteert alle pagina's van een PDF naar PNG's op de opgegeven DPI (standaard 500 DPI).
    
    :param pdf_path: Pad naar het PDF-bestand
    :param output_dir: Map waar de afbeeldingen worden opgeslagen (standaard: map van de PDF)
    :param dpi: Doelresolutie in DPI (standaard 500)
    :param prefix: Bestandsnaam-prefix (standaard: basisnaam van de PDF)
    :param overwrite: Bestaande bestanden overschrijven
    :return: Lijst met paden naar gegenereerde PNG-bestanden
    """
    pdf_file = Path(pdf_path).resolve()
    if not pdf_file.exists():
        raise FileNotFoundError(f"PDF niet gevonden: {pdf_file}")

    if output_dir:
        out_path = Path(output_dir).resolve()
    else:
        out_path = pdf_file.parent
    out_path.mkdir(parents=True, exist_ok=True)

    base_name = prefix if prefix else pdf_file.stem
    doc = pymupdf.open(str(pdf_file))
    total_pages = len(doc)
    generated_files = []

    print(f"\n=======================================================")
    print(f"📄 Verwerken: {pdf_file.name}")
    print(f"   Aantal pagina's: {total_pages}")
    print(f"   Doelresolutie:   {dpi} DPI")
    print(f"   Uitvoermap:      {out_path}")
    print(f"=======================================================")

    # 72 points per inch in PDF standaarden
    zoom = dpi / 72.0
    mat = pymupdf.Matrix(zoom, zoom)

    for page_idx in range(total_pages):
        page_num = page_idx + 1
        page = doc[page_idx]

        # Bepaal afmetingen in inches en verwachte pixels
        rect = page.rect
        width_in = rect.width / 72.0
        height_in = rect.height / 72.0
        expected_w = int(width_in * dpi)
        expected_h = int(height_in * dpi)

        output_filename = f"{base_name}_page_{page_num}.png"
        output_filepath = out_path / output_filename

        if output_filepath.exists() and not overwrite:
            print(f"⏩ Pagina {page_num}/{total_pages}: {output_filename} bestaat reeds (overslaan)")
            generated_files.append(str(output_filepath))
            continue

        print(f"🔄 Pagina {page_num}/{total_pages} renderen... ({width_in:.1f}\" x {height_in:.1f}\" ➔ ~{expected_w}x{expected_h} px)")
        
        # Rendert met subpixel-precisie en RGB kleurechtheid
        pix = page.get_pixmap(matrix=mat, alpha=False)
        pix.save(str(output_filepath))

        file_size_mb = output_filepath.stat().st_size / (1024 * 1024)
        print(f"   ✅ Opgeslagen: {output_filename}")
        print(f"      Resolutie: {pix.width} x {pix.height} px ({file_size_mb:.2f} MB)")

        generated_files.append(str(output_filepath))

    doc.close()
    print(f"\n🎉 Voltooid! {len(generated_files)} afbeeldingen opgeslagen in {out_path}\n")
    return generated_files


def main():
    parser = argparse.ArgumentParser(
        description="Zet elke partituur-PDF om naar 500 DPI PNG afbeeldingen voor OMR en MusicXML transcriptie."
    )
    parser.add_argument("input", help="Pad naar PDF-bestand of map met PDF-bestanden")
    parser.add_argument("--dpi", type=int, default=500, help="Doelresolutie in DPI (standaard: 500)")
    parser.add_argument("-o", "--output-dir", help="Map voor uitvoerbestanden (standaard: map van de PDF)")
    parser.add_argument("--prefix", help="Aangepaste prefix voor de bestandsnamen")
    parser.add_argument("--no-overwrite", action="store_true", help="Bestaande bestanden niet overschrijven")

    args = parser.parse_args()
    input_path = Path(args.input).resolve()

    if not input_path.exists():
        print(f"Fout: Pad '{args.input}' bestaat niet.", file=sys.stderr)
        sys.exit(1)

    if input_path.is_file():
        if input_path.suffix.lower() != '.pdf':
            print(f"Fout: Bestand '{input_path.name}' is geen PDF.", file=sys.stderr)
            sys.exit(1)
        convert_pdf_to_500dpi(
            input_path,
            output_dir=args.output_dir,
            dpi=args.dpi,
            prefix=args.prefix,
            overwrite=not args.no_overwrite
        )
    elif input_path.is_dir():
        pdf_files = sorted(list(input_path.glob("*.pdf")) + list(input_path.glob("*.PDF")))
        if not pdf_files:
            print(f"Geen PDF-bestanden gevonden in {input_path}")
            sys.exit(0)
        print(f"Gevonden PDF's: {len(pdf_files)}")
        for pdf in pdf_files:
            convert_pdf_to_500dpi(
                pdf,
                output_dir=args.output_dir,
                dpi=args.dpi,
                prefix=args.prefix,
                overwrite=not args.no_overwrite
            )


if __name__ == "__main__":
    main()
