# The World in One Day — Tuesday 17 November 2026

[![make.fun](https://make.fun/badge/news-image-20261117.svg)](https://make.fun/bounty/news-image-20261117)
[![rank](https://make.fun/badge/news-image-20261117/Moksed96/news-image-17-nov-2026/rank.svg)](https://make.fun/bounty/news-image-20261117)
[![reward](https://make.fun/badge/news-image-20261117/Moksed96/news-image-17-nov-2026/reward.svg)](https://make.fun/bounty/news-image-20261117)

A newspaper front page that sums up the world's news of Tuesday 17 November
2026 in one image — drawn entirely in code by `main.ts` (a pure-JS rasterizer
with a hand-rolled PNG encoder, Node 22 standard library only, no photos, no
downloaded images). The program writes `entry.png` (1024×1024, deterministic:
two runs produce byte-identical output).

## The five stories

1. **Tanker attacked in the Strait of Hormuz** — an oil tanker was attacked
   near Khasab, Oman; the crew was evacuated after a fire in the engine room,
   and the US struck Iranian missile sites on Qeshm Island.
   (vietnam.vn; Khaleej Times)
2. **Ukraine hits the Crimea bridge** — a 1,300-drone barrage struck the
   Kerch bridge linking Crimea to Russia; traffic was halted. (RNZ)
3. **Markets plunge** — the Nasdaq fell 2.5% into correction territory, the
   Dow 1.4%, Brent crude 3.6%, and gold slipped. (vietnam.vn)
4. **Trump joins the Quad in Manila** — the US president met the Quad leaders
   on the sidelines of the ASEAN summit, ahead of his trip to China.
   (Outlook India)
5. **JPMorgan outage** — the bank's systems failed across the US, locking
   customers out, before transactions returned to normal. (Outlook India)

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024×1024 PNG, under 1 MiB).
