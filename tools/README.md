# Maintainer tools

The commands exposed through package.json are the normal entry points for
building sprites, powerups, map thumbnails and ice spikes.

These commands are manual maintainer tools rather than part of the normal
build:

- node tools/inspect-sprites.mjs reads source sprite metadata without changing
  files.
- node tools/preview-arena.mjs writes an ignored platform preview under
  tmp/previews/.
- node tools/faststart-instruction-video.mjs rewrites
  public/assets/instruction-video.mp4 to move its MP4 metadata to the front.
  Run it only when deliberately replacing that video.
- powershell -NoProfile -ExecutionPolicy Bypass -File
  tools/process-cleo-punch.ps1 rebuilds Cleo's legacy punch sprites. Its
  backups and diagnostic images are written to tmp/cleo-punch/, never to
  public/assets/.

All tools resolve the project root from their own location, so they can be run
from any checkout path.
