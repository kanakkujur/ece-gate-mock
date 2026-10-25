# Private study references

The user-supplied PDF and `reference-index.json` live here locally and are ignored by Git.
Only this README is published as source. The website build never includes this folder.

The supplied file has **31 physical PDF pages**, with substantive sample chapters on
Z-transforms (pages 8–20) and DTFT/DFT/FFT (pages 22–31). Earlier pages are cover,
credits and contents; they are excluded from retrieval. This is not a complete ECE book.

Rebuild the index with a Python environment containing `pypdf`:

```powershell
python gate-backend/scripts/index-reference.py
```

The companion retrieves at most two relevant excerpts for generation or tutoring,
and stores physical page references with generated questions. It does not train or
fine-tune the model. Formulas and diagrams can be lost during text extraction;
check the original page before relying on a mathematical claim.
