const VERT = `
attribute vec2 aPos;
attribute vec2 aUv;
varying vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPortrait;
uniform sampler2D uMap;
uniform float uThreshold;
uniform float uDepth;
uniform vec3 uViewDir;
uniform vec3 uLightDir;

float openingOf(vec4 p) { return p.g; }
float heightOf(vec4 p) { return p.b; }
float glowOf(vec4 p) { return p.r; }

float crackOf(vec4 p) {
  return smoothstep(uThreshold - 0.05, uThreshold + 0.02, openingOf(p));
}

float liveHeight(vec2 uv) {
  vec4 pack = texture2D(uMap, clamp(uv, 0.001, 0.999));
  return mix(1.0, heightOf(pack), crackOf(pack));
}

float liveDepth(vec2 uv) {
  return 1.0 - liveHeight(uv);
}

vec2 parallaxOcclusion(vec2 uv, vec3 viewDir) {
  vec2 offset = (viewDir.xy / max(viewDir.z, 0.12)) * uDepth;
  vec2 delta = offset / 24.0;
  float layer = 1.0 / 24.0;
  vec2 curr = uv;
  float layerD = 0.0;
  float mapD = liveDepth(curr);
  for (int i = 0; i < 24; i++) {
    if (layerD >= mapD) break;
    curr -= delta;
    mapD = liveDepth(curr);
    layerD += layer;
  }
  vec2 prev = curr + delta;
  float afterD = mapD - layerD;
  float beforeD = liveDepth(prev) - layerD + layer;
  float w = clamp(afterD / max(afterD - beforeD, 0.0001), 0.0, 1.0);
  return mix(curr, prev, w);
}

float selfShadow(vec2 uv, vec3 lightDir, float hitDepth) {
  vec2 offset = (lightDir.xy / max(lightDir.z, 0.12)) * uDepth;
  vec2 delta = offset / 12.0;
  float layer = 1.0 / 12.0;
  vec2 curr = uv;
  float rayD = hitDepth;
  float occ = 0.0;
  for (int i = 0; i < 12; i++) {
    curr += delta;
    rayD -= layer;
    float d = liveDepth(curr);
    occ = max(occ, clamp((d - rayD - 0.02) * 6.0, 0.0, 1.0));
  }
  return 1.0 - occ;
}

void main() {
  vec4 paintTex = texture2D(uPortrait, vUv);
  if (paintTex.a < 0.02) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 viewDir = normalize(uViewDir);
  vec3 lightDir = normalize(uLightDir);
  vec2 uvH = parallaxOcclusion(vUv, viewDir);
  uvH = clamp(uvH, 0.002, 0.998);

  vec4 pack = texture2D(uMap, uvH);
  float crack = crackOf(pack);
  float h = mix(1.0, heightOf(pack), crack);
  float d = 1.0 - h;
  float glow = glowOf(pack) * crack;

  float e = 0.0035;
  float hL = liveHeight(uvH + vec2(-e, 0.0));
  float hR = liveHeight(uvH + vec2(e, 0.0));
  float hD = liveHeight(uvH + vec2(0.0, -e));
  float hU = liveHeight(uvH + vec2(0.0, e));
  vec3 n = normalize(vec3((hL - hR) * 14.0, (hD - hU) * 14.0, 1.0));

  float ndl = clamp(dot(n, lightDir), 0.0, 1.0);
  vec3 halfV = normalize(lightDir + viewDir);
  float spec = pow(clamp(dot(n, halfV), 0.0, 1.0), 36.0);
  float shadow = mix(1.0, selfShadow(uvH, lightDir, d), crack);
  float slope = clamp(1.0 - n.z, 0.0, 1.0);
  float cavity = crack * (1.0 - pow(h, 1.7));
  float floor = crack * smoothstep(0.38, 0.0, h);
  float lip = crack * slope * (0.35 + 0.65 * ndl);

  vec2 uvPaint = clamp(uvH + n.xy * cavity * 0.012, 0.001, 0.999);
  vec3 paint = texture2D(uPortrait, uvPaint).rgb;
  float ao = mix(1.0, 0.08 + 0.92 * pow(h, 1.55), crack);
  vec3 lit = paint * (0.18 + 0.82 * ndl) * shadow;
  vec3 color = mix(paint, lit, crack * 0.95);
  color *= ao;
  color = mix(color, vec3(0.04, 0.025, 0.015), cavity * 0.7);
  color *= mix(1.0, 0.07, floor);
  color += paint * vec3(1.0, 0.94, 0.78) * (lip * spec * 1.2 + lip * 0.22);
  vec3 gold = vec3(1.0, 0.68, 0.16);
  color += gold * glow * (0.08 + 1.35 * floor);

  gl_FragColor = vec4(color * paintTex.a, paintTex.a);
}
`;

export type PortraitCrack = {
  composite(
    portrait: HTMLImageElement,
    wound: number,
    width: number,
    height: number,
  ): HTMLCanvasElement | null;
};

export function woundToThreshold(wound: number): number {
  const u = Math.max(0, Math.min(1, wound));
  return 1.02 - Math.pow(u, 0.62) * 0.96;
}

function smoothstep(a: number, b: number, x: number): number {
  if (a === b) return x < a ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('shader alloc');
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'compile failed';
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function makeTexture(gl: WebGLRenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('texture alloc');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

export class PortraitCrackShader implements PortraitCrack {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly buf: WebGLBuffer;
  private readonly portraitTex: WebGLTexture;
  private readonly mapTex: WebGLTexture;
  private readonly loc: {
    portrait: WebGLUniformLocation;
    map: WebGLUniformLocation;
    threshold: WebGLUniformLocation;
    depth: WebGLUniformLocation;
    viewDir: WebGLUniformLocation;
    lightDir: WebGLUniformLocation;
  };
  private readonly packed: HTMLImageElement;
  private portraitKey = '';
  private cache = new Map<string, HTMLCanvasElement>();

  constructor(packed: HTMLImageElement) {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('webgl unavailable');
    this.canvas = canvas;
    this.gl = gl;
    this.packed = packed;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!program) throw new Error('program alloc');
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'aPos');
    gl.bindAttribLocation(program, 1, 'aUv');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'link failed');
    }
    this.program = program;
    const buf = gl.createBuffer();
    if (!buf) throw new Error('buffer alloc');
    this.buf = buf;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      1, 1, 1, 1,
    ]), gl.STATIC_DRAW);
    const portrait = gl.getUniformLocation(program, 'uPortrait');
    const map = gl.getUniformLocation(program, 'uMap');
    const threshold = gl.getUniformLocation(program, 'uThreshold');
    const depth = gl.getUniformLocation(program, 'uDepth');
    const viewDir = gl.getUniformLocation(program, 'uViewDir');
    const lightDir = gl.getUniformLocation(program, 'uLightDir');
    if (!portrait || !map || !threshold || !depth || !viewDir || !lightDir) {
      throw new Error('uniform missing');
    }
    this.loc = { portrait, map, threshold, depth, viewDir, lightDir };
    this.portraitTex = makeTexture(gl);
    this.mapTex = makeTexture(gl);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.bindTexture(gl.TEXTURE_2D, this.mapTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, packed);
  }

  composite(
    portrait: HTMLImageElement,
    wound: number,
    width: number,
    height: number,
  ): HTMLCanvasElement | null {
    if (wound < 0.02) return null;
    const key = `${Math.round(wound * 40)}:${width}x${height}:${portrait.src}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const gl = this.gl;
    this.canvas.width = width;
    this.canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.useProgram(this.program);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    if (this.portraitKey !== portrait.src) {
      gl.bindTexture(gl.TEXTURE_2D, this.portraitTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, portrait);
      this.portraitKey = portrait.src;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.portraitTex);
    gl.uniform1i(this.loc.portrait, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mapTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.packed);
    gl.uniform1i(this.loc.map, 1);
    gl.uniform1f(this.loc.threshold, woundToThreshold(wound));
    gl.uniform1f(this.loc.depth, 0.07);
    gl.uniform3f(this.loc.viewDir, 0.42, 0.58, 1.0);
    gl.uniform3f(this.loc.lightDir, 0.62, 0.82, 0.55);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const copy = document.createElement('canvas');
    copy.width = width;
    copy.height = height;
    const ctx = copy.getContext('2d');
    if (!ctx) return this.canvas;
    ctx.drawImage(this.canvas, 0, 0);
    this.cache.set(key, copy);
    return copy;
  }
}

class PortraitCrackCpu implements PortraitCrack {
  private readonly map: Uint8ClampedArray;
  private readonly mapW: number;
  private readonly mapH: number;
  private cache = new Map<string, HTMLCanvasElement>();

  constructor(packed: HTMLImageElement) {
    const w = packed.naturalWidth || packed.width;
    const h = packed.naturalHeight || packed.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2d crack map unavailable');
    ctx.drawImage(packed, 0, 0);
    this.map = ctx.getImageData(0, 0, w, h).data;
    this.mapW = w;
    this.mapH = h;
  }

  private sample(u: number, v: number): { r: number; g: number; b: number } {
    const x = Math.max(0, Math.min(this.mapW - 1, Math.round(u * (this.mapW - 1))));
    const y = Math.max(0, Math.min(this.mapH - 1, Math.round(v * (this.mapH - 1))));
    const i = (y * this.mapW + x) * 4;
    return { r: this.map[i]! / 255, g: this.map[i + 1]! / 255, b: this.map[i + 2]! / 255 };
  }

  private heightAt(u: number, v: number, thresh: number): number {
    const p = this.sample(u, v);
    const crack = smoothstep(thresh - 0.05, thresh + 0.02, p.g);
    return 1 - crack * (1 - p.b);
  }

  composite(
    portrait: HTMLImageElement,
    wound: number,
    width: number,
    height: number,
  ): HTMLCanvasElement | null {
    if (wound < 0.02) return null;
    const key = `${Math.round(wound * 40)}:${width}x${height}:${portrait.src}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(portrait, 0, 0, width, height);
    const img = ctx.getImageData(0, 0, width, height);
    const d = img.data;
    const thresh = woundToThreshold(wound);
    const lx = 0.62;
    const ly = -0.82;
    const lz = 0.55;
    const llen = Math.hypot(lx, ly, lz);
    const Lx = lx / llen;
    const Ly = ly / llen;
    const Lz = lz / llen;
    const e = 1 / Math.max(width, height);
    for (let y = 0; y < height; y++) {
      const v = y / Math.max(1, height - 1);
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if ((d[i + 3] ?? 0) < 8) continue;
        const u = x / Math.max(1, width - 1);
        const p = this.sample(u, v);
        const crack = smoothstep(thresh - 0.05, thresh + 0.02, p.g);
        if (crack < 0.004) continue;
        const h = 1 - crack * (1 - p.b);
        const hL = this.heightAt(u - e, v, thresh);
        const hR = this.heightAt(u + e, v, thresh);
        const hU = this.heightAt(u, v - e, thresh);
        const hD = this.heightAt(u, v + e, thresh);
        let nx = (hL - hR) * 14;
        let ny = (hU - hD) * 14;
        const nz = 1;
        const nn = Math.hypot(nx, ny, nz) || 1;
        nx /= nn;
        ny /= nn;
        const nzN = nz / nn;
        const ndl = Math.max(0, nx * Lx + ny * Ly + nzN * Lz);
        let shadow = 1;
        let su = u;
        let sv = v;
        let rayH = h;
        for (let s = 0; s < 8; s++) {
          su += Lx * 0.004;
          sv -= Ly * 0.004;
          rayH += 0.06;
          if (this.heightAt(su, sv, thresh) > rayH + 0.02) {
            shadow = 0.18;
            break;
          }
        }
        const floor = crack * smoothstep(0.38, 0, h);
        const ao = 1 - crack * (1 - (0.12 + 0.88 * h ** 1.55));
        const spec = Math.max(0, nx * 0.35 + ny * 0.45 + nzN * 0.82) ** 36;
        const lip = crack * (1 - nzN) * (0.35 + 0.65 * ndl);
        const shade = ao * (0.22 + 0.78 * ndl) * shadow;
        const mixA = crack * 0.92;
        const pr = d[i]!;
        const pg = d[i + 1]!;
        const pb = d[i + 2]!;
        let r = pr * (1 - mixA) + pr * shade * mixA;
        let g = pg * (1 - mixA) + pg * shade * mixA;
        let b = pb * (1 - mixA) + pb * shade * mixA;
        const floorK = 1 - floor * 0.84;
        r *= floorK;
        g *= floorK;
        b *= floorK;
        const lipK = lip * spec * 1.35 + lip * 0.18;
        r += pr * lipK;
        g += pg * lipK * 0.94;
        b += pb * lipK * 0.78;
        const gold = p.r * (0.15 + 1.7 * floor);
        r += 255 * gold;
        g += 255 * gold * 0.7;
        b += 255 * gold * 0.18;
        d[i] = Math.max(0, Math.min(255, r));
        d[i + 1] = Math.max(0, Math.min(255, g));
        d[i + 2] = Math.max(0, Math.min(255, b));
      }
    }
    ctx.putImageData(img, 0, 0);
    this.cache.set(key, out);
    return out;
  }
}

export function createPortraitCrack(packed: HTMLImageElement): PortraitCrack {
  try {
    return new PortraitCrackShader(packed);
  } catch {
    return new PortraitCrackCpu(packed);
  }
}
