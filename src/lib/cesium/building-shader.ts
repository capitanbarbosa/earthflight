import type { CesiumModule } from "./loader";

/**
 * Procedural facade shading for extruded OSM buildings.
 *
 * OSM only gives footprints + heights, so the *look* is generated: floor bands, window bays, glass
 * curtain walls on towers, darker ground floors, lighter roofs, hazy distance and lit windows at night.
 * Nothing here pretends to be real facade data.
 *
 * Per-instance inputs
 *   color   (ColorGeometryInstanceAttribute)  base wall colour
 *   bparams (vec4)  x = wall height in metres, y = per-building random seed 0..1
 *
 *   bhi / blo (vec3) high/low split of the building's base corner in ECEF (Cesium's own encoding)
 *
 * Cesium's PolygonGeometry gives walls only a planar footprint projection as `st` (no height component),
 * so facade layout is computed from the ECEF offset to the base corner instead: metres above the base
 * (floors) and metres along the wall (window bays). Exact at city scale, no texture needed.
 */
const VS = /* glsl */ `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in float batchId;
in vec4 color;
// custom per-instance attributes are NOT vertex inputs: Cesium injects czm_batchTable_<name>(batchId)

out vec3 v_positionEC;
out vec3 v_normalEC;
out vec3 v_nw;
out vec3 v_up;
out vec3 v_rel;
out vec4 v_color;
out vec4 v_bp;

void main() {
  vec4 p = czm_computePosition();
  v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
  v_normalEC = czm_normal * normal;
  v_nw = normal;
  v_up = normalize(position3DHigh + position3DLow);
  // ECEF offset from the building's base corner; high/low split keeps this accurate to ~cm
  vec3 bhi = czm_batchTable_bhi(batchId);
  vec3 blo = czm_batchTable_blo(batchId);
  v_rel = (position3DHigh - bhi) + (position3DLow - blo);
  v_color = color;
  v_bp = czm_batchTable_bparams(batchId);
  gl_Position = czm_modelViewProjectionRelativeToEye * p;
}
`;

const FS = /* glsl */ `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec3 v_nw;
in vec3 v_up;
in vec3 v_rel;
in vec4 v_color;
in vec4 v_bp;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec3 N = normalize(v_normalEC);
  vec3 posWC = (czm_inverseView * vec4(v_positionEC, 1.0)).xyz;
  vec3 upEC = normalize(mat3(czm_view) * normalize(posWC));
  vec3 L = normalize(czm_lightDirectionEC);

  float H = max(v_bp.x, 1.0);
  float seed = v_bp.y;
  float roof = smoothstep(0.55, 0.85, dot(N, upEC));
  float dist = length(v_positionEC);

  vec3 base = v_color.rgb;
  vec3 albedo = base;
  vec3 emissive = vec3(0.0);
  float nightness = smoothstep(0.08, -0.18, dot(upEC, L));

  if (roof < 0.5) {
    // ---------- walls ----------------------------------------------------------------------
    float floorH = 3.3;
    // metres above the building base, and metres along the wall (from the base corner)
    vec3 upW = normalize(v_up);
    float hAbove = max(dot(v_rel, upW), 0.0);
    float fl = hAbove / floorH;
    vec3 T = normalize(cross(upW, normalize(v_nw)));
    float along = dot(v_rel, T);

    float tower = smoothstep(28.0, 90.0, H);          // 0 = house, 1 = glass tower
    float bayW = mix(3.4, 2.6, tower);
    float bx = along / bayW;
    vec2 cell = vec2(fract(bx), fract(fl));
    vec2 id = vec2(floor(bx), floor(fl));

    // window rectangle (smaller on houses, nearly full-width ribbon on towers)
    float mx = mix(0.26, 0.07, tower);
    float myLo = mix(0.30, 0.16, tower);
    float myHi = mix(0.82, 0.88, tower);
    vec2 aa = max(fwidth(vec2(bx, fl)), vec2(1e-4));
    float wx = smoothstep(mx - aa.x, mx + aa.x, cell.x) * (1.0 - smoothstep(1.0 - mx - aa.x, 1.0 - mx + aa.x, cell.x));
    float wy = smoothstep(myLo - aa.y, myLo + aa.y, cell.y) * (1.0 - smoothstep(myHi - aa.y, myHi + aa.y, cell.y));
    float win = wx * wy;

    // ground floor of larger buildings: no regular windows (shop fronts, entrances)
    float groundFloor = (id.y < 0.5 && H > 10.0) ? 1.0 : 0.0;
    win *= 1.0 - 0.55 * groundFloor;

    // fade the pattern to its average when cells shrink below ~2 px (avoids moire)
    float px = max(aa.x, aa.y);
    float fade = smoothstep(0.35, 0.8, px);
    float avgWin = mix(0.32, 0.55, tower);
    win = mix(win, avgWin, fade);

    float r = hash21(id + seed * 37.0);
    vec3 glassDay = mix(vec3(0.07, 0.11, 0.17), vec3(0.34, 0.47, 0.60), r * 0.8 + 0.1 * tower);
    glassDay = mix(glassDay, vec3(0.45, 0.60, 0.74), tower * 0.5);
    albedo = mix(base, glassDay, win * mix(0.82, 0.95, tower));
    // slight floor-slab banding between windows
    albedo *= 1.0 - 0.07 * smoothstep(0.0, 0.08, 1.0 - cell.y) * (1.0 - win);

    // night: a fraction of windows are lit
    float lit = step(0.62 - 0.12 * tower, hash21(id * 1.7 + seed * 91.0));
    emissive = vec3(1.0, 0.82, 0.52) * (lit * win * (1.0 - fade * 0.5)) * 1.15 * nightness;

    // darker foot of the building (contact shadow)
    float foot = smoothstep(0.0, 2.8, hAbove);
    albedo *= mix(0.72, 1.0, foot);
  } else {
    // ---------- roofs ----------------------------------------------------------------------
    // (absolute ECEF coordinates are too imprecise in float32 for per-metre noise, so roofs vary per building)
    albedo = base * mix(1.06, 1.24, hash21(vec2(seed * 53.0, 7.0)));
  }

  // lighting: sun + hemisphere ambient (sky from above, bounce from below)
  float ndl = max(dot(N, L), 0.0);
  float sky = 0.5 + 0.5 * dot(N, upEC);
  float day = smoothstep(-0.12, 0.2, dot(upEC, L));
  vec3 sun = vec3(1.0, 0.96, 0.88) * ndl * 0.95 * day;
  vec3 amb = mix(vec3(0.07, 0.09, 0.14), mix(vec3(0.38, 0.42, 0.48), vec3(0.55, 0.65, 0.80), sky), day);
  vec3 color = albedo * (sun + amb);

  // glass picks up a little sky/sun reflection
  color += (1.0 - roof) * 0.04 * day * pow(max(dot(reflect(normalize(v_positionEC), N), L), 0.0), 24.0);
  color += emissive;

  // distance haze (matches the globe's soft horizon)
  float f = 1.0 - exp(-dist * 0.000028);
  vec3 haze = mix(vec3(0.03, 0.05, 0.09), vec3(0.62, 0.74, 0.90), day);
  color = mix(color, haze, clamp(f, 0.0, 0.85));

  out_FragColor = vec4(color, 1.0);
}
`;

export function createBuildingAppearance(C: CesiumModule) {
  return new C.MaterialAppearance({
    material: C.Material.fromType("Color"),
    materialSupport: C.MaterialAppearance.MaterialSupport.TEXTURED,
    translucent: false,
    closed: true,
    faceForward: false,
    vertexShaderSource: VS,
    fragmentShaderSource: FS,
  });
}

/** vertexFormat the shader needs (position + normal). */
export const buildingVertexFormat = (C: CesiumModule) =>
  new C.VertexFormat({ position: true, normal: true });
