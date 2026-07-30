#!/bin/bash

for f in *.md; do
  [ -e "$f" ] || continue
  echo ">>> $f"
  pandoc "$f" --pdf-engine=xelatex -V mainfont="Noto Sans" -o "${f%.md}.pdf" -V geometry:margin=2cm
done
