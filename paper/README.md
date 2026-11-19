# PulseVault AI — IEEE JBHI Research Paper Source

This directory contains the camera-ready LaTeX source and BibTeX references for the research paper:

> **PulseVault AI: A Hybrid Deterministic-Agentic Clinical Intelligence Architecture for Grounded Multimodal EHR Ingestion, Longitudinal Knowledge Graph Synthesis, and Sub-3-Second Emergency Triage**

## Files
- `main.tex`: Full IEEE Journal of Biomedical and Health Informatics (JBHI) manuscript in standard double-column IEEEtran format.
- `references.bib`: Complete BibTeX bibliography citing 20 peer-reviewed papers from Nature, Nature Medicine, The Lancet Digital Health, JAMIA, and IEEE.

## Compilation Instructions

### Local Compilation (LaTeX / TeX Live / MiKTeX)
```bash
pdflatex main.tex
bibtex main
pdflatex main.tex
pdflatex main.tex
```

### Overleaf Compilation
1. Zip the `paper/` directory contents (`main.tex`, `references.bib`).
2. Go to [Overleaf](https://www.overleaf.com), click **New Project** → **Upload Project**.
3. Select the zip file and compile with standard pdfLaTeX.
