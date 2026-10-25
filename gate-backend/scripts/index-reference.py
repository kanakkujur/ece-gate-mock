"""Index a private reference PDF; requires pypdf. No model training or uploads."""
import hashlib
import json
from pathlib import Path
from pypdf import PdfReader

root = Path(__file__).resolve().parents[2]
source = root / 'references' / '978-93-56819-75-7-GATE-Topicwise-Electronic-and-Communication.pdf'
reader = PdfReader(source)
chunks = []
for number, page in enumerate(reader.pages, 1):
    # The supplied sample's first seven pages are cover/credits/contents.
    # Do not retrieve its contents as if they were formula explanations.
    if number < 8:
        continue
    text = (page.extract_text() or '').strip()
    if not text:
        continue
    topic = 'Z-transform' if number <= 20 else 'DTFT DFT FFT Fourier transform'
    for offset in range(0, len(text), 1000):
        excerpt = text[max(0, offset - 100):offset + 1000]
        chunks.append({'page': number, 'topic': topic, 'text': excerpt})
result = {
    'file': source.name,
    'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'pages': len(reader.pages),
    'coverage': '31-page sample: Z-transforms (PDF pages 8-20), DTFT/DFT/FFT (22-31). Other topics appear in contents only.',
    'limitations': 'Text retrieval only. Mathematical glyphs and diagrams may not extract faithfully. Confirm equations against the original page.',
    'chunks': chunks,
}
destination = source.parent / 'reference-index.json'
destination.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Indexed {len(chunks)} excerpts from {len(reader.pages)} PDF pages.')
