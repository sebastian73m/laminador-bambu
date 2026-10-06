import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Segment, PlateSummary } from "../src/types.js";
const palette = [
  "#8de3a5",
  "#e9bf69",
  "#64bce6",
  "#c68ff0",
  "#ee8b7a",
  "#65d6c6",
  "#e8a6d0",
];
export function roleColor(role: string): string {
  const key = role.toLowerCase();
  if (key.includes("outer")) return palette[0];
  if (key.includes("inner")) return palette[1];
  if (key.includes("infill")) return palette[2];
  if (key.includes("top")) return palette[3];
  if (key.includes("support")) return palette[4];
  if (key.includes("brim") || key.includes("skirt")) return palette[5];
  return palette[6];
}
export interface Filters {
  start: number;
  end: number;
  progress: number;
  travels: boolean;
  seams: boolean;
  preparation: boolean;
  mode: string;
  hiddenRoles: Set<string>;
}
interface Batch {
  mesh: THREE.InstancedMesh | THREE.LineSegments | THREE.Points;
  seam: boolean;
  indices: number[];
  layer: number;
  role: string;
  tool: number;
  extruding: boolean;
  segments: Segment[];
}
export class ToolpathScene {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.05, 10000);
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private group = new THREE.Group();
  private batches: Batch[] = [];
  private bounds = new THREE.Box3();
  private count = 0;
  private frame = 0;
  private dirty = true;
  private observer: ResizeObserver;
  // Elliptical bead: rounded cross-section gives each adjacent extrusion its
  // own highlight and valley instead of one flat, merged horizontal surface.
  private bead = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1).rotateZ(
    -Math.PI / 2,
  );
  private solidMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.48,
    metalness: 0.03,
  });
  private seamMaterial = new THREE.PointsMaterial({
    color: "#ffffff",
    size: 7,
    sizeAttenuation: false,
    depthWrite: false,
  });
  visibleSeams = 0;
  private travelMaterial = new THREE.LineBasicMaterial({
    color: "#69879a",
    transparent: true,
    opacity: 0.4,
  });
  constructor(private container: HTMLElement) {
    this.scene.background = new THREE.Color("#1b2027");
    this.camera.up.set(0, 0, 1);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.prepend(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener("change", () => {
      this.dirty = true;
    });
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = true;
    this.controls.maxDistance = 3000;
    const ambient = new THREE.HemisphereLight("#ffffff", "#748397", 2.3);
    this.scene.add(ambient);
    const light = new THREE.DirectionalLight("#ffffff", 2.1);
    light.position.set(70, -60, 200);
    this.scene.add(light);
    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(256, 256),
      new THREE.MeshStandardMaterial({
        color: "#242e36",
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    bed.position.set(128, 128, -0.35);
    this.scene.add(bed);
    const grid = new THREE.GridHelper(256, 32, "#41515e", "#303d48");
    grid.rotation.x = Math.PI / 2;
    grid.position.set(128, 128, -0.3);
    this.scene.add(grid);
    const axes = new THREE.AxesHelper(14);
    axes.position.set(0, 0, 0.1);
    this.scene.add(axes, this.group);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.fit();
    this.animate();
    this.renderer.domElement.addEventListener("contextmenu", (e) =>
      e.preventDefault(),
    );
  }
  private resize() {
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }
  private animate = () => {
    this.frame = requestAnimationFrame(this.animate);
    this.controls.update();
    if (this.dirty) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  };
  clear() {
    for (const b of this.batches) {
      this.group.remove(b.mesh);
      if (b.mesh instanceof THREE.InstancedMesh) b.mesh.dispose();
      else b.mesh.geometry.dispose();
    }
    this.batches = [];
    this.bounds.makeEmpty();
    this.count = 0;
  }
  addChunk(segments: Segment[], offset: number) {
    const groups = new Map<
      string,
      { segments: Segment[]; indices: number[] }
    >();
    segments.forEach((s, i) => {
      const key = `${s.layer}|${s.role}|${s.tool}|${s.extruding}`;
      if (!groups.has(key)) groups.set(key, { segments: [], indices: [] });
      const g = groups.get(key)!;
      g.segments.push(s);
      g.indices.push(offset + i);
      if (s.extruding && s.layer > 0) {
        this.bounds.expandByPoint(new THREE.Vector3(...s.a));
        this.bounds.expandByPoint(new THREE.Vector3(...s.b));
      }
    });
    const dummy = new THREE.Object3D(),
      direction = new THREE.Vector3(),
      center = new THREE.Vector3(),
      xAxis = new THREE.Vector3(1, 0, 0);
    for (const g of groups.values()) {
      const first = g.segments[0];
      let mesh: Batch["mesh"];
      if (first.extruding) {
        const instanced = new THREE.InstancedMesh(
          this.bead,
          this.solidMaterial,
          g.segments.length,
        );
        g.segments.forEach((s, i) => {
          direction.set(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]);
          const length = direction.length();
          center.set(
            (s.a[0] + s.b[0]) / 2,
            (s.a[1] + s.b[1]) / 2,
            (s.a[2] + s.b[2]) / 2 - s.height / 2,
          );
          dummy.position.copy(center);
          dummy.quaternion.setFromUnitVectors(xAxis, direction.normalize());
          dummy.scale.set(length, Math.min(s.width, 5), Math.min(s.height, 5));
          dummy.updateMatrix();
          instanced.setMatrixAt(i, dummy.matrix);
          instanced.setColorAt(i, new THREE.Color(roleColor(s.role)));
        });
        instanced.instanceMatrix.needsUpdate = true;
        if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
        instanced.computeBoundingSphere();
        mesh = instanced;
      } else {
        const positions = new Float32Array(g.segments.length * 6);
        g.segments.forEach((s, i) => {
          positions.set(s.a, i * 6);
          positions.set(s.b, i * 6 + 3);
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(positions, 3),
        );
        mesh = new THREE.LineSegments(geometry, this.travelMaterial);
      }
      const batch: Batch = {
        mesh,
        seam: false,
        ...g,
        layer: first.layer,
        role: first.role,
        tool: first.tool,
        extruding: first.extruding,
      };
      this.batches.push(batch);
      this.group.add(mesh);
      const marked = g.segments
        .map((s, i) => ({ s, index: g.indices[i] }))
        .filter(({ s }) => s.seam);
      if (marked.length) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(
            marked.flatMap(({ s }) => [
              s.seam![0],
              s.seam![1],
              s.seam![2] + 0.03,
            ]),
            3,
          ),
        );
        const points = new THREE.Points(geometry, this.seamMaterial);
        points.renderOrder = 1;
        this.group.add(points);
        this.batches.push({
          ...batch,
          mesh: points,
          seam: true,
          segments: marked.map(({ s }) => s),
          indices: marked.map(({ index }) => index),
        });
      }
    }
    this.count = Math.max(this.count, offset + segments.length);
  }
  apply(filters: Filters) {
    this.dirty = true;
    const cutoff = Math.floor((this.count * filters.progress) / 100);
    let visible = 0;
    this.visibleSeams = 0;
    for (const b of this.batches) {
      b.mesh.visible =
        b.layer >= filters.start &&
        b.layer <= filters.end &&
        !filters.hiddenRoles.has(b.role) &&
        (b.seam ? filters.seams : b.extruding || filters.travels) &&
        (b.layer > 0 || filters.preparation);
      if (!b.mesh.visible) continue;
      let lo = 0,
        hi = b.indices.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (b.indices[mid] < cutoff) lo = mid + 1;
        else hi = mid;
      }
      if (b.seam) this.visibleSeams += lo;
      else visible += lo;
      if (b.mesh instanceof THREE.InstancedMesh) b.mesh.count = lo;
      else b.mesh.geometry.setDrawRange(0, lo * (b.seam ? 1 : 2));
    }
    return visible;
  }
  color(mode: string, plate: PlateSummary) {
    this.dirty = true;
    for (const b of this.batches)
      if (b.mesh instanceof THREE.InstancedMesh) {
        b.segments.forEach((s, i) => {
          let color: THREE.Color;
          if (mode === "speed")
            color = new THREE.Color().setHSL(
              0.65 - Math.min(s.speed / 300, 1) * 0.65,
              0.7,
              0.58,
            );
          else if (mode === "tool") {
            const f = plate.statistics.filaments.find((f) => f.tool === s.tool),
              raw = f?.color;
            const hex = raw?.replace(/^#/, "").slice(0, 6);
            color = new THREE.Color(
              hex && /^[a-f0-9]{6}$/i.test(hex)
                ? "#" + hex
                : palette[s.tool % palette.length],
            );
          } else color = new THREE.Color(roleColor(s.role));
          (b.mesh as THREE.InstancedMesh).setColorAt(i, color);
        });
        if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
      }
  }
  fit(top = false) {
    const center = this.bounds.isEmpty()
      ? new THREE.Vector3(128, 128, 0)
      : this.bounds.getCenter(new THREE.Vector3());
    const size = this.bounds.isEmpty()
      ? new THREE.Vector3(150, 150, 80)
      : this.bounds.getSize(new THREE.Vector3());
    const distance = Math.max(25, size.length() * 1.5);
    this.controls.target.copy(center);
    this.camera.position
      .copy(center)
      .add(
        top
          ? new THREE.Vector3(0, -0.001, distance)
          : new THREE.Vector3(
              distance * 0.75,
              -distance * 0.9,
              distance * 0.75,
            ),
      );
    this.camera.near = 0.05;
    this.camera.far = Math.max(10000, distance * 20);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    this.clear();
    this.bead.dispose();
    this.solidMaterial.dispose();
    this.travelMaterial.dispose();
    this.seamMaterial.dispose();
    this.renderer.dispose();
  }
}
