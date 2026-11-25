"""Writes assets/fonts/web/*.woff2, the web's copies of the app's fonts.

    python3 -m venv .venv-web-fonts
    .venv-web-fonts/bin/pip install -r scripts/make-web-fonts.requirements.txt
    .venv-web-fonts/bin/python -I scripts/make-web-fonts.py

Each is the TTF that Android loads (src/theme/fontFiles.ts), glyph for glyph,
in WOFF2's compression: the page preloads all five before its text shows, so
smaller files show it sooner on a slow connection (src/theme/fontFiles.web.ts).
It also writes assets/fonts/web/sources.json, each copy's TTF and that file's
SHA-256: src/theme/fontFiles.test.ts fails once a TTF no longer matches (a font
package or assets/fonts/Figurines.ttf changed) until this runs again.
"""

import hashlib
import json
from pathlib import Path as FilePath

from fontTools.ttLib import TTFont

ROOT = FilePath(__file__).resolve().parent.parent
GOOGLE = ROOT / 'node_modules' / '@expo-google-fonts'

# Each output's name (the family's, as fontFiles.web.ts loads it): its TTF.
SOURCES = {
    'DMSerifDisplay_400Regular': GOOGLE / 'dm-serif-display/400Regular/DMSerifDisplay_400Regular.ttf',
    'DMSerifDisplay_400Regular_Italic': GOOGLE
    / 'dm-serif-display/400Regular_Italic/DMSerifDisplay_400Regular_Italic.ttf',
    'InstrumentSans_400Regular': GOOGLE / 'instrument-sans/400Regular/InstrumentSans_400Regular.ttf',
    'DMMono_400Regular': GOOGLE / 'dm-mono/400Regular/DMMono_400Regular.ttf',
    'Figurines': ROOT / 'assets/fonts/Figurines.ttf',
}

OUT = ROOT / 'assets' / 'fonts' / 'web'


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sources = {}
    for name, source in SOURCES.items():
        # The source's own timestamps, so the same TTF always writes the same file.
        font = TTFont(source, recalcTimestamp=False)
        font.flavor = 'woff2'
        target = OUT / f'{name}.woff2'
        font.save(target)
        print(f'{target.relative_to(ROOT)}: {source.stat().st_size} -> {target.stat().st_size} bytes')
        sources[name] = {
            'ttf': source.relative_to(ROOT).as_posix(),
            'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        }
    (OUT / 'sources.json').write_text(json.dumps(sources, indent=2) + '\n')


if __name__ == '__main__':
    main()
