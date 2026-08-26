#!/bin/bash
# usage: run.sh <tool> <key>   — generates gen/<tool>/<key>.png
tool=$1; key=$2
G=/home/andrey/_PROJECTS/watches/eink/imgs/gen
desc=$(grep "^$key|" $G/prompts.txt | cut -d'|' -f2-)
STYLE="Product concept art, one PNG, 4:3, ~1600x1200. Photoreal studio render: brushed dark steel case, black leather strap, neutral grey backdrop, matte paper-like e-ink surface with slight greyish white. Left/right sidebar as a spec sheet: concept name, one-paragraph description, 'how to read' diagrams, small line drawings. Same visual language as a premium watch brochure."
P="Use your image generation tool to create a single PNG named $key.png and save it into the current directory. $STYLE Concept: $desc"
cd $G/$tool
case $tool in
  codex) codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --ephemeral -C $G/codex -- "$P" </dev/null ;;
  agy)   out=$(agy --mode accept-edits --print="Use your generate_image tool to create one image named $key. $STYLE Concept: $desc Do not run any shell commands. Reply with the full saved path." </dev/null 2>&1)
         src=$(echo "$out" | grep -o '/home/[^` )]*\.\(png\|jpg\|jpeg\|webp\)' | tail -1)
         [ -f "$src" ] && cp "$src" "$G/agy/$key.${src##*.}" || { echo "$out" | tail -5; false; } ;;
  agent) agent -p -f --model cursor-grok-4.5-high-fast "$P Save it as $G/agent/$key.png; do not touch any other file." </dev/null ;;
esac
echo "EXIT $? $tool/$key"
