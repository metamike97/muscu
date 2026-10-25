# À lancer avant chaque déploiement : calcule une empreinte des fichiers de l'app
# et l'écrit dans sw.js (const VERSION = '...'), ce qui force les appareils à se mettre à jour.
import hashlib, re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
sw = (root / 'sw.js').read_text()
assets = re.search(r'const ASSETS = \[(.*?)\];', sw, re.S).group(1)
files = [a.strip(" '\n") for a in assets.replace('\n', ' ').split(',') if a.strip(" '\n")]
h = hashlib.sha256()
for f in sorted(files):
    p = root / ('index.html' if f == './' else f)
    h.update(f.encode()); h.update(p.read_bytes())
version = h.hexdigest()[:10]
(root / 'sw.js').write_text(re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{version}';", sw))
print('sw.js VERSION =', version)
