import type { CesiumModule } from "./loader";
import { DESTINATIONS } from "@/lib/geospatial/destinations";

type Scene = InstanceType<CesiumModule["Scene"]>;

/**
 * City labels, landmark markers and the destination beacon.  All are primitive collections
 * (not Entities) created once; positions are clamped relative to terrain by Cesium so we never
 * touch them again per-frame.
 */
export class Markers {
  private labels: InstanceType<CesiumModule["LabelCollection"]>;
  private points: InstanceType<CesiumModule["PointPrimitiveCollection"]>;
  private lines: InstanceType<CesiumModule["PolylineCollection"]>;
  private beacon: InstanceType<CesiumModule["Polyline"]> | null = null;
  private ring: InstanceType<CesiumModule["PointPrimitive"]> | null = null;

  constructor(
    private C: CesiumModule,
    private scene: Scene,
  ) {
    // `scene` is required for heightReference (terrain clamping) but missing from the typings.
    this.labels = scene.primitives.add(new C.LabelCollection({ scene } as never)) as typeof this.labels;
    this.points = scene.primitives.add(new C.PointPrimitiveCollection({ scene } as never)) as typeof this.points;
    this.lines = scene.primitives.add(new C.PolylineCollection()) as typeof this.lines;
    this.build();
  }

  private build() {
    const C = this.C;
    const cyan = C.Color.fromCssColorString("#5eead4");
    const white = C.Color.fromCssColorString("#e6fbff");
    const dark = C.Color.fromCssColorString("#031018").withAlpha(0.85);
    for (const d of DESTINATIONS) {
      const pos = C.Cartesian3.fromDegrees(d.lon, d.lat, 120);
      this.labels.add({
        position: pos,
        text: d.name.toUpperCase(),
        font: "600 13px ui-monospace, SFMono-Regular, Menlo, monospace",
        fillColor: white,
        outlineColor: dark,
        outlineWidth: 4,
        style: C.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: C.VerticalOrigin.BOTTOM,
        pixelOffset: new C.Cartesian2(0, -8),
        heightReference: C.HeightReference.RELATIVE_TO_GROUND,
        // city names appear once you are descending (< ~3,500 km) so the orbital view stays clean
        distanceDisplayCondition: new C.DistanceDisplayCondition(2500, 3.5e6),
        translucencyByDistance: new C.NearFarScalar(1.2e6, 1.0, 3.5e6, 0.0),
        scaleByDistance: new C.NearFarScalar(1e4, 1.1, 3.5e6, 0.8),
        disableDepthTestDistance: 0,
      });
      this.points.add({
        position: pos,
        pixelSize: 6,
        color: cyan,
        outlineColor: dark,
        outlineWidth: 2,
        heightReference: C.HeightReference.RELATIVE_TO_GROUND,
        distanceDisplayCondition: new C.DistanceDisplayCondition(2500, 3.5e6),
        translucencyByDistance: new C.NearFarScalar(1.2e6, 1.0, 3.5e6, 0.0),
        scaleByDistance: new C.NearFarScalar(1e4, 1.2, 3.5e6, 0.8),
        disableDepthTestDistance: 0,
      });
      for (const l of d.landmarks) {
        const lp = C.Cartesian3.fromDegrees(l.lon, l.lat, 30);
        this.labels.add({
          position: lp,
          text: l.name,
          font: "500 12px ui-monospace, SFMono-Regular, Menlo, monospace",
          fillColor: cyan,
          outlineColor: dark,
          outlineWidth: 4,
          style: C.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: C.VerticalOrigin.BOTTOM,
          pixelOffset: new C.Cartesian2(0, -9),
          heightReference: C.HeightReference.RELATIVE_TO_GROUND,
          distanceDisplayCondition: new C.DistanceDisplayCondition(0, 14000),
          translucencyByDistance: new C.NearFarScalar(2000, 1.0, 14000, 0.0),
          disableDepthTestDistance: 0,
        });
        this.points.add({
          position: lp,
          pixelSize: 5,
          color: cyan,
          outlineColor: dark,
          outlineWidth: 2,
          heightReference: C.HeightReference.RELATIVE_TO_GROUND,
          distanceDisplayCondition: new C.DistanceDisplayCondition(0, 14000),
          disableDepthTestDistance: 0,
        });
      }
    }
  }

  /** Vertical cyan light-beam at the selected destination. */
  setBeacon(latDeg: number | null, lonDeg = 0, ground = 0) {
    const C = this.C;
    if (this.beacon) {
      this.lines.remove(this.beacon);
      this.beacon = null;
    }
    if (this.ring) {
      this.points.remove(this.ring);
      this.ring = null;
    }
    if (latDeg === null) return;
    this.beacon = this.lines.add({
      positions: [C.Cartesian3.fromDegrees(lonDeg, latDeg, ground), C.Cartesian3.fromDegrees(lonDeg, latDeg, ground + 4000)],
      width: 7,
      material: C.Material.fromType("PolylineGlow", { glowPower: 0.3, taperPower: 0.6, color: C.Color.fromCssColorString("#22d3ee") }),
    });
  }

  dispose() {
    const p = this.scene.primitives;
    for (const c of [this.labels, this.points, this.lines]) {
      if (!p.isDestroyed()) p.remove(c as never);
    }
  }
}
