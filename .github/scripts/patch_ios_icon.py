"""Copies the Vixor ERP icon to iOS Assets.xcassets/AppIcon.appiconset
at all required sizes and writes the Contents.json manifest.
"""

import json, os
from PIL import Image

SRC = '../assets/icons/app_icon.png'
DEST = 'ios/Runner/Assets.xcassets/AppIcon.appiconset'

# Required iOS icon sizes (size_pt, scale)
ICONS = [
    (20, 2), (20, 3),
    (29, 2), (29, 3),
    (40, 2), (40, 3),
    (60, 2), (60, 3),
    (76, 1), (76, 2),
    (83.5, 2),
    (1024, 1),
]

def main():
    src = Image.open(SRC).convert('RGBA')
    os.makedirs(DEST, exist_ok=True)
    images = []

    for pt, scale in ICONS:
        px = int(pt * scale)
        filename = f'Icon-App-{pt}x{pt}@{scale}x.png'
        resized = src.resize((px, px), Image.LANCZOS)
        resized.save(os.path.join(DEST, filename))
        images.append({'idiom': 'iphone' if pt != 76 else 'ipad', 'size': f'{pt}x{pt}', 'scale': f'{scale}x', 'filename': filename})
        print(f'  {filename}: {px}×{px}')

    # Add ipad entries
    ipad_icons = [(20,1),(20,2),(29,1),(29,2),(40,1),(40,2),(76,1),(76,2),(83.5,2),(167,1)]
    for pt, scale in [(76,1),(76,2),(83.5,2)]:
        filename = f'Icon-App-{pt}x{pt}@{scale}x.png'
        images.append({'idiom': 'ipad', 'size': f'{pt}x{pt}', 'scale': f'{scale}x', 'filename': filename})

    # ios-marketing (1024x1024)
    marketing = 'Icon-App-1024x1024@1x.png'
    src.resize((1024, 1024), Image.LANCZOS).save(os.path.join(DEST, marketing))
    images.append({'idiom': 'ios-marketing', 'size': '1024x1024', 'scale': '1x', 'filename': marketing})

    contents = {'images': images, 'info': {'author': 'operix', 'version': 1}}
    with open(os.path.join(DEST, 'Contents.json'), 'w') as f:
        json.dump(contents, f, indent=2)

    print('iOS icons generated.')

if __name__ == '__main__':
    main()
