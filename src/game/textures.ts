import * as THREE from 'three';
import { NAIRA_DENOMINATIONS, type NairaValue } from './palette';

export interface ProceduralTextureSet {
  sandstoneMap: THREE.CanvasTexture;
  sandstoneBump: THREE.CanvasTexture;
  sandstoneRoughness: THREE.CanvasTexture;
  pillarMap: THREE.CanvasTexture;
  pillarBump: THREE.CanvasTexture;
  timberMap: THREE.CanvasTexture;
  timberBump: THREE.CanvasTexture;
  goldMap: THREE.CanvasTexture;
  goldBump: THREE.CanvasTexture;
  nairaMaps: Record<NairaValue, THREE.CanvasTexture>;
  contactShadowMap: THREE.CanvasTexture;
  particleMap: THREE.CanvasTexture;
  waterBump: THREE.CanvasTexture;
  dispose: () => void;
}

// Deterministic pseudo-random generator for consistent, crisp textures
function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable for procedural textures');
  }
  return [canvas, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
  wrap: THREE.Wrapping = THREE.RepeatWrapping
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = wrap;
  tex.wrapT = wrap;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.max(1, anisotropy);
  tex.needsUpdate = true;
  return tex;
}

/**
 * 1. Cracked sandstone floor tiles with mossy seams (diffuse, bump, roughness)
 */
function buildSandstoneTileTextures(anisotropy: number) {
  const size = 512;
  const rng = createRng(4017);

  const [diffCanvas, dCtx] = makeCanvas(size, size);
  const [bumpCanvas, bCtx] = makeCanvas(size, size);
  const [roughCanvas, rCtx] = makeCanvas(size, size);

  // Base sandstone fill
  dCtx.fillStyle = '#d4a373';
  dCtx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#b8b8b8';
  bCtx.fillRect(0, 0, size, size);

  rCtx.fillStyle = '#d4d4d4';
  rCtx.fillRect(0, 0, size, size);

  const rows = 4;
  const cols = 3;
  const tileH = size / rows;
  const tileW = size / cols;

  // Individual stone blocks with subtle hue variation
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 1 ? tileW * 0.5 : 0;
    for (let c = -1; c <= cols; c++) {
      const x = c * tileW + offset;
      const y = r * tileH;
      const shade = Math.floor((rng() - 0.5) * 18);
      const red = Math.min(255, Math.max(0, 212 + shade));
      const green = Math.min(255, Math.max(0, 163 + Math.floor(shade * 0.85)));
      const blue = Math.min(255, Math.max(0, 115 + Math.floor(shade * 0.7)));

      dCtx.fillStyle = `rgb(${red},${green},${blue})`;
      dCtx.fillRect(x + 3, y + 3, tileW - 6, tileH - 6);

      // Subtle bevel highlight inside block
      dCtx.strokeStyle = 'rgba(255, 232, 198, 0.28)';
      dCtx.lineWidth = 2;
      dCtx.strokeRect(x + 5, y + 5, tileW - 10, tileH - 10);

      // Bump variation per slab
      const bVal = 175 + Math.floor((rng() - 0.5) * 26);
      bCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
      bCtx.fillRect(x + 3, y + 3, tileW - 6, tileH - 6);
    }
  }

  // Sandstone sedimentary grain & weathered pitting
  for (let i = 0; i < 3600; i++) {
    const px = rng() * size;
    const py = rng() * size;
    const rad = 0.8 + rng() * 2.2;
    const light = rng() > 0.45;
    dCtx.fillStyle = light ? 'rgba(244, 214, 178, 0.16)' : 'rgba(130, 88, 52, 0.15)';
    dCtx.beginPath();
    dCtx.arc(px, py, rad, 0, Math.PI * 2);
    dCtx.fill();

    bCtx.fillStyle = light ? 'rgba(235, 235, 235, 0.14)' : 'rgba(95, 95, 95, 0.18)';
    bCtx.fillRect(px, py, rad, rad);
  }

  // Horizontal mortar grooves + mossy seams
  for (let r = 0; r < rows; r++) {
    const y = r * tileH;
    // Deep mortar groove
    dCtx.fillStyle = '#3b4a38';
    dCtx.fillRect(0, y - 3, size, 6);
    bCtx.fillStyle = '#353535';
    bCtx.fillRect(0, y - 3, size, 6);
    rCtx.fillStyle = '#f5f5f5';
    rCtx.fillRect(0, y - 3, size, 6);

    // Vertical mortar grooves
    const offset = r % 2 === 1 ? tileW * 0.5 : 0;
    for (let c = 0; c <= cols; c++) {
      const x = (c * tileW + offset) % size;
      dCtx.fillStyle = '#3b4a38';
      dCtx.fillRect(x - 3, y, 6, tileH);
      bCtx.fillStyle = '#353535';
      bCtx.fillRect(x - 3, y, 6, tileH);
    }
  }

  // Moss patches creeping along mortar seams
  for (let i = 0; i < 165; i++) {
    const row = Math.floor(rng() * rows);
    const onHSeam = rng() > 0.35;
    const x = rng() * size;
    const y = onHSeam
      ? row * tileH + (rng() - 0.5) * 14
      : row * tileH + rng() * tileH;
    const r = 4 + rng() * 11;

    dCtx.fillStyle = rng() > 0.4 ? 'rgba(88, 129, 87, 0.72)' : 'rgba(58, 90, 64, 0.78)';
    dCtx.beginPath();
    dCtx.arc(x, y, r, 0, Math.PI * 2);
    dCtx.fill();

    // Moss is softer / rougher than polished sandstone
    rCtx.fillStyle = 'rgba(248, 248, 248, 0.6)';
    rCtx.beginPath();
    rCtx.arc(x, y, r, 0, Math.PI * 2);
    rCtx.fill();

    bCtx.fillStyle = 'rgba(205, 205, 205, 0.3)';
    bCtx.beginPath();
    bCtx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    bCtx.fill();
  }

  // Hairline sandstone fractures
  for (let i = 0; i < 18; i++) {
    let cx = rng() * size;
    let cy = rng() * size;
    dCtx.strokeStyle = 'rgba(78, 55, 36, 0.45)';
    dCtx.lineWidth = 1.4;
    bCtx.strokeStyle = 'rgba(40, 40, 40, 0.75)';
    bCtx.lineWidth = 1.8;

    dCtx.beginPath();
    bCtx.beginPath();
    dCtx.moveTo(cx, cy);
    bCtx.moveTo(cx, cy);
    const steps = 4 + Math.floor(rng() * 5);
    for (let s = 0; s < steps; s++) {
      cx += (rng() - 0.5) * 32;
      cy += (rng() - 0.5) * 32;
      dCtx.lineTo(cx, cy);
      bCtx.lineTo(cx, cy);
    }
    dCtx.stroke();
    bCtx.stroke();
  }

  return {
    sandstoneMap: finalizeTexture(diffCanvas, true, anisotropy, 2, 6),
    sandstoneBump: finalizeTexture(bumpCanvas, false, anisotropy, 2, 6),
    sandstoneRoughness: finalizeTexture(roughCanvas, false, anisotropy, 2, 6),
  };
}

/**
 * 2. Carved stone pillars with horizontal relief bands
 */
function buildCarvedPillarTextures(anisotropy: number) {
  const size = 512;
  const rng = createRng(8821);

  const [diffCanvas, dCtx] = makeCanvas(size, size);
  const [bumpCanvas, bCtx] = makeCanvas(size, size);

  // Base sandstone body
  dCtx.fillStyle = '#cfa070';
  dCtx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#9e9e9e';
  bCtx.fillRect(0, 0, size, size);

  // Subtle vertical fluting
  const flutes = 16;
  const fluteW = size / flutes;
  for (let i = 0; i < flutes; i++) {
    const x = i * fluteW;
    const grad = dCtx.createLinearGradient(x, 0, x + fluteW, 0);
    grad.addColorStop(0, 'rgba(74, 53, 37, 0.16)');
    grad.addColorStop(0.5, 'rgba(255, 229, 188, 0.12)');
    grad.addColorStop(1, 'rgba(74, 53, 37, 0.16)');
    dCtx.fillStyle = grad;
    dCtx.fillRect(x, 0, fluteW, size);

    const bGrad = bCtx.createLinearGradient(x, 0, x + fluteW, 0);
    bGrad.addColorStop(0, '#787878');
    bGrad.addColorStop(0.5, '#c8c8c8');
    bGrad.addColorStop(1, '#787878');
    bCtx.fillStyle = bGrad;
    bCtx.fillRect(x, 0, fluteW, size);
  }

  // Horizontal carved relief bands (Mesoamerican / Monument Valley frieze bands)
  const bands = [72, 180, 310, 420];
  for (const by of bands) {
    // Recessed channel
    dCtx.fillStyle = '#9c6e46';
    dCtx.fillRect(0, by - 16, size, 32);
    bCtx.fillStyle = '#484848';
    bCtx.fillRect(0, by - 16, size, 32);

    // Raised gold/ochre sculpted rim lines
    dCtx.fillStyle = '#e5b887';
    dCtx.fillRect(0, by - 18, size, 4);
    dCtx.fillRect(0, by + 14, size, 4);
    bCtx.fillStyle = '#efefef';
    bCtx.fillRect(0, by - 18, size, 4);
    bCtx.fillRect(0, by + 14, size, 4);

    // Geometric step-fret glyph blocks along the band
    const glyphCount = 12;
    const gw = size / glyphCount;
    for (let g = 0; g < glyphCount; g++) {
      const gx = g * gw + 6;
      dCtx.fillStyle = g % 2 === 0 ? '#dfb282' : '#c79362';
      dCtx.fillRect(gx, by - 10, gw - 12, 20);
      dCtx.fillStyle = '#6f4b2c';
      dCtx.fillRect(gx + 6, by - 4, gw - 24, 8);

      bCtx.fillStyle = '#dcdcdc';
      bCtx.fillRect(gx, by - 10, gw - 12, 20);
      bCtx.fillStyle = '#3a3a3a';
      bCtx.fillRect(gx + 6, by - 4, gw - 24, 8);
    }
  }

  // Weathered stone grain & mossy stains near top/bottom
  for (let i = 0; i < 2400; i++) {
    const px = rng() * size;
    const py = rng() * size;
    const r = 0.8 + rng() * 2;
    dCtx.fillStyle = rng() > 0.5 ? 'rgba(248, 224, 190, 0.14)' : 'rgba(65, 45, 29, 0.14)';
    dCtx.fillRect(px, py, r, r);
  }

  for (let i = 0; i < 95; i++) {
    const px = rng() * size;
    const nearEdge = rng() > 0.5 ? rng() * 95 : size - rng() * 110;
    const rad = 5 + rng() * 14;
    dCtx.fillStyle = rng() > 0.35 ? 'rgba(88, 129, 87, 0.55)' : 'rgba(58, 90, 64, 0.65)';
    dCtx.beginPath();
    dCtx.arc(px, nearEdge, rad, 0, Math.PI * 2);
    dCtx.fill();
  }

  return {
    pillarMap: finalizeTexture(diffCanvas, true, anisotropy, 1, 1),
    pillarBump: finalizeTexture(bumpCanvas, false, anisotropy, 1, 1),
  };
}

/**
 * 3. Rough-grained fallen timber logs
 */
function buildTimberTextures(anisotropy: number) {
  const size = 512;
  const rng = createRng(2913);

  const [diffCanvas, dCtx] = makeCanvas(size, size);
  const [bumpCanvas, bCtx] = makeCanvas(size, size);

  dCtx.fillStyle = '#4a3525';
  dCtx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  // Longitudinal bark ridges and deep fissures
  for (let i = 0; i < 180; i++) {
    const y = rng() * size;
    const h = 2 + rng() * 6;
    const isLight = rng() > 0.45;

    dCtx.fillStyle = isLight ? 'rgba(107, 79, 57, 0.52)' : 'rgba(34, 22, 14, 0.62)';
    bCtx.fillStyle = isLight ? 'rgba(215, 215, 215, 0.55)' : 'rgba(35, 35, 35, 0.68)';

    dCtx.beginPath();
    bCtx.beginPath();
    dCtx.moveTo(0, y);
    bCtx.moveTo(0, y);
    for (let x = 0; x <= size; x += 32) {
      const wave = Math.sin(x * 0.03 + i) * 3.5;
      dCtx.lineTo(x, y + wave);
      bCtx.lineTo(x, y + wave);
    }
    dCtx.lineWidth = h;
    bCtx.lineWidth = h;
    dCtx.strokeStyle = dCtx.fillStyle;
    bCtx.strokeStyle = bCtx.fillStyle;
    dCtx.stroke();
    bCtx.stroke();
  }

  // Wood knots
  for (let k = 0; k < 5; k++) {
    const kx = 60 + rng() * (size - 120);
    const ky = 40 + rng() * (size - 80);
    const kr = 12 + rng() * 14;
    for (let ring = 3; ring >= 1; ring--) {
      dCtx.strokeStyle = ring === 1 ? '#291b10' : '#5e4431';
      dCtx.lineWidth = 2.5;
      dCtx.beginPath();
      dCtx.ellipse(kx, ky, kr * ring * 0.6, kr * ring * 0.32, 0, 0, Math.PI * 2);
      dCtx.stroke();

      bCtx.strokeStyle = ring === 1 ? '#222222' : '#d2d2d2';
      bCtx.lineWidth = 2.5;
      bCtx.beginPath();
      bCtx.ellipse(kx, ky, kr * ring * 0.6, kr * ring * 0.32, 0, 0, Math.PI * 2);
      bCtx.stroke();
    }
  }

  // Damp moss streaks along log top
  for (let m = 0; m < 45; m++) {
    const mx = rng() * size;
    const my = rng() * size;
    const mr = 5 + rng() * 12;
    dCtx.fillStyle = 'rgba(88, 129, 87, 0.45)';
    dCtx.beginPath();
    dCtx.ellipse(mx, my, mr * 1.8, mr * 0.7, 0, 0, Math.PI * 2);
    dCtx.fill();
  }

  return {
    timberMap: finalizeTexture(diffCanvas, true, anisotropy, 1, 1),
    timberBump: finalizeTexture(bumpCanvas, false, anisotropy, 1, 1),
  };
}

/**
 * 4. Hammered antique gold coin texture (sun glyph + dimpled patina)
 */
function buildHammeredGoldTextures(anisotropy: number) {
  const size = 256;
  const rng = createRng(7719);

  const [diffCanvas, dCtx] = makeCanvas(size, size);
  const [bumpCanvas, bCtx] = makeCanvas(size, size);

  const grad = dCtx.createRadialGradient(size / 2, size / 2, 14, size / 2, size / 2, size / 2);
  grad.addColorStop(0, '#ffd166');
  grad.addColorStop(0.7, '#f4a261');
  grad.addColorStop(1, '#c97b3e');
  dCtx.fillStyle = grad;
  dCtx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#909090';
  bCtx.fillRect(0, 0, size, size);

  // Hammered dimples
  for (let i = 0; i < 240; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 3 + rng() * 7;
    dCtx.fillStyle = rng() > 0.5 ? 'rgba(255, 232, 163, 0.18)' : 'rgba(140, 74, 24, 0.16)';
    dCtx.beginPath();
    dCtx.arc(x, y, r, 0, Math.PI * 2);
    dCtx.fill();

    bCtx.fillStyle = rng() > 0.5 ? 'rgba(215, 215, 215, 0.25)' : 'rgba(70, 70, 70, 0.25)';
    bCtx.beginPath();
    bCtx.arc(x, y, r, 0, Math.PI * 2);
    bCtx.fill();
  }

  // Sun ring & center relief
  dCtx.strokeStyle = '#ffe599';
  dCtx.lineWidth = 8;
  dCtx.beginPath();
  dCtx.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
  dCtx.stroke();

  bCtx.strokeStyle = '#f2f2f2';
  bCtx.lineWidth = 10;
  bCtx.beginPath();
  bCtx.arc(size / 2, size / 2, size * 0.34, 0, Math.PI * 2);
  bCtx.stroke();

  // Inner diamond sun motif
  dCtx.fillStyle = '#ffe599';
  bCtx.fillStyle = '#ffffff';
  for (const ctx of [dCtx, bCtx]) {
    ctx.beginPath();
    ctx.moveTo(size / 2, size * 0.3);
    ctx.lineTo(size * 0.68, size / 2);
    ctx.lineTo(size / 2, size * 0.7);
    ctx.lineTo(size * 0.32, size / 2);
    ctx.closePath();
    ctx.fill();
  }

  return {
    goldMap: finalizeTexture(diffCanvas, true, anisotropy, 1, 1, THREE.ClampToEdgeWrapping),
    goldBump: finalizeTexture(bumpCanvas, false, anisotropy, 1, 1, THREE.ClampToEdgeWrapping),
  };
}

/**
 * 5. Soft radial contact shadow & dust/sparkle particle sprite
 */
function buildUtilitySprites(anisotropy: number) {
  const [shadowCanvas, sCtx] = makeCanvas(128, 128);
  const sGrad = sCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
  sGrad.addColorStop(0, 'rgba(22, 34, 40, 0.75)');
  sGrad.addColorStop(0.55, 'rgba(22, 34, 40, 0.35)');
  sGrad.addColorStop(1, 'rgba(22, 34, 40, 0.0)');
  sCtx.fillStyle = sGrad;
  sCtx.fillRect(0, 0, 128, 128);

  const [partCanvas, pCtx] = makeCanvas(64, 64);
  const pGrad = pCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  pGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  pGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.65)');
  pGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  pCtx.fillStyle = pGrad;
  pCtx.fillRect(0, 0, 64, 64);

  return {
    contactShadowMap: finalizeTexture(shadowCanvas, true, anisotropy, 1, 1, THREE.ClampToEdgeWrapping),
    particleMap: finalizeTexture(partCanvas, true, anisotropy, 1, 1, THREE.ClampToEdgeWrapping),
  };
}

function buildWaterBump(anisotropy: number) {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const rng = createRng(9931);

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 65; i++) {
    const cx = rng() * size;
    const cy = rng() * size;
    const rx = 18 + rng() * 44;
    const ry = 8 + rng() * 18;
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx);
    grad.addColorStop(0, 'rgba(225, 225, 225, 0.25)');
    grad.addColorStop(0.55, 'rgba(70, 70, 70, 0.22)');
    grad.addColorStop(1, 'rgba(128, 128, 128, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  return finalizeTexture(canvas, false, anisotropy, 10, 12);
}

function buildNairaTextures(anisotropy: number): Record<NairaValue, THREE.CanvasTexture> {
  const w = 512;
  const h = 256;
  const maps = {} as Record<NairaValue, THREE.CanvasTexture>;

  for (const denom of NAIRA_DENOMINATIONS) {
    const [canvas, ctx] = makeCanvas(w, h);

    // Rich banknote gradient background
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, denom.primaryHex);
    bg.addColorStop(0.55, denom.secondaryHex);
    bg.addColorStop(1, denom.primaryHex);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle guilloché security waves
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.5;
    for (let row = 0; row < 12; row++) {
      ctx.beginPath();
      const baseY = 22 + row * 19;
      for (let x = 0; x <= w; x += 16) {
        const y = baseY + Math.sin(x * 0.032 + row * 0.7) * 7;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Double ornamental banknote border
    ctx.strokeStyle = denom.accentHex;
    ctx.lineWidth = 5;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.lineWidth = 1.8;
    ctx.strokeRect(20, 20, w - 40, h - 40);

    // Metallic security foil stripe on right
    const foil = ctx.createLinearGradient(w - 102, 20, w - 74, h - 20);
    foil.addColorStop(0, 'rgba(255, 209, 102, 0.35)');
    foil.addColorStop(0.5, 'rgba(255, 244, 214, 0.85)');
    foil.addColorStop(1, 'rgba(244, 162, 97, 0.4)');
    ctx.fillStyle = foil;
    ctx.fillRect(w - 102, 22, 24, h - 44);

    // Left Nigerian emblem / medallion
    ctx.save();
    ctx.strokeStyle = denom.accentHex;
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(20, 28, 24, 0.25)';
    ctx.beginPath();
    ctx.arc(108, h / 2, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = denom.accentHex;
    ctx.font = 'bold 46px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('₦', 108, h / 2 + 2);
    ctx.restore();

    // Header text
    ctx.fillStyle = denom.accentHex;
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NIGERIA · NAIRA', w * 0.56, 52);

    // Crisp center denomination figure
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(15, 20, 25, 0.55)';
    ctx.lineWidth = 6;
    ctx.font = denom.value >= 1000 ? 'bold 74px Georgia, serif' : 'bold 84px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(denom.label, w * 0.56, h / 2 + 12);
    ctx.fillText(denom.label, w * 0.56, h / 2 + 12);
    ctx.restore();

    // Corner denomination badges
    ctx.fillStyle = denom.accentHex;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(denom.label, 30, 26);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(denom.label, w - 30, h - 24);

    maps[denom.value] = finalizeTexture(
      canvas,
      true,
      anisotropy,
      1,
      1,
      THREE.ClampToEdgeWrapping
    );
  }

  return maps;
}

export function createProceduralTextures(renderer: THREE.WebGLRenderer): ProceduralTextureSet {
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const sandstone = buildSandstoneTileTextures(anisotropy);
  const pillar = buildCarvedPillarTextures(anisotropy);
  const timber = buildTimberTextures(anisotropy);
  const gold = buildHammeredGoldTextures(anisotropy);
  const nairaMaps = buildNairaTextures(anisotropy);
  const sprites = buildUtilitySprites(anisotropy);
  const waterBump = buildWaterBump(anisotropy);

  const all: THREE.Texture[] = [
    sandstone.sandstoneMap,
    sandstone.sandstoneBump,
    sandstone.sandstoneRoughness,
    pillar.pillarMap,
    pillar.pillarBump,
    timber.timberMap,
    timber.timberBump,
    gold.goldMap,
    gold.goldBump,
    ...Object.values(nairaMaps),
    sprites.contactShadowMap,
    sprites.particleMap,
    waterBump,
  ];

  return {
    ...sandstone,
    ...pillar,
    ...timber,
    ...gold,
    nairaMaps,
    ...sprites,
    waterBump,
    dispose: () => {
      all.forEach((t) => t.dispose());
    },
  };
}
