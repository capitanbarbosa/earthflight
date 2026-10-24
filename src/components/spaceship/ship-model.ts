import * as THREE from "three";

/**
 * Procedural spaceship (original design, no external assets → no licensing concerns).
 *
 * Unit-length vessel; nose points toward -Z, +Y is up, +X is starboard.  Contains:
 *  - metallic fuselage / wings / canopy,
 *  - two engines with animated additive flame cones + glow sprites (blue),
 *  - red/green wing-tip navigation lights and a white tail strobe.
 */
export interface ShipModel {
  group: THREE.Group;
  hull: THREE.Object3D;
  update(t: number, thrust: number, boost: number): void;
  dispose(): void;
}

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.15, "rgba(160,220,255,0.9)");
  grad.addColorStop(0.45, "rgba(40,140,255,0.35)");
  grad.addColorStop(1, "rgba(0,60,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createShipModel(envMap: THREE.Texture | null): ShipModel {
  const group = new THREE.Group();
  const hull = new THREE.Group();
  group.add(hull);
  const disposables: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(o: T): T => (disposables.push(o), o);

  const metal = track(
    new THREE.MeshStandardMaterial({ color: 0xb9c3d3, metalness: 0.92, roughness: 0.26, envMap: envMap ?? undefined, envMapIntensity: 1.1 }),
  );
  const dark = track(
    new THREE.MeshStandardMaterial({ color: 0x1a2433, metalness: 0.8, roughness: 0.4, envMap: envMap ?? undefined }),
  );
  const accent = track(new THREE.MeshStandardMaterial({ color: 0x0b1620, emissive: 0x22d3ee, emissiveIntensity: 1.6, metalness: 0.2, roughness: 0.5 }));
  const glass = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x0a2236, metalness: 0.1, roughness: 0.05, transmission: 0, clearcoat: 1, clearcoatRoughness: 0.03,
      envMap: envMap ?? undefined, envMapIntensity: 1.6, emissive: 0x04202e, emissiveIntensity: 0.6,
    }),
  );

  // Fuselage: lathe profile around Y, then laid along -Z.
  const profile = [
    [0.0, -0.5], [0.05, -0.5], [0.09, -0.46], [0.108, -0.34], [0.116, -0.15], [0.108, 0.05], [0.086, 0.22], [0.052, 0.38], [0.02, 0.47], [0.0, 0.5],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const fusGeo = track(new THREE.LatheGeometry(profile, 32));
  const fuselage = new THREE.Mesh(fusGeo, metal);
  fuselage.rotation.x = -Math.PI / 2; // lathe +Y → -Z (nose forward)
  fuselage.scale.set(1, 1, 0.62); // flatten vertically (after rotation Z is up in local lathe space)
  hull.add(fuselage);

  // Canopy
  const canopyGeo = track(new THREE.SphereGeometry(0.075, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2));
  const canopy = new THREE.Mesh(canopyGeo, glass);
  canopy.scale.set(0.85, 0.85, 2.0);
  canopy.position.set(0, 0.045, -0.2);
  hull.add(canopy);

  // Wings (swept delta), extruded thin.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.06, 0.12);
  wingShape.lineTo(0.47, -0.24);
  wingShape.lineTo(0.47, -0.33);
  wingShape.lineTo(0.06, -0.36);
  wingShape.closePath();
  const wingGeo = track(new THREE.ExtrudeGeometry(wingShape, { depth: 0.014, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 }));
  for (const side of [1, -1]) {
    const w = new THREE.Mesh(wingGeo, metal);
    w.rotation.x = -Math.PI / 2;
    w.position.set(0, -0.012, 0);
    w.scale.x = side;
    // dihedral
    const pivot = new THREE.Group();
    pivot.add(w);
    pivot.rotation.z = side * -0.05;
    hull.add(pivot);
    // wing accent stripe
    const stripe = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.004, 0.012)), accent);
    stripe.position.set(side * 0.26, 0.0, -0.12 + 0.0);
    stripe.rotation.y = side * 0.62;
    stripe.position.y = 0.008 - side * 0.0;
    pivot.add(stripe);
  }

  // Tail fins
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0.16, 0);
  finShape.lineTo(0.05, 0.16);
  finShape.lineTo(0, 0.16);
  finShape.closePath();
  const finGeo = track(new THREE.ExtrudeGeometry(finShape, { depth: 0.01, bevelEnabled: false }));
  for (const side of [1, -1]) {
    const fin = new THREE.Mesh(finGeo, dark);
    fin.rotation.y = Math.PI / 2;
    fin.position.set(side * 0.17 + (side > 0 ? 0 : 0.01), 0.025, 0.4);
    fin.rotation.z = 0;
    fin.rotation.x = 0;
    fin.rotation.y = -Math.PI / 2;
    fin.scale.set(1, 1, 1);
    hull.add(fin);
  }

  // Engines
  const nacGeo = track(new THREE.CylinderGeometry(0.052, 0.062, 0.3, 20));
  const nozzleGeo = track(new THREE.CylinderGeometry(0.05, 0.044, 0.035, 20));
  const flameGeo = track(new THREE.ConeGeometry(0.044, 0.5, 20, 1, true));
  flameGeo.translate(0, -0.25, 0); // apex at origin, base downwards
  flameGeo.rotateX(-Math.PI / 2); // base toward +Z (behind the ship)
  const flameMatA = track(
    new THREE.MeshBasicMaterial({ color: 0x4fb4ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  const flameMatB = track(
    new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  const glowTex = track(glowTexture());
  const engines: Array<{ outer: THREE.Mesh; inner: THREE.Mesh; glow: THREE.Sprite; light: THREE.PointLight }> = [];
  for (const side of [1, -1]) {
    const nac = new THREE.Mesh(nacGeo, metal);
    nac.rotation.x = Math.PI / 2;
    nac.position.set(side * 0.125, -0.005, 0.33);
    hull.add(nac);
    const nozzle = new THREE.Mesh(nozzleGeo, dark);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(side * 0.125, -0.005, 0.485);
    hull.add(nozzle);
    const outer = new THREE.Mesh(flameGeo, flameMatA);
    outer.position.set(side * 0.125, -0.005, 0.5);
    const inner = new THREE.Mesh(flameGeo, flameMatB);
    inner.position.copy(outer.position);
    inner.scale.set(0.5, 0.5, 0.55);
    hull.add(outer, inner);
    const spriteMat = track(new THREE.SpriteMaterial({ map: glowTex, color: 0x66bbff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const glow = new THREE.Sprite(spriteMat);
    glow.position.set(side * 0.125, -0.005, 0.52);
    hull.add(glow);
    const light = new THREE.PointLight(0x4fa8ff, 0.8, 1.4, 2);
    light.position.set(side * 0.125, -0.005, 0.6);
    hull.add(light);
    engines.push({ outer, inner, glow, light });
  }

  // Cyan accent line along the fuselage
  const line = new THREE.Mesh(track(new THREE.BoxGeometry(0.008, 0.004, 0.36)), accent);
  line.position.set(0, 0.07, 0.15);
  hull.add(line);

  // Nav lights
  const navGeo = track(new THREE.SphereGeometry(0.012, 10, 8));
  const red = new THREE.Mesh(navGeo, track(new THREE.MeshBasicMaterial({ color: 0xff2a2a })));
  red.position.set(-0.47, 0, -0.3);
  const green = new THREE.Mesh(navGeo, track(new THREE.MeshBasicMaterial({ color: 0x28ff6a })));
  green.position.set(0.47, 0, -0.3);
  const strobe = new THREE.Mesh(navGeo, track(new THREE.MeshBasicMaterial({ color: 0xffffff })));
  strobe.position.set(0, 0.1, 0.45);
  hull.add(red, green, strobe);
  const mkSprite = (color: number, size: number, pos: THREE.Vector3) => {
    const s = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
    s.scale.setScalar(size);
    s.position.copy(pos);
    hull.add(s);
    return s;
  };
  const redGlow = mkSprite(0xff2a2a, 0.07, red.position);
  const greenGlow = mkSprite(0x28ff6a, 0.07, green.position);
  const strobeGlow = mkSprite(0xffffff, 0.1, strobe.position);

  return {
    group,
    hull,
    update(t, thrust, boost) {
      const flick = 0.92 + 0.08 * Math.sin(t * 61) + 0.05 * Math.sin(t * 23.7);
      const len = (0.14 + 1.05 * thrust + 0.7 * boost) * flick;
      for (const e of engines) {
        e.outer.scale.set(0.7 + 0.5 * thrust, 0.7 + 0.5 * thrust, len);
        e.inner.scale.set(0.35 + 0.25 * thrust, 0.35 + 0.25 * thrust, len * 0.6);
        const gs = 0.16 + 0.22 * thrust + 0.12 * boost;
        e.glow.scale.setScalar(gs * flick);
        e.light.intensity = 0.4 + 2.2 * thrust;
      }
      const blink = (Math.sin(t * 3.2) > 0.2 ? 1 : 0.15);
      redGlow.material.opacity = greenGlow.material.opacity = blink;
      strobeGlow.material.opacity = Math.sin(t * 1.7) > 0.93 ? 1 : 0.0;
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
