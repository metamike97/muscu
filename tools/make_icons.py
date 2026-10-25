# Dessine l'icône (haltère blanc sur fond bleu) et l'écrit en PNG, sans bibliothèque externe.
import struct, zlib

BG = (37, 99, 235)      # bleu de l'app
FG = (255, 255, 255)

# rectangles arrondis de l'haltère, en coordonnées 0..1 : (x0, y0, x1, y1, rayon)
SHAPES = [
    (0.22, 0.465, 0.78, 0.535, 0.03),   # barre
    (0.30, 0.30, 0.38, 0.70, 0.03),     # disque intérieur gauche
    (0.62, 0.30, 0.70, 0.70, 0.03),     # disque intérieur droit
    (0.20, 0.38, 0.28, 0.62, 0.03),     # disque extérieur gauche
    (0.72, 0.38, 0.80, 0.62, 0.03),     # disque extérieur droit
]

def inside(x, y):
    for x0, y0, x1, y1, r in SHAPES:
        cx, cy = min(max(x, x0 + r), x1 - r), min(max(y, y0 + r), y1 - r)
        if x0 <= x <= x1 and y0 <= y <= y1 and (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
            return True
    return False

def render(size, aa=3):
    rows = []
    for py in range(size):
        row = bytearray([0])  # filtre PNG "aucun"
        for px in range(size):
            hits = sum(inside((px + (i + .5) / aa) / size, (py + (j + .5) / aa) / size)
                       for i in range(aa) for j in range(aa))
            t = hits / (aa * aa)
            row += bytes(round(BG[k] + (FG[k] - BG[k]) * t) for k in range(3))
        rows.append(bytes(row))
    return b''.join(rows)

def png(size, path):
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    raw = render(size)
    data = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    open(path, 'wb').write(data)
    print(path, len(data), 'octets')

png(180, 'icons/apple-touch-icon.png')
png(192, 'icons/icon-192.png')
png(512, 'icons/icon-512.png')
