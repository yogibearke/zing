#!/usr/bin/env python3
"""
Zing! - Score Deskewer
Measures the precise tilt of music staff lines and rotates the image so that staves are 100% horizontal.
Also crops dark scanner margins and fills with clean white paper background.
"""

import sys
from pathlib import Path
import numpy as np
from PIL import Image

if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def find_skew_angle(im_gray, angle_range=(-2.5, 2.5), step=0.05):
    """
    Finds the angle that maximizes the variance of the horizontal projection profile.
    Staff lines produce massive spikes in horizontal projection when aligned horizontally.
    """
    w, h = im_gray.size
    # Focus on the middle 70% where music staves are located
    box = (int(w * 0.12), int(h * 0.12), int(w * 0.88), int(h * 0.88))
    roi = im_gray.crop(box)
    # Downsample for ultra-fast calculation
    roi_small = roi.resize((roi.width // 4, roi.height // 4), Image.Resampling.BILINEAR)
    arr = np.array(roi_small, dtype=np.float32)
    
    # Invert so black ink (staff lines) is high values
    arr = 255.0 - arr
    # Threshold out light gray noise
    arr[arr < 80] = 0

    best_angle = 0.0
    max_var = -1.0

    angles = np.arange(angle_range[0], angle_range[1] + step/2, step)
    for a in angles:
        # Rotate roi_small
        rotated = roi_small.rotate(a, resample=Image.Resampling.BILINEAR, expand=False, fillcolor=255)
        r_arr = 255.0 - np.array(rotated, dtype=np.float32)
        r_arr[r_arr < 80] = 0
        
        # Horizontal projection profile: sum along horizontal rows
        proj = np.sum(r_arr, axis=1)
        var = np.var(proj)
        if var > max_var:
            max_var = var
            best_angle = a

    return best_angle

def deskew_and_clean_page(img_path, output_path):
    print(f"\n📄 Deskewen: {img_path}")
    im = Image.open(img_path)
    im_gray = im.convert('L')
    
    angle = find_skew_angle(im_gray)
    print(f"   🔍 Gemeten scheefstand hoek: {angle:+.2f}°")
    
    # Rotate full image with bicubic interpolation, white fill
    rotated = im.rotate(angle, resample=Image.Resampling.BICUBIC, expand=False, fillcolor=(255, 255, 255))
    
    # Clean borders: check top, bottom, left, right black scanner artifacts and mask with white
    # Convert to numpy to detect black edge pixels (< 80)
    w, h = rotated.size
    rot_gray = np.array(rotated.convert('L'))
    
    # Simple margin cleanup (outer 1.5% edge can be set to white if dark)
    margin_x = int(w * 0.015)
    margin_y = int(h * 0.015)
    
    clean_im = rotated.copy()
    # Mask pure white border around edges
    from PIL import ImageDraw
    draw = ImageDraw.Draw(clean_im)
    draw.rectangle([0, 0, w, margin_y], fill=(255, 255, 255))
    draw.rectangle([0, h - margin_y, w, h], fill=(255, 255, 255))
    draw.rectangle([0, 0, margin_x, h], fill=(255, 255, 255))
    draw.rectangle([w - margin_x, 0, w, h], fill=(255, 255, 255))

    clean_im.save(output_path, "PNG", optimize=True)
    size_mb = Path(output_path).stat().st_size / (1024 * 1024)
    print(f"   ✅ Opgeslagen rechtgezette partituur: {output_path} ({clean_im.width}x{clean_im.height} px, {size_mb:.2f} MB)")
    return angle

if __name__ == '__main__':
    p1_in = "assets/sample-scores/Drink to me only_page_1.png"
    p1_out = "assets/sample-scores/drink-to-me-only_page_1.png"
    p2_in = "assets/sample-scores/Drink to me only_page_2.png"
    p2_out = "assets/sample-scores/drink-to-me-only_page_2.png"
    
    a1 = deskew_and_clean_page(p1_in, p1_out)
    a2 = deskew_and_clean_page(p2_in, p2_out)
    print(f"\n🎉 Klaar! Beide pagina's zijn rechtgezet en opgeslagen.")
