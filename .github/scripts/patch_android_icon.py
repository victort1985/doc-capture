import os
"""Copies the Vixor ERP app icon PNG to all required Android mipmap
directories. Replaces flutter_launcher_icons which had dependency
conflicts — using Pillow directly is simpler and fully reliable.

Android mipmap sizes (mdpi=48, hdpi=72, xhdpi=96, xxhdpi=144, xxxhdpi=192).
Also generates the adaptive icon foreground (same image) since we use a
solid navy background (#121C42) defined in the res/mipmap-anydpi-v26 XML.
"""

import shutil, os
from PIL import Image

SRC = os.path.join(os.path.dirname(__file__), '../../mobile-client/assets/icons/app_icon.png')
SIZES = {
    'mipmap-mdpi':    48,
    'mipmap-hdpi':    72,
    'mipmap-xhdpi':   96,
    'mipmap-xxhdpi':  144,
    'mipmap-xxxhdpi': 192,
}

def main():
    src = Image.open(SRC).convert('RGBA')
    res = 'android/app/src/main/res'
    os.makedirs(res, exist_ok=True)

    for folder, size in SIZES.items():
        dest_dir = os.path.join(res, folder)
        os.makedirs(dest_dir, exist_ok=True)
        resized = src.resize((size, size), Image.LANCZOS)
        resized.save(os.path.join(dest_dir, 'ic_launcher.png'))
        resized.save(os.path.join(dest_dir, 'ic_launcher_round.png'))
        # Adaptive foreground
        resized.save(os.path.join(dest_dir, 'ic_launcher_foreground.png'))
        print(f'  {folder}: {size}×{size}')

    # Adaptive icon XML (anydpi-v26)
    anydpi = os.path.join(res, 'mipmap-anydpi-v26')
    os.makedirs(anydpi, exist_ok=True)
    xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
'''
    with open(os.path.join(anydpi, 'ic_launcher.xml'), 'w') as f: f.write(xml)
    with open(os.path.join(anydpi, 'ic_launcher_round.xml'), 'w') as f: f.write(xml)

    # Color value for adaptive background
    values = os.path.join(res, 'values')
    os.makedirs(values, exist_ok=True)
    colors_path = os.path.join(values, 'ic_launcher_background.xml')
    if not os.path.exists(colors_path):
        with open(colors_path, 'w') as f:
            f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#121C42</color>\n</resources>\n')

    print('Android icons generated.')

if __name__ == '__main__':
    main()
