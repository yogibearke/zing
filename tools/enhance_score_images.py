#!/usr/bin/env python3
"""
Zing! - Score Image Enhancer
Verscherpt de nootkoppen (bolletjes) en stokken/vlaggetjes (pijltjes),
verwijdert grijze scannerruis en zorgt voor kraakhelder wit papier.
Slaat zowel geoptimaliseerde PNG's als een schone PDF op.
"""

import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def enhance_score_page(input_path, output_path):
    print(f"🔄 Beeld verbeteren: {input_path}")
    im = Image.open(input_path).convert('L')
    
    # 1. Converteer naar numpy array
    arr = np.array(im, dtype=np.float32)
    
    # 2. Achtergrond egaliseren & drempelwaarde voor diepe zwarte noten en strakke lijnen
    # Pixels boven 205 worden 255 (wit)
    # Pixels onder 135 worden donkerder / puur zwart (diepe bolletjes en stokken)
    # Zachte curve ertussen voor perfecte anti-aliasing zonder kartels
    norm = np.clip((arr - 110) / (205 - 110) * 255.0, 0, 255).astype(np.uint8)
    
    clean_im = Image.fromarray(norm)
    
    # 3. Lichte unsharp mask om de nootbolletjes en vlaggetjes extra af te tekenen
    clean_im = clean_im.filter(ImageFilter.UnsharpMask(radius=1.5, percent=140, threshold=3))
    
    # Converteer terug naar RGB voor universele compatibiliteit
    final_im = clean_im.convert('RGB')
    final_im.save(output_path, "PNG", optimize=True)
    
    size_mb = Path(output_path).stat().st_size / (1024 * 1024)
    print(f"   ✅ Verbeterd: {output_path} ({final_im.width}x{final_im.height} px, {size_mb:.2f} MB)")
    return final_im

if __name__ == '__main__':
    p1 = "assets/sample-scores/drink-to-me-only_page_1.png"
    p2 = "assets/sample-scores/drink-to-me-only_page_2.png"
    
    im1 = enhance_score_page(p1, p1)
    im2 = enhance_score_page(p2, p2)
    
    # Sla ook een schone, rechtgezette PDF op
    pdf_path = "assets/sample-scores/drink-to-me-only.pdf"
    im1.save(pdf_path, "PDF", resolution=500.0, save_all=True, append_images=[im2])
    print(f"   ✅ Schone PDF opgeslagen: {pdf_path}")
    print("🎉 Beeldoptimalisatie voltooid!")
