// News image: "The world in one day — Tuesday 17 November 2026".
// A pure-JS rasterizer + hand-rolled PNG encoder (Node 22 standard library
// only). Draws a newspaper front page summing up five real stories from
// 17 Nov 2026, all drawn in code — no photos, no downloaded images.
// Deterministic: two runs write byte-identical output.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
const PAPER: RGB = [247, 242, 231];
const INK: RGB = [26, 26, 26];
const RED: RGB = [178, 32, 42];
const BLUE: RGB = [28, 68, 120];
const SKY: RGB = [173, 216, 235];
const SEA: RGB = [38, 92, 140];
const SAND: RGB = [232, 214, 176];
const WHITE: RGB = [255, 255, 255];
const GREY: RGB = [120, 120, 118];
const DARKGREY: RGB = [70, 70, 70];
const ORANGE: RGB = [232, 110, 24];
const YELLOW: RGB = [244, 196, 48];
const GREEN: RGB = [34, 120, 60];
const LIGHTGREY: RGB = [226, 222, 212];

type RGB = [number, number, number];

// ------------------------------------------------------------------ canvas
class Canvas {
  readonly w = W;
  readonly h = H;
  readonly buf = new Uint8Array(W * H * 3);
  // Optional clip rectangle (inclusive-exclusive); defaults to the full canvas.
  private cx0 = 0;
  private cy0 = 0;
  private cx1 = W;
  private cy1 = H;

  clip(x: number, y: number, w: number, h: number): void {
    this.cx0 = x;
    this.cy0 = y;
    this.cx1 = x + w;
    this.cy1 = y + h;
  }

  unclip(): void {
    this.cx0 = 0;
    this.cy0 = 0;
    this.cx1 = W;
    this.cy1 = H;
  }

  constructor() {
    for (let i = 0; i < W * H; i++) {
      this.buf[i * 3] = PAPER[0];
      this.buf[i * 3 + 1] = PAPER[1];
      this.buf[i * 3 + 2] = PAPER[2];
    }
  }

  px(x: number, y: number, c: RGB): void {
    if (x < this.cx0 || y < this.cy0 || x >= this.cx1 || y >= this.cy1) return;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }

  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c);
    }
  }

  // Filled circle via horizontal scanlines.
  circle(cx: number, cy: number, r: number, c: RGB): void {
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(r * r - dy * dy));
      for (let xx = cx - dx; xx <= cx + dx; xx++) this.px(xx, cy + dy, c);
    }
  }

  // Thick line: steps along the segment, stamping circles.
  line(x0: number, y0: number, x1: number, y1: number, t: number, c: RGB): void {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const r = Math.max(1, Math.floor(t / 2));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps);
      const y = Math.round(y0 + ((y1 - y0) * i) / steps);
      this.circle(x, y, r, c);
    }
  }

  // Filled triangle (scanline).
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    const minY = Math.min(y0, y1, y2);
    const maxY = Math.max(y0, y1, y2);
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      const edges: Array<[number, number, number, number]> = [
        [x0, y0, x1, y1],
        [x1, y1, x2, y2],
        [x2, y2, x0, y0],
      ];
      for (const [ax, ay, bx, by] of edges) {
        if ((ay <= y && by > y) || (by <= y && ay > y)) {
          xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
        }
      }
      if (xs.length >= 2) {
        const lo = Math.min(...xs);
        const hi = Math.max(...xs);
        for (let x = Math.floor(lo); x <= Math.ceil(hi); x++) this.px(x, y, c);
      }
    }
  }

  // Filled ellipse via scanlines.
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    for (let dy = -ry; dy <= ry; dy++) {
      const dx = Math.floor(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)));
      for (let xx = cx - dx; xx <= cx + dx; xx++) this.px(xx, cy + dy, c);
    }
  }

  // Horizontal band with a wavy top edge (for sea / hills).
  wave(x0: number, x1: number, yBase: number, amp: number, period: number, phase: number, c: RGB): void {
    for (let x = x0; x <= x1; x++) {
      const yTop = Math.round(yBase + amp * Math.sin(((x - x0) / period) * Math.PI * 2 + phase));
      for (let y = yTop; y <= yBase + amp + 2; y++) this.px(x, y, c);
    }
  }
}

// ------------------------------------------------------------- bitmap font
// 5x7 glyphs, each row a 5-bit mask (bit 4 = leftmost pixel).
const FONT: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ',': [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ':': [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ';': [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  '-': [0, 0, 0, 0x0e, 0, 0, 0],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  '?': [0x0e, 0x11, 0x01, 0x06, 0x04, 0, 0x04],
  '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  '&': [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  '%': [0x19, 0x1a, 0x02, 0x04, 0x08, 0x0b, 0x13],
  '+': [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  '=': [0, 0, 0x1f, 0, 0x1f, 0, 0],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '"': [0x0a, 0x0a, 0, 0, 0, 0, 0],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  '·': [0, 0, 0, 0x0c, 0x0c, 0, 0],
  '*': [0, 0x04, 0x15, 0x0e, 0x15, 0x04, 0],
};

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  for (const raw of s) {
    const ch = raw.toUpperCase();
    const g = FONT[ch] ?? FONT['?'];
    for (let r = 0; r < 7; r++) {
      for (let bit = 0; bit < 5; bit++) {
        if (g[r] & (1 << (4 - bit))) {
          cv.rect(cx + bit * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentered(cv: Canvas, s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(cv, s, cx - Math.floor(textWidth(s, scale) / 2), y, scale, c);
}

// ------------------------------------------------------------ PNG encoder
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(cv: Canvas): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    Buffer.from(cv.buf.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ scenes
// Panel frame: white card, ink border, red kicker tag.
function panel(cv: Canvas, x: number, y: number, w: number, h: number, tag: string): void {
  cv.rect(x, y, w, h, WHITE);
  cv.rect(x, y, w, 3, INK);
  cv.rect(x, y, 3, h, INK);
  cv.rect(x + w - 3, y, 3, h, INK);
  cv.rect(x, y + h - 3, w, 3, INK);
  const tw = textWidth(tag, 2) + 16;
  cv.rect(x + 12, y + 10, tw, 22, RED);
  drawText(cv, tag, x + 20, y + 14, 2, WHITE);
}

// Headline (scale 4) + up to 2 sub lines (scale 2), left aligned in panel.
function headline(cv: Canvas, x: number, y: number, lines: string[], c: RGB = INK): number {
  let yy = y;
  for (const ln of lines) {
    drawText(cv, ln, x, yy, 4, c);
    yy += 34;
  }
  return yy;
}
function sub(cv: Canvas, x: number, y: number, lines: string[]): number {
  let yy = y;
  for (const ln of lines) {
    drawText(cv, ln, x, yy, 2, DARKGREY);
    yy += 20;
  }
  return yy;
}

// --- Panel A: tanker on fire in the Strait of Hormuz (x,y,w,h of scene)
function sceneHormuz(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.clip(x, y, w, h);
  cv.rect(x, y, w, h, SKY);
  // sun, hazy
  cv.circle(x + w - 70, y + 34, 22, YELLOW);
  // distant cliffs (Oman side)
  cv.tri(x, y + h - 60, x + 90, y + h - 118, x + 190, y + h - 60, SAND);
  cv.tri(x + w - 200, y + h - 60, x + w - 90, y + h - 108, x + w, y + h - 60, SAND);
  // sea
  cv.rect(x, y + h - 62, w, 62, SEA);
  cv.wave(x, x + w, y + h - 62, 4, 60, 0, [70, 140, 190]);
  cv.wave(x, x + w, y + h - 34, 4, 46, 2, [70, 140, 190]);
  // tanker hull
  const hx = x + 96;
  const hy = y + h - 80;
  cv.rect(hx, hy, 300, 34, [40, 40, 44]);
  cv.rect(hx + 8, hy + 34, 284, 8, [24, 24, 26]);
  // deck: bridge block + funnel
  cv.rect(hx + 226, hy - 34, 52, 34, [220, 222, 226]);
  cv.rect(hx + 238, hy - 46, 28, 12, [220, 222, 226]);
  cv.rect(hx + 40, hy - 26, 60, 26, [150, 40, 36]);
  // containers
  cv.rect(hx + 110, hy - 18, 46, 18, [200, 120, 40]);
  cv.rect(hx + 160, hy - 18, 46, 18, [40, 110, 70]);
  // fire at the funnel / engine room
  cv.tri(hx + 236, hy - 46, hx + 252, hy - 70, hx + 268, hy - 46, ORANGE);
  cv.tri(hx + 244, hy - 46, hx + 252, hy - 62, hx + 260, hy - 46, YELLOW);
  cv.tri(hx + 248, hy - 46, hx + 252, hy - 56, hx + 256, hy - 46, [255, 230, 120]);
  // smoke
  cv.circle(hx + 252, hy - 78, 12, DARKGREY);
  cv.circle(hx + 270, hy - 90, 14, GREY);
  cv.circle(hx + 296, hy - 84, 10, [150, 150, 148]);
  // lifeboat / rescue boat with crew
  cv.rect(x + 30, y + h - 30, 46, 10, ORANGE);
  cv.circle(x + 42, y + h - 38, 5, INK);
  cv.circle(x + 58, y + h - 38, 5, INK);
  // label on the sea
  drawText(cv, 'STRAIT OF HORMUZ', x + 14, y + 10, 2, BLUE);
  cv.unclip();
}

// --- Panel B: Crimea bridge under a drone barrage
function sceneCrimea(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.clip(x, y, w, h);
  cv.rect(x, y, w, h, [196, 222, 238]);
  // clouds
  cv.ellipse(x + 90, y + 30, 44, 14, WHITE);
  cv.ellipse(x + w - 110, y + 44, 52, 16, WHITE);
  // water
  cv.rect(x, y + h - 56, w, 56, [52, 110, 160]);
  cv.wave(x, x + w, y + h - 56, 4, 52, 1, [90, 160, 205]);
  // bridge: deck + arch + pillars
  const deckY = y + h - 96;
  cv.rect(x + 10, deckY, w - 20, 10, [60, 60, 64]);
  cv.line(x + 30, deckY, x + w / 2, deckY - 58, 6, [60, 60, 64]);
  cv.line(x + w - 30, deckY, x + w / 2, deckY - 58, 6, [60, 60, 64]);
  cv.rect(x + 60, deckY + 10, 12, 30, [60, 60, 64]);
  cv.rect(x + w - 72, deckY + 10, 12, 30, [60, 60, 64]);
  cv.rect(x + w / 2 - 6, deckY - 58, 12, 58, [60, 60, 64]);
  // explosion on the deck
  const ex = x + w / 2 + 60;
  const ey = deckY - 8;
  cv.circle(ex, ey, 26, ORANGE);
  cv.circle(ex, ey, 16, YELLOW);
  cv.circle(ex, ey, 8, [255, 240, 160]);
  cv.tri(ex - 34, ey - 6, ex - 52, ey - 22, ex - 30, ey + 6, ORANGE);
  cv.tri(ex + 30, ey - 10, ex + 50, ey - 26, ex + 34, ey + 4, ORANGE);
  cv.circle(ex - 16, ey - 34, 10, DARKGREY);
  cv.circle(ex + 8, ey - 44, 13, GREY);
  // drone swarm: small quadcopters
  const drones: Array<[number, number]> = [
    [0.16, 0.18], [0.3, 0.1], [0.46, 0.22], [0.62, 0.1], [0.78, 0.2], [0.9, 0.12],
    [0.24, 0.34], [0.55, 0.32], [0.72, 0.36], [0.38, 0.42],
  ];
  for (const [fx, fy] of drones) {
    const dx = Math.round(x + fx * w);
    const dy = Math.round(y + fy * h);
    cv.rect(dx - 5, dy - 2, 10, 4, INK);
    cv.rect(dx - 7, dy - 5, 4, 2, INK);
    cv.rect(dx + 3, dy - 5, 4, 2, INK);
  }
  drawText(cv, 'KERCH STRAIT', x + 14, y + 10, 2, BLUE);
  cv.unclip();
}

// --- Panel C: markets plunge — falling chart
function sceneMarkets(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.clip(x, y, w, h);
  cv.rect(x, y, w, h, [238, 240, 244]);
  const gx0 = x + 30;
  const gy0 = y + 16;
  const gx1 = x + w - 30;
  const gy1 = y + h - 26;
  // grid
  for (let i = 1; i <= 3; i++) {
    const gy = gy0 + ((gy1 - gy0) * i) / 4;
    cv.rect(gx0, Math.round(gy), gx1 - gx0, 1, LIGHTGREY);
  }
  // axes
  cv.rect(gx0, gy0, 2, gy1 - gy0, DARKGREY);
  cv.rect(gx0, gy1, gx1 - gx0, 2, DARKGREY);
  // falling red line, stepped
  const pts: Array<[number, number]> = [
    [0.02, 0.12], [0.16, 0.2], [0.3, 0.16], [0.44, 0.42], [0.58, 0.5],
    [0.7, 0.72], [0.84, 0.78], [0.97, 0.95],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    const [fx0, fy0] = pts[i];
    const [fx1, fy1] = pts[i + 1];
    cv.line(
      Math.round(gx0 + fx0 * (gx1 - gx0)), Math.round(gy0 + fy0 * (gy1 - gy0)),
      Math.round(gx0 + fx1 * (gx1 - gx0)), Math.round(gy0 + fy1 * (gy1 - gy0)),
      6, RED,
    );
  }
  // big down arrow at the end
  const ax = Math.round(gx0 + 0.9 * (gx1 - gx0));
  const ay = Math.round(gy0 + 0.86 * (gy1 - gy0));
  cv.tri(ax - 4, ay - 26, ax + 4, ay - 26, ax, ay + 2, RED);
  cv.rect(ax - 2, ay - 34, 4, 10, RED);
  // tick labels, bottom-left where the falling line has left room
  drawText(cv, 'NASDAQ -2.5%', gx0 + 6, gy1 - 60, 2, RED);
  drawText(cv, 'DOW -1.4%', gx0 + 6, gy1 - 38, 2, RED);
  drawText(cv, 'OIL -3.6%', gx0 + 6, gy1 - 16, 2, RED);
  cv.unclip();
}

// --- Panel D: Quad summit in Manila — four flags over a table
function flag(cv: Canvas, x: number, y: number, w: number, h: number, kind: string): void {
  cv.rect(x, y, w, h, WHITE);
  cv.rect(x, y, w, 2, INK);
  cv.rect(x, y + h - 2, w, 2, INK);
  cv.rect(x, y, 2, h, INK);
  cv.rect(x + w - 2, y, 2, h, INK);
  if (kind === 'US') {
    for (let i = 0; i < 7; i++) {
      if (i % 2 === 0) cv.rect(x + 2, y + 2 + i * 4, w - 4, 4, RED);
    }
    cv.rect(x + 2, y + 2, 20, 16, BLUE);
    for (let r = 0; r < 3; r++) for (let cI = 0; cI < 4; cI++) cv.px(x + 5 + cI * 4, y + 5 + r * 5, WHITE);
  } else if (kind === 'IN') {
    cv.rect(x + 2, y + 2, w - 4, 9, [255, 153, 51]);
    cv.rect(x + 2, y + 11, w - 4, 9, WHITE);
    cv.rect(x + 2, y + 20, w - 4, 9, [19, 136, 8]);
    cv.circle(x + w / 2, y + h / 2, 4, BLUE);
  } else if (kind === 'JP') {
    cv.circle(x + w / 2, y + h / 2, 8, RED);
  } else if (kind === 'AU') {
    cv.rect(x + 2, y + 2, w - 4, h - 4, [0, 40, 104]);
    cv.rect(x + 2, y + 2, 18, 12, [200, 30, 40]);
    cv.circle(x + w - 14, y + 10, 3, WHITE);
    cv.circle(x + w - 24, y + 20, 2, WHITE);
    cv.circle(x + 16, y + 22, 2, WHITE);
  }
}

function sceneQuad(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.clip(x, y, w, h);
  cv.rect(x, y, w, h, [222, 232, 214]);
  // backdrop: Manila skyline
  cv.rect(x, y + h - 90, w, 90, [190, 200, 190]);
  const blds = [0.06, 0.2, 0.36, 0.52, 0.68, 0.84];
  const bh = [46, 62, 38, 70, 50, 58];
  blds.forEach((fx, i) => {
    const bx = Math.round(x + fx * w);
    cv.rect(bx, y + h - 90 - bh[i], 44, bh[i], [150, 162, 150]);
  });
  // summit table
  const ty = y + h - 52;
  cv.rect(x + 60, ty, w - 120, 12, [120, 84, 50]);
  cv.rect(x + 70, ty + 12, 8, 26, [100, 70, 42]);
  cv.rect(x + w - 78, ty + 12, 8, 26, [100, 70, 42]);
  // four leaders behind the table (simple figures)
  const spots = [0.18, 0.4, 0.62, 0.84];
  const suits: RGB[] = [[30, 40, 70], [70, 30, 40], [30, 60, 40], [60, 50, 30]];
  spots.forEach((fx, i) => {
    const cx = Math.round(x + fx * w);
    cv.circle(cx, ty - 34, 11, [232, 190, 160]); // head
    cv.rect(cx - 13, ty - 24, 26, 26, suits[i]); // suit
    cv.rect(cx - 3, ty - 24, 6, 12, WHITE); // shirt
  });
  // four flags on poles above
  const kinds = ['US', 'IN', 'JP', 'AU'];
  spots.forEach((fx, i) => {
    const px0 = Math.round(x + fx * w) - 24;
    cv.rect(px0, y + 14, 3, 62, DARKGREY);
    flag(cv, px0 + 3, y + 14, 42, 28, kinds[i]);
  });
  drawText(cv, 'MANILA', x + 14, y + h - 22, 2, DARKGREY);
  cv.unclip();
}

// --- Panel E: JPMorgan outage — bank + phone
function sceneBank(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.clip(x, y, w, h);
  cv.rect(x, y, w, h, [236, 238, 242]);
  // bank building, left
  const bx = x + 40;
  const by = y + 26;
  cv.tri(bx - 10, by, bx + 105, by - 34, bx + 220, by, [200, 204, 210]);
  cv.rect(bx, by, 210, 12, [170, 174, 180]);
  for (let i = 0; i < 5; i++) {
    cv.rect(bx + 12 + i * 40, by + 12, 16, 74, [150, 154, 160]);
  }
  cv.rect(bx, by + 86, 210, 10, [170, 174, 180]);
  cv.rect(bx + 92, by + 42, 26, 44, [90, 96, 104]);
  drawText(cv, 'JPMORGAN', bx + 34, by + 20, 2, INK);
  // phone with warning, right
  const px0 = x + w - 260;
  const py = y + 22;
  cv.rect(px0, py, 120, 150, [40, 40, 44]);
  cv.rect(px0 + 8, py + 8, 104, 134, WHITE);
  cv.tri(px0 + 60, py + 34, px0 + 96, py + 96, px0 + 24, py + 96, [240, 180, 20]);
  cv.rect(px0 + 57, py + 52, 6, 26, INK);
  cv.circle(px0 + 60, py + 88, 4, INK);
  drawText(cv, 'SYSTEM DOWN', px0 + 12, py + 112, 2, RED);
  drawText(cv, 'TRY AGAIN LATER', px0 + 6, py + 130, 1, DARKGREY);
  // crossed-out card / error ticks
  cv.line(x + 300, y + 60, x + 340, y + 100, 5, RED);
  cv.line(x + 340, y + 60, x + 300, y + 100, 5, RED);
  cv.unclip();
}

// ------------------------------------------------------------------ layout
function build(): Canvas {
  const cv = new Canvas();

  // --- masthead
  drawTextCentered(cv, 'THE WORLD IN ONE DAY', W / 2, 16, 6, INK);
  drawTextCentered(cv, 'TUESDAY 17 NOVEMBER 2026', W / 2, 60, 3, RED);
  drawTextCentered(cv, 'THE DAY IN FIVE STORIES', W / 2, 90, 2, DARKGREY);
  cv.rect(16, 116, W - 32, 4, RED);

  const px = 16;
  const pw = 496;

  // --- Row 1: Hormuz (left) and Crimea bridge (right)
  const r1y = 132;
  const r1h = 340;
  panel(cv, px, r1y, pw, r1h, 'MIDDLE EAST');
  sceneHormuz(cv, px + 12, r1y + 40, pw - 24, 168);
  let yy = headline(cv, px + 14, r1y + 218, ['TANKER ATTACKED', 'IN STRAIT OF HORMUZ']);
  sub(cv, px + 14, yy + 4, ['Crew evacuated after blast;', "US strikes Iran's Qeshm Island"]);

  panel(cv, px + pw, r1y, pw, r1h, 'UKRAINE');
  sceneCrimea(cv, px + pw + 12, r1y + 40, pw - 24, 168);
  yy = headline(cv, px + pw + 14, r1y + 218, ['UKRAINE HITS', 'CRIMEA BRIDGE']);
  sub(cv, px + pw + 14, yy + 4, ['1,300-drone barrage;', 'traffic halted']);

  // --- Row 2: markets (left) and Quad summit (right)
  const r2y = 484;
  const r2h = 276;
  panel(cv, px, r2y, pw, r2h, 'MARKETS');
  sceneMarkets(cv, px + 12, r2y + 40, pw - 24, 120);
  yy = headline(cv, px + 14, r2y + 168, ['MARKETS PLUNGE']);
  sub(cv, px + 14, yy + 4, ['Nasdaq enters correction;', 'oil and gold fall']);

  panel(cv, px + pw, r2y, pw, r2h, 'ASIA');
  sceneQuad(cv, px + pw + 12, r2y + 40, pw - 24, 120);
  yy = headline(cv, px + pw + 14, r2y + 168, ['TRUMP JOINS QUAD']);
  sub(cv, px + pw + 14, yy + 4, ['Leaders meet in Manila', 'ahead of Trump trip to China']);

  // --- Row 3: JPMorgan outage, full width
  const r3y = 772;
  const r3h = 236;
  panel(cv, px, r3y, W - 32, r3h, 'UNITED STATES');
  sceneBank(cv, px + 12, r3y + 40, 470, 180);
  const tx = px + 512;
  yy = headline(cv, tx, r3y + 58, ['JPMORGAN OUTAGE', 'HITS US CUSTOMERS']);
  sub(cv, tx, yy + 6, ['Bank systems fail nationwide;', 'transactions back to normal later']);
  drawTextCentered(
    cv,
    'Sources: RNZ - Khaleej Times - Outlook India - vietnam.vn',
    W / 2, r3y + r3h - 22, 1, GREY,
  );

  return cv;
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  const png = encodePNG(build());
  writeFileSync(join(outDir, 'entry.png'), png);
}

main();
