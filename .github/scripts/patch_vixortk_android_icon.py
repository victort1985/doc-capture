"""Copies the VixorTK app icon PNG to all required Android mipmap
directories — same approach as the main Vixor ERP app's own
patch_android_icon.py (Pillow directly, not flutter_launcher_icons,
for the same dependency-conflict-avoidance reason), just pointed at
this app's own icon path and its own navy background color (matches
this app's actual icon artwork, sampled from its background rather
than reused from the main app's own #121C42 by assumption).
"""
import os
from PIL import Image

SRC = os.path.join(os.path.dirname(__file__), '../../vixortk-client/assets/icons/app-icon.png')
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
        resized.save(os.path.join(dest_dir, 'ic_launcher_foreground.png'))
        print(f'  {folder}: {size}x{size}')

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

    values = os.path.join(res, 'values')
    os.makedirs(values, exist_ok=True)
    colors_path = os.path.join(values, 'ic_launcher_background.xml')
    if not os.path.exists(colors_path):
        with open(colors_path, 'w') as f:
            # VixorTK's own icon background — sampled directly from
            # the actual icon artwork's pixels (rgb(15,21,51)), not
            # copied blindly from the main app's own #121C42.
            f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0F1533</color>\n</resources>\n')

    print('VixorTK Android icons generated.')

if __name__ == '__main__':
    main()
