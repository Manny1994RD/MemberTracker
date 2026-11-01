"""Builds the live demo: injects the shared icon/plant code into app.src.html.
Outputs demo/app.html (artifact page body) and demo/index.html (standalone file)."""
import pathlib, re
root = pathlib.Path(__file__).parent
src = (root / 'app.src.html').read_text()
mock = (root.parent / 'mockup' / 'index.html').read_text()
start = mock.index('/* =====================================================================\n   ICONS')
end = mock.index('/* =====================================================================\n   DATA')
page = src.replace('/*@@ICONS@@*/', mock[start:end].rstrip())
(root / 'app.html').write_text(page)
(root / 'index.html').write_text('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n' + page + '\n</body>\n</html>\n')
print('built', len(page))
