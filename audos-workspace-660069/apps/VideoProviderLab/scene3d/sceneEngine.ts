/**
 * 3D SCENE BUILDER — the three.js engine.
 *
 * three.js is NOT bundled with the space. It is fetched from a CDN the first
 * time the 3D Scene Builder tab opens, through a runtime `import()` of a URL
 * held in a variable, so the compiler never resolves it and none of it is
 * parsed or downloaded for the Lab's other modes. Two CDNs are tried in order;
 * each serves the core and its addons from one module instance.
 *
 * The engine is imperative on purpose: React owns the SceneDoc and hands it
 * over with setDoc(); the engine diffs it against the live scene graph and
 * reports gizmo edits and clicks back through callbacks.
 */
import type {
  BackdropId, CameraView, ElementKind, LightingPreset, MaterialKind, SceneDoc, SceneElement, Transform, Vec3,
} from './sceneModel';
import {
  CATEGORIES, LIGHTING_PRESETS, createElement, displayTransform, evaluateCamera, lightingPreset, turntableView,
} from './sceneModel';
import type { CategoryId, LightingId } from './sceneModel';

// ---------------------------------------------------------------------------
// Loading three.js
// ---------------------------------------------------------------------------

const THREE_VERSION = '0.170.0';

interface CdnSource {
  name: string;
  core: string;
  addon: (path: string) => string;
  font: string;
}

const SOURCES: CdnSource[] = [
  {
    name: 'esm.sh',
    core: `https://esm.sh/three@${THREE_VERSION}`,
    addon: (path) => `https://esm.sh/three@${THREE_VERSION}/examples/jsm/${path}`,
    font: `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/fonts/helvetiker_bold.typeface.json`,
  },
  {
    name: 'jsDelivr',
    core: `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/+esm`,
    addon: (path) => `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/${path}/+esm`,
    font: `https://unpkg.com/three@${THREE_VERSION}/examples/fonts/helvetiker_bold.typeface.json`,
  },
];

const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const LOAD_TIMEOUT_MS = 30_000;

export interface ThreeLib {
  THREE: any;
  OrbitControls: any;
  TransformControls: any;
  GLTFLoader: any;
  DRACOLoader: any | null;
  FontLoader: any;
  TextGeometry: any;
  RoomEnvironment: any;
  source: string;
  fontUrls: string[];
}

function importUrl(url: string): Promise<any> {
  return import(/* @vite-ignore */ /* webpackIgnore: true */ url);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error');
}

let libPromise: Promise<ThreeLib> | null = null;

export function loadThree(): Promise<ThreeLib> {
  if (!libPromise) {
    libPromise = (async () => {
      const problems: string[] = [];
      for (const source of SOURCES) {
        try {
          const [core, orbit, transform, gltf, font, text, room] = await withTimeout(Promise.all([
            importUrl(source.core),
            importUrl(source.addon('controls/OrbitControls.js')),
            importUrl(source.addon('controls/TransformControls.js')),
            importUrl(source.addon('loaders/GLTFLoader.js')),
            importUrl(source.addon('loaders/FontLoader.js')),
            importUrl(source.addon('geometries/TextGeometry.js')),
            importUrl(source.addon('environments/RoomEnvironment.js')),
          ]), LOAD_TIMEOUT_MS, `Loading the 3D engine from ${source.name}`);
          if (!core?.WebGLRenderer || !orbit?.OrbitControls || !transform?.TransformControls) {
            throw new Error('the download was incomplete');
          }
          let draco: any = null;
          try {
            draco = (await withTimeout(importUrl(source.addon('loaders/DRACOLoader.js')), 10_000, 'DRACO loader')).DRACOLoader || null;
          } catch { /* compressed GLBs only; plain GLBs still load */ }
          return {
            THREE: core,
            OrbitControls: orbit.OrbitControls,
            TransformControls: transform.TransformControls,
            GLTFLoader: gltf.GLTFLoader,
            DRACOLoader: draco,
            FontLoader: font.FontLoader,
            TextGeometry: text.TextGeometry,
            RoomEnvironment: room.RoomEnvironment,
            source: source.name,
            fontUrls: SOURCES.map((item) => item.font),
          };
        } catch (error) {
          problems.push(`${source.name}: ${message(error)}`);
        }
      }
      throw new Error(`The 3D engine could not be downloaded (${problems.join(' · ')}). Check your connection, then retry.`);
    })().catch((error) => {
      libPromise = null;
      throw error;
    });
  }
  return libPromise;
}

/** Checked before any download so a device without WebGL gets a clear message instead of a crash. */
export function webglSupport(): { ok: boolean; reason: string } {
  if (typeof document === 'undefined') return { ok: false, reason: 'No browser document is available.' };
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as any;
    if (!gl) {
      return { ok: false, reason: 'This browser or device has WebGL turned off or does not support it, so the 3D view cannot start.' };
    }
    try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* best effort */ }
    return { ok: true, reason: '' };
  } catch (error) {
    return { ok: false, reason: `WebGL could not be started: ${message(error)}` };
  }
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

interface BuildContext {
  lib: ThreeLib;
  textureLoader: any;
  gltfLoader: any;
  font: () => Promise<any | null>;
  resolveUrl: (url: string) => string;
  onAssetError: (id: string, text: string) => void;
}

function makeMaterial(T: any, kind: MaterialKind, color: string, options: Record<string, unknown> = {}): any {
  const tint = new T.Color(color);
  switch (kind) {
    case 'glossy':
      return new T.MeshPhysicalMaterial({ color: tint, roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, ...options });
    case 'metal':
      return new T.MeshStandardMaterial({ color: tint, roughness: 0.22, metalness: 1, ...options });
    case 'glass':
      return new T.MeshPhysicalMaterial({
        color: tint, roughness: 0.04, metalness: 0, transmission: 1, thickness: 0.6, ior: 1.45,
        attenuationColor: tint, attenuationDistance: 2.5, ...options,
      });
    default:
      return new T.MeshStandardMaterial({ color: tint, roughness: 0.88, metalness: 0, ...options });
  }
}

function addMesh(T: any, parent: any, geometry: any, material: any, at?: Vec3, rotation?: Vec3, scale?: Vec3): any {
  const mesh = new T.Mesh(geometry, material);
  mesh.castShadow = !(material && material.transmission > 0);
  mesh.receiveShadow = true;
  if (at) mesh.position.set(at[0], at[1], at[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  if (scale) mesh.scale.set(scale[0], scale[1], scale[2]);
  parent.add(mesh);
  return mesh;
}

function buildMannequin(T: any, group: any, mat: any): void {
  const joint = new T.SphereGeometry(0.05, 16, 12);
  addMesh(T, group, new T.SphereGeometry(0.1, 32, 24), mat, [0, 1.67, 0], undefined, [1, 1.18, 1]);
  addMesh(T, group, new T.CylinderGeometry(0.045, 0.05, 0.1, 16), mat, [0, 1.555, 0]);
  addMesh(T, group, new T.CapsuleGeometry(0.16, 0.3, 8, 24), mat, [0, 1.22, 0], undefined, [1, 1, 0.68]);
  addMesh(T, group, new T.SphereGeometry(0.15, 24, 16), mat, [0, 0.94, 0], undefined, [1.05, 0.7, 0.75]);
  [-1, 1].forEach((side) => {
    addMesh(T, group, joint, mat, [side * 0.22, 1.47, 0]);
    addMesh(T, group, new T.CapsuleGeometry(0.045, 0.24, 6, 16), mat, [side * 0.24, 1.32, 0], [0, 0, side * 0.08]);
    addMesh(T, group, joint, mat, [side * 0.255, 1.15, 0], undefined, [0.85, 0.85, 0.85]);
    addMesh(T, group, new T.CapsuleGeometry(0.04, 0.22, 6, 16), mat, [side * 0.26, 1.0, 0.01]);
    addMesh(T, group, new T.SphereGeometry(0.045, 16, 12), mat, [side * 0.27, 0.82, 0.015], undefined, [0.8, 1.2, 0.6]);
    addMesh(T, group, new T.CapsuleGeometry(0.07, 0.36, 6, 16), mat, [side * 0.09, 0.68, 0]);
    addMesh(T, group, joint, mat, [side * 0.09, 0.46, 0.005], undefined, [1.1, 1.1, 1.1]);
    addMesh(T, group, new T.CapsuleGeometry(0.055, 0.34, 6, 16), mat, [side * 0.09, 0.28, 0]);
    addMesh(T, group, new T.BoxGeometry(0.09, 0.06, 0.22), mat, [side * 0.09, 0.03, 0.04]);
  });
}

function buildText(T: any, ctx: BuildContext, group: any, element: SceneElement, mat: any): void {
  const text = (element.text || 'TEXT').slice(0, 40) || ' ';
  void ctx.font().then((font) => {
    if (group.userData.disposed) return;
    if (font) {
      const geometry = new ctx.lib.TextGeometry(text, {
        font, size: 0.4, depth: 0.12, curveSegments: 8,
        bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.01, bevelSegments: 3,
      });
      geometry.center();
      addMesh(T, group, geometry, mat);
      return;
    }
    // No font could be downloaded: fall back to flat lettering so the element still shows.
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const paint = canvas.getContext('2d');
    if (paint) {
      paint.fillStyle = element.color;
      paint.font = 'bold 150px system-ui, sans-serif';
      paint.textAlign = 'center';
      paint.textBaseline = 'middle';
      paint.fillText(text, 512, 128);
    }
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    addMesh(T, group, new T.PlaneGeometry(2, 0.5), new T.MeshStandardMaterial({ map: texture, transparent: true, side: T.DoubleSide }));
  });
}

function placeholder(T: any, group: any, color: number): any {
  const box = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color, wireframe: true }));
  box.position.y = 0.5;
  box.userData.placeholder = true;
  group.add(box);
  return box;
}

function buildModel(T: any, ctx: BuildContext, group: any, element: SceneElement): void {
  const hold = placeholder(T, group, 0x9aa0ae);
  if (!element.assetUrl) {
    (hold.material as any).color.set(0xe5484d);
    ctx.onAssetError(element.id, 'This model has no file. Upload it again.');
    return;
  }
  void ctx.gltfLoader.loadAsync(ctx.resolveUrl(element.assetUrl)).then((gltf: any) => {
    if (group.userData.disposed) return;
    const model = gltf.scene || gltf.scenes?.[0];
    if (!model) throw new Error('the file contains no scene');
    model.traverse((child: any) => {
      if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
    });
    const box = new T.Box3().setFromObject(model);
    const size = box.getSize(new T.Vector3());
    const longest = Math.max(size.x, size.y, size.z) || 1;
    const fit = 1.6 / longest;
    const holder = new T.Group();
    holder.scale.setScalar(fit);
    const center = box.getCenter(new T.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    holder.add(model);
    group.remove(hold);
    disposeObject(hold);
    group.add(holder);
  }).catch((error: unknown) => {
    if (group.userData.disposed) return;
    (hold.material as any).color.set(0xe5484d);
    ctx.onAssetError(element.id, `The model could not be loaded (${message(error)}). Re-upload it, or use a .glb with textures embedded.`);
  });
}

function buildBillboard(T: any, ctx: BuildContext, group: any, element: SceneElement): void {
  const hold = placeholder(T, group, 0x9aa0ae);
  if (!element.assetUrl) {
    (hold.material as any).color.set(0xe5484d);
    ctx.onAssetError(element.id, 'This billboard has no image. Upload it again.');
    return;
  }
  void ctx.textureLoader.loadAsync(ctx.resolveUrl(element.assetUrl)).then((texture: any) => {
    if (group.userData.disposed) { texture.dispose(); return; }
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    const image = texture.image || {};
    const ratio = image.width && image.height ? image.width / image.height : 1;
    const height = 1.5;
    const material = new T.MeshStandardMaterial({
      map: texture, color: new T.Color(element.color), side: T.DoubleSide, roughness: 0.8, transparent: true, alphaTest: 0.02,
    });
    group.remove(hold);
    disposeObject(hold);
    addMesh(T, group, new T.PlaneGeometry(height * ratio, height), material, [0, height / 2, 0]);
  }).catch((error: unknown) => {
    if (group.userData.disposed) return;
    (hold.material as any).color.set(0xe5484d);
    ctx.onAssetError(element.id, `The image could not be loaded (${message(error)}). Upload it again.`);
  });
}

function buildElement(ctx: BuildContext, element: SceneElement): any {
  const T = ctx.lib.THREE;
  const group = new T.Group();
  group.userData.elementId = element.id;
  const mat = makeMaterial(T, element.material, element.color);
  const plain = (color: string, extra: Record<string, unknown> = {}) => makeMaterial(T, 'matte', color, extra);
  const kind: ElementKind = element.kind;

  switch (kind) {
    case 'cube': addMesh(T, group, new T.BoxGeometry(1, 1, 1), mat); break;
    case 'sphere': addMesh(T, group, new T.SphereGeometry(0.5, 64, 40), mat); break;
    case 'cylinder': addMesh(T, group, new T.CylinderGeometry(0.5, 0.5, 1, 64), mat); break;
    case 'cone': addMesh(T, group, new T.ConeGeometry(0.5, 1, 64), mat); break;
    case 'torus': addMesh(T, group, new T.TorusGeometry(0.4, 0.13, 32, 96), mat); break;
    case 'plane': mat.side = T.DoubleSide; addMesh(T, group, new T.PlaneGeometry(2, 2), mat); break;
    case 'text': buildText(T, ctx, group, element, mat); break;
    case 'pedestal':
      addMesh(T, group, new T.CylinderGeometry(0.62, 0.62, 0.06, 64), mat, [0, 0.03, 0]);
      addMesh(T, group, new T.CylinderGeometry(0.55, 0.55, 0.84, 64), mat, [0, 0.48, 0]);
      addMesh(T, group, new T.CylinderGeometry(0.6, 0.6, 0.06, 64), mat, [0, 0.93, 0]);
      break;
    case 'table':
      addMesh(T, group, new T.BoxGeometry(1.6, 0.06, 0.9), mat, [0, 0.74, 0]);
      [[-0.72, -0.38], [0.72, -0.38], [-0.72, 0.38], [0.72, 0.38]].forEach(([x, z]) => {
        addMesh(T, group, new T.BoxGeometry(0.06, 0.71, 0.06), mat, [x, 0.355, z]);
      });
      break;
    case 'chair':
      addMesh(T, group, new T.BoxGeometry(0.48, 0.05, 0.48), mat, [0, 0.46, 0]);
      addMesh(T, group, new T.BoxGeometry(0.48, 0.5, 0.04), mat, [0, 0.73, -0.22]);
      [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([x, z]) => {
        addMesh(T, group, new T.BoxGeometry(0.04, 0.44, 0.04), mat, [x, 0.22, z]);
      });
      break;
    case 'lamp': {
      addMesh(T, group, new T.CylinderGeometry(0.18, 0.2, 0.04, 48), mat, [0, 0.02, 0]);
      addMesh(T, group, new T.CylinderGeometry(0.02, 0.02, 1.5, 16), mat, [0, 0.77, 0]);
      addMesh(T, group, new T.CylinderGeometry(0.14, 0.26, 0.3, 48, 1, true), plain('#f3e7d0', { side: T.DoubleSide, emissive: new T.Color('#ffcf8a'), emissiveIntensity: 0.35 }), [0, 1.55, 0]);
      const bulb = new T.Mesh(new T.SphereGeometry(0.06, 16, 12), new T.MeshBasicMaterial({ color: '#ffe2b0' }));
      bulb.position.set(0, 1.5, 0);
      group.add(bulb);
      const glow = new T.PointLight('#ffcf8a', 8, 7, 2);
      glow.position.set(0, 1.45, 0);
      group.add(glow);
      break;
    }
    case 'plant': {
      addMesh(T, group, new T.CylinderGeometry(0.2, 0.15, 0.36, 40), mat, [0, 0.18, 0]);
      addMesh(T, group, new T.CylinderGeometry(0.18, 0.18, 0.02, 40), plain('#3b2a1e'), [0, 0.35, 0]);
      addMesh(T, group, new T.CylinderGeometry(0.015, 0.02, 0.4, 8), plain('#4a6b3a'), [0, 0.55, 0]);
      const leaf = plain('#3f8f4f');
      const leaves: Array<[number, number, number, number]> = [
        [0, 0.95, 0, 0.2], [0.16, 0.8, 0.05, 0.16], [-0.15, 0.78, -0.04, 0.17],
        [0.05, 0.7, 0.16, 0.15], [-0.04, 0.72, -0.17, 0.15], [0.12, 0.62, -0.12, 0.13], [-0.12, 0.64, 0.12, 0.13],
      ];
      leaves.forEach(([x, y, z, r]) => addMesh(T, group, new T.IcosahedronGeometry(r, 1), leaf, [x, y, z]));
      break;
    }
    case 'arch':
      addMesh(T, group, new T.BoxGeometry(0.28, 2.2, 0.3), mat, [-0.9, 1.1, 0]);
      addMesh(T, group, new T.BoxGeometry(0.28, 2.2, 0.3), mat, [0.9, 1.1, 0]);
      addMesh(T, group, new T.TorusGeometry(0.9, 0.14, 24, 64, Math.PI), mat, [0, 2.2, 0]);
      break;
    case 'stairs':
      for (let step = 0; step < 5; step += 1) {
        const height = (step + 1) * 0.18;
        addMesh(T, group, new T.BoxGeometry(1.4, height, 0.3), mat, [0, height / 2, 0.6 - step * 0.3]);
      }
      break;
    case 'mannequin': buildMannequin(T, group, mat); break;
    case 'figure':
      addMesh(T, group, new T.CapsuleGeometry(0.22, 0.9, 8, 32), mat, [0, 0.67, 0], undefined, [1, 1, 0.7]);
      addMesh(T, group, new T.SphereGeometry(0.16, 32, 24), mat, [0, 1.5, 0]);
      break;
    case 'model': buildModel(T, ctx, group, element); break;
    case 'billboard': buildBillboard(T, ctx, group, element); break;
    default: placeholder(T, group, 0x9aa0ae);
  }
  return group;
}

function disposeObject(root: any): void {
  if (!root) return;
  root.userData && (root.userData.disposed = true);
  root.traverse((child: any) => {
    if (child.userData) child.userData.disposed = true;
    if (child.geometry) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    materials.forEach((material: any) => {
      Object.keys(material).forEach((key) => {
        const value = material[key];
        if (value && value.isTexture) value.dispose();
      });
      material.dispose();
    });
    if (child.isLight && child.shadow?.map) child.shadow.map.dispose();
  });
}

function buildLights(T: any, preset: LightingPreset): any {
  const group = new T.Group();
  group.add(new T.HemisphereLight(preset.hemisphere.sky, preset.hemisphere.ground, preset.hemisphere.intensity));
  preset.lights.forEach((def) => {
    let light: any;
    if (def.type === 'directional') {
      light = new T.DirectionalLight(def.color, def.intensity);
      light.target.position.set(0, 0.8, 0);
      group.add(light.target);
    } else if (def.type === 'spot') {
      light = new T.SpotLight(def.color, def.intensity, def.distance || 0, def.angle || 0.6, 0.45, 2);
      const target = def.target || [0, 0.8, 0];
      light.target.position.set(target[0], target[1], target[2]);
      group.add(light.target);
    } else {
      light = new T.PointLight(def.color, def.intensity, def.distance || 0, 2);
    }
    light.position.set(def.position[0], def.position[1], def.position[2]);
    if (def.castShadow) {
      light.castShadow = true;
      light.shadow.mapSize.set(2048, 2048);
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.02;
      if (light.shadow.camera.isOrthographicCamera) {
        Object.assign(light.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 40 });
        light.shadow.camera.updateProjectionMatrix();
      }
    }
    group.add(light);
  });
  return group;
}

function buildBackdrop(T: any, kind: BackdropId, color: string): any {
  const group = new T.Group();
  const material = new T.MeshStandardMaterial({ color: new T.Color(color), roughness: 0.95, metalness: 0 });
  if (kind === 'cyclorama') {
    const geometry = new T.PlaneGeometry(120, 40, 1, 160);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    const coveStart = -3;
    const radius = 3;
    const arc = (radius * Math.PI) / 2;
    for (let index = 0; index < positions.count; index += 1) {
      const z = positions.getZ(index);
      const behind = coveStart - z;
      if (behind <= 0) continue;
      if (behind <= arc) {
        const angle = behind / radius;
        positions.setZ(index, coveStart - radius * Math.sin(angle));
        positions.setY(index, radius * (1 - Math.cos(angle)));
      } else {
        positions.setZ(index, coveStart - radius);
        positions.setY(index, radius + (behind - arc));
      }
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    const wall = new T.Mesh(geometry, material);
    wall.receiveShadow = true;
    group.add(wall);
  } else if (kind === 'floor') {
    const geometry = new T.CircleGeometry(60, 96);
    geometry.rotateX(-Math.PI / 2);
    const floor = new T.Mesh(geometry, material);
    floor.receiveShadow = true;
    group.add(floor);
  } else {
    material.dispose();
    const geometry = new T.PlaneGeometry(80, 80);
    geometry.rotateX(-Math.PI / 2);
    const catcher = new T.Mesh(geometry, new T.ShadowMaterial({ opacity: 0.35 }));
    catcher.receiveShadow = true;
    group.add(catcher);
  }
  return group;
}

function applyAtmosphere(T: any, scene: any, preset: LightingPreset, backdrop: BackdropId, color: string): void {
  const backdropColor = new T.Color(color);
  if (backdrop === 'cyclorama') {
    scene.background = backdropColor.clone().multiplyScalar(0.92);
    scene.fog = null;
  } else if (backdrop === 'floor') {
    const fog = preset.fog || { color: preset.background, near: 18, far: 60 };
    scene.background = new T.Color(preset.background);
    scene.fog = new T.Fog(new T.Color(fog.color), fog.near, fog.far);
  } else {
    scene.background = backdropColor;
    scene.fog = null;
  }
  if ('environmentIntensity' in scene) scene.environmentIntensity = preset.environment;
}

function signature(element: SceneElement, resolve: (url: string) => string): string {
  const asset = element.assetUrl ? resolve(element.assetUrl) : '';
  return [element.kind, element.material, element.color, element.text || '', asset].join('|');
}

function round(value: number, places = 3): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export type GizmoMode = 'translate' | 'rotate' | 'scale';

export interface EngineCallbacks {
  onSelect?: (id: string | null) => void;
  onTransformEnd?: (id: string, transform: Transform) => void;
  onAssetError?: (id: string, text: string) => void;
  onContextLost?: () => void;
  /** The user finished orbiting/zooming the camera. */
  onViewEnd?: () => void;
}

export interface RecordedClip {
  blob: Blob;
  mimeType: string;
  extension: 'mp4' | 'webm';
}

interface Tracked {
  object: any;
  sig: string;
}

export class SceneEngine {
  readonly lib: ThreeLib;
  private T: any;
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private renderer: any;
  private scene: any;
  private camera: any;
  private orbit: any;
  private gizmo: any;
  private gizmoHelper: any;
  private pmrem: any;
  private envTexture: any;
  private lightsGroup: any = null;
  private backdropGroup: any = null;
  private elementsGroup: any;
  private helpersGroup: any;
  private selectionBox: any = null;
  private tracked = new Map<string, Tracked>();
  private aliases = new Map<string, string>();
  private ctx: BuildContext;
  private doc: SceneDoc | null = null;
  private atmosphereKey = '';
  private selectedId: string | null = null;
  private playhead = 0;
  private followCamera = true;
  private dragging = false;
  private pointerDown: { x: number; y: number; onGizmo: boolean } | null = null;
  private frame = 0;
  private recording = false;
  private abortRecording = false;
  private playing: { startedAt: number; from: number; onTick: (t: number) => void; onEnd: () => void } | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private fontPromise: Promise<any | null> | null = null;

  constructor(lib: ThreeLib, container: HTMLElement, callbacks: EngineCallbacks = {}) {
    this.lib = lib;
    this.T = lib.THREE;
    this.container = container;
    this.callbacks = callbacks;
    const T = this.T;

    try {
      this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (error) {
      throw new Error(`WebGL could not start on this device (${message(error)}).`);
    }
    const renderer = this.renderer;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    const canvas: HTMLCanvasElement = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    canvas.style.outline = 'none';
    container.appendChild(canvas);

    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(40, 16 / 9, 0.05, 400);
    this.pmrem = new T.PMREMGenerator(renderer);
    const room = new lib.RoomEnvironment();
    this.envTexture = this.pmrem.fromScene(room, 0.04).texture;
    if (typeof room.dispose === 'function') room.dispose();
    this.scene.environment = this.envTexture;

    this.elementsGroup = new T.Group();
    this.helpersGroup = new T.Group();
    this.scene.add(this.elementsGroup, this.helpersGroup);

    const grid = new T.GridHelper(20, 40, 0x8a8f99, 0x5e6472);
    grid.material.transparent = true;
    grid.material.opacity = 0.22;
    grid.material.depthWrite = false;
    grid.position.y = 0.002;
    this.helpersGroup.add(grid);

    this.orbit = new lib.OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.maxPolarAngle = Math.PI * 0.495;
    this.orbit.minDistance = 0.3;
    this.orbit.maxDistance = 60;
    this.orbit.addEventListener('end', () => this.callbacks.onViewEnd?.());

    this.gizmo = new lib.TransformControls(this.camera, canvas);
    this.gizmo.setSize(0.9);
    this.gizmoHelper = typeof this.gizmo.getHelper === 'function' ? this.gizmo.getHelper() : this.gizmo;
    this.scene.add(this.gizmoHelper);
    this.gizmo.addEventListener('dragging-changed', (event: any) => {
      this.dragging = Boolean(event.value);
      this.orbit.enabled = !this.dragging;
      if (!this.dragging) this.commitGizmo();
    });

    const loader = new T.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const gltfLoader = new lib.GLTFLoader();
    gltfLoader.setCrossOrigin('anonymous');
    if (lib.DRACOLoader) {
      try {
        const draco = new lib.DRACOLoader();
        draco.setDecoderPath(DRACO_DECODER_PATH);
        gltfLoader.setDRACOLoader(draco);
      } catch { /* plain GLBs still load */ }
    }
    this.ctx = {
      lib,
      textureLoader: loader,
      gltfLoader,
      font: () => this.loadFont(),
      resolveUrl: (url) => this.aliases.get(url) || url,
      onAssetError: (id, text) => this.callbacks.onAssetError?.(id, text),
    };

    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('dblclick', this.handleDoubleClick);
    canvas.addEventListener('webglcontextlost', this.handleContextLost as EventListener, false);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
    this.resize();
    this.frame = window.requestAnimationFrame(this.tick);
  }

  // -- assets ---------------------------------------------------------------

  private loadFont(): Promise<any | null> {
    if (!this.fontPromise) {
      this.fontPromise = (async () => {
        const loader = new this.lib.FontLoader();
        for (const url of this.lib.fontUrls) {
          try { return await withTimeout(loader.loadAsync(url), 15_000, 'Font'); } catch { /* next */ }
        }
        return null;
      })();
    }
    return this.fontPromise;
  }

  /** While an upload's public URL is still new, keep drawing it from the local copy already in memory. */
  registerAssetAlias(remoteUrl: string, localUrl: string): void {
    if (remoteUrl && localUrl) this.aliases.set(remoteUrl, localUrl);
  }

  // -- document sync -------------------------------------------------------

  setDoc(doc: SceneDoc): void {
    if (this.disposed) return;
    this.doc = doc;
    const T = this.T;
    const preset = lightingPreset(doc.lighting);
    const key = `${doc.lighting}|${doc.backdrop}|${doc.backdropColor}`;
    if (key !== this.atmosphereKey) {
      this.atmosphereKey = key;
      if (this.lightsGroup) { this.scene.remove(this.lightsGroup); disposeObject(this.lightsGroup); }
      if (this.backdropGroup) { this.scene.remove(this.backdropGroup); disposeObject(this.backdropGroup); }
      this.lightsGroup = buildLights(T, preset);
      this.backdropGroup = buildBackdrop(T, doc.backdrop, doc.backdropColor);
      this.scene.add(this.lightsGroup, this.backdropGroup);
      applyAtmosphere(T, this.scene, preset, doc.backdrop, doc.backdropColor);
      this.renderer.toneMappingExposure = preset.exposure;
    }

    const seen = new Set<string>();
    doc.elements.forEach((element) => {
      seen.add(element.id);
      const sig = signature(element, this.ctx.resolveUrl);
      let entry = this.tracked.get(element.id);
      if (!entry || entry.sig !== sig) {
        const wasSelected = this.selectedId === element.id;
        if (entry) {
          if (wasSelected) this.gizmo.detach();
          this.elementsGroup.remove(entry.object);
          disposeObject(entry.object);
        }
        entry = { object: buildElement(this.ctx, element), sig };
        this.tracked.set(element.id, entry);
        this.elementsGroup.add(entry.object);
        if (wasSelected) this.attachSelection();
      }
      if (!(this.dragging && this.selectedId === element.id)) this.applyTransform(entry.object, displayTransform(doc, element, this.playhead));
    });

    Array.from(this.tracked.keys()).forEach((id) => {
      if (seen.has(id)) return;
      const entry = this.tracked.get(id)!;
      if (this.selectedId === id) this.select(null);
      this.elementsGroup.remove(entry.object);
      disposeObject(entry.object);
      this.tracked.delete(id);
    });
  }

  private applyTransform(object: any, transform: Transform): void {
    object.position.set(transform.position[0], transform.position[1], transform.position[2]);
    object.rotation.set(transform.rotation[0] * DEG, transform.rotation[1] * DEG, transform.rotation[2] * DEG);
    object.scale.set(transform.scale[0], transform.scale[1], transform.scale[2]);
  }

  private readTransform(object: any): Transform {
    return {
      position: [round(object.position.x), round(object.position.y), round(object.position.z)],
      rotation: [round(object.rotation.x / DEG, 2), round(object.rotation.y / DEG, 2), round(object.rotation.z / DEG, 2)],
      scale: [round(object.scale.x), round(object.scale.y), round(object.scale.z)],
    };
  }

  // -- selection & gizmo ---------------------------------------------------

  select(id: string | null): void {
    this.selectedId = id;
    this.attachSelection();
  }

  private attachSelection(): void {
    if (this.selectionBox) {
      this.helpersGroup.remove(this.selectionBox);
      this.selectionBox.geometry?.dispose();
      this.selectionBox.material?.dispose();
      this.selectionBox = null;
    }
    const entry = this.selectedId ? this.tracked.get(this.selectedId) : null;
    if (!entry) {
      this.gizmo.detach();
      return;
    }
    this.gizmo.attach(entry.object);
    this.selectionBox = new this.T.BoxHelper(entry.object, 0xd4af37);
    this.helpersGroup.add(this.selectionBox);
  }

  setGizmoMode(mode: GizmoMode): void {
    this.gizmo.setMode(mode);
    this.gizmo.setSpace(mode === 'translate' ? 'world' : 'local');
  }

  private commitGizmo(): void {
    const id = this.selectedId;
    const entry = id ? this.tracked.get(id) : null;
    if (!id || !entry) return;
    this.callbacks.onTransformEnd?.(id, this.readTransform(entry.object));
  }

  private pick(clientX: number, clientY: number): string | null {
    const T = this.T;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const pointer = new T.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new T.Raycaster();
    ray.setFromCamera(pointer, this.camera);
    const hits = ray.intersectObjects(this.elementsGroup.children, true);
    for (const hit of hits) {
      let node = hit.object;
      while (node && !node.userData?.elementId) node = node.parent;
      if (node?.userData?.elementId) return String(node.userData.elementId);
    }
    return null;
  }

  private handlePointerDown = (event: PointerEvent) => {
    this.pointerDown = { x: event.clientX, y: event.clientY, onGizmo: this.gizmo.axis !== null && this.gizmo.axis !== undefined };
  };

  private handlePointerUp = (event: PointerEvent) => {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || down.onGizmo || this.dragging || this.recording) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
    this.callbacks.onSelect?.(this.pick(event.clientX, event.clientY));
  };

  private handleDoubleClick = (event: MouseEvent) => {
    const id = this.pick(event.clientX, event.clientY);
    const entry = id ? this.tracked.get(id) : null;
    if (!entry) return;
    const box = new this.T.Box3().setFromObject(entry.object);
    if (box.isEmpty()) return;
    const center = box.getCenter(new this.T.Vector3());
    const offset = this.camera.position.clone().sub(this.orbit.target);
    this.orbit.target.copy(center);
    this.camera.position.copy(center).add(offset);
  };

  private handleContextLost = (event: Event) => {
    event.preventDefault();
    this.callbacks.onContextLost?.();
  };

  // -- camera --------------------------------------------------------------

  getView(): CameraView {
    const p = this.camera.position;
    const t = this.orbit.target;
    return { position: [round(p.x), round(p.y), round(p.z)], target: [round(t.x), round(t.y), round(t.z)], fov: round(this.camera.fov, 2) };
  }

  setView(view: CameraView): void {
    this.camera.position.set(view.position[0], view.position[1], view.position[2]);
    this.orbit.target.set(view.target[0], view.target[1], view.target[2]);
    this.camera.fov = view.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.orbit.target);
    this.orbit.update();
  }

  // -- timeline ------------------------------------------------------------

  /** Shows the scene at time t. Elements with keyframes follow them; the camera follows its keys when asked. */
  setPlayhead(t: number, followCamera = true): void {
    this.playhead = Math.max(0, t);
    this.followCamera = followCamera;
    this.applyPlayhead(this.playhead);
  }

  private applyPlayhead(t: number, cameraOverride?: CameraView | null): void {
    const doc = this.doc;
    if (!doc) return;
    doc.elements.forEach((element) => {
      if (!doc.animation.elements[element.id]?.length) return;
      if (this.dragging && this.selectedId === element.id) return;
      const entry = this.tracked.get(element.id);
      if (entry) this.applyTransform(entry.object, displayTransform(doc, element, t));
    });
    const view = cameraOverride !== undefined
      ? cameraOverride
      : this.followCamera && doc.animation.camera.length ? evaluateCamera(doc.animation.camera, t) : null;
    if (view) this.setView(view);
  }

  play(from: number, onTick: (t: number) => void, onEnd: () => void): void {
    this.playing = { startedAt: performance.now(), from, onTick, onEnd };
  }

  stop(): void {
    this.playing = null;
  }

  isPlaying(): boolean {
    return Boolean(this.playing);
  }

  // -- loop ----------------------------------------------------------------

  private tick = () => {
    if (this.disposed) return;
    this.frame = window.requestAnimationFrame(this.tick);
    if (this.recording) return;
    if (this.playing && this.doc) {
      const duration = this.doc.animation.duration;
      const t = this.playing.from + (performance.now() - this.playing.startedAt) / 1000;
      if (t >= duration) {
        const done = this.playing;
        this.playing = null;
        this.playhead = duration;
        this.applyPlayhead(duration);
        done.onTick(duration);
        done.onEnd();
      } else {
        this.playhead = t;
        this.applyPlayhead(t);
        this.playing.onTick(t);
      }
    }
    this.orbit.update();
    this.selectionBox?.update();
    this.renderer.render(this.scene, this.camera);
  };

  resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // -- outputs -------------------------------------------------------------

  private setHelpersVisible(visible: boolean): void {
    this.helpersGroup.visible = visible;
    this.gizmoHelper.visible = visible;
  }

  private clampSize(width: number, height: number): { width: number; height: number } {
    const max = Math.min(4096, Number(this.renderer.capabilities?.maxTextureSize) || 4096);
    const scale = Math.min(1, max / Math.max(width, height));
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
  }

  /**
   * Render one frame at an exact pixel size and return it as a data URL. The
   * canvas is resized and restored inside one task, so the viewport never
   * shows the intermediate frame. Pass `view` to render a saved shot without
   * moving the editor camera.
   */
  renderStill(width: number, height: number, options: { mime?: string; quality?: number; view?: CameraView } = {}): string {
    const size = this.clampSize(width, height);
    const canvas: HTMLCanvasElement = this.renderer.domElement;
    const previousRatio = this.renderer.getPixelRatio();
    const previous = this.renderer.getSize(new this.T.Vector2());
    const saved = options.view ? this.getView() : null;
    this.setHelpersVisible(false);
    try {
      if (options.view) this.setView(options.view);
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(size.width, size.height, false);
      this.camera.aspect = size.width / size.height;
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
      return canvas.toDataURL(options.mime || 'image/png', options.quality);
    } finally {
      if (saved) this.setView(saved);
      this.renderer.setPixelRatio(previousRatio);
      this.renderer.setSize(previous.x, previous.y, false);
      this.camera.aspect = previous.x / Math.max(1, previous.y);
      this.camera.updateProjectionMatrix();
      this.setHelpersVisible(true);
      this.renderer.render(this.scene, this.camera);
    }
  }

  static recordingSupport(): { ok: boolean; reason: string } {
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!canvas || typeof (canvas as any).captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      return { ok: false, reason: 'This browser cannot record the 3D view to video. Use Chrome, Edge or Firefox, or send a still to an AI video model instead.' };
    }
    return { ok: true, reason: '' };
  }

  private static pickMime(): { mimeType: string; extension: 'mp4' | 'webm' } {
    const candidates: Array<{ mimeType: string; extension: 'mp4' | 'webm' }> = [
      { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' },
      { mimeType: 'video/mp4', extension: 'mp4' },
      { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
      { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
      { mimeType: 'video/webm', extension: 'webm' },
    ];
    const supported = candidates.find((item) => {
      try { return MediaRecorder.isTypeSupported(item.mimeType); } catch { return false; }
    });
    return supported || { mimeType: '', extension: 'webm' };
  }

  /**
   * Play the animation once in real time and capture the canvas to a clip.
   * With `turntable` the camera makes a slow orbit instead of following keys,
   * for scenes that have no animation yet.
   */
  recordClip(options: { width: number; height: number; duration: number; fps?: number; turntable?: boolean; onProgress?: (fraction: number) => void }): Promise<RecordedClip> {
    const support = SceneEngine.recordingSupport();
    if (!support.ok) return Promise.reject(new Error(support.reason));
    if (this.recording) return Promise.reject(new Error('A recording is already running.'));
    const doc = this.doc;
    if (!doc) return Promise.reject(new Error('The scene is not ready yet.'));

    const size = this.clampSize(options.width, options.height);
    const fps = options.fps || 30;
    const duration = Math.max(0.5, options.duration);
    const canvas: any = this.renderer.domElement;
    const previousRatio = this.renderer.getPixelRatio();
    const previous = this.renderer.getSize(new this.T.Vector2());
    const startView = this.getView();
    const pick = SceneEngine.pickMime();

    this.stop();
    this.recording = true;
    this.abortRecording = false;
    this.setHelpersVisible(false);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size.width, size.height, false);
    this.camera.aspect = size.width / size.height;
    this.camera.updateProjectionMatrix();

    const stream: MediaStream = canvas.captureStream(fps);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { ...(pick.mimeType ? { mimeType: pick.mimeType } : {}), videoBitsPerSecond: 8_000_000 });
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      this.finishRecording(previousRatio, previous, startView);
      return Promise.reject(new Error(`Video recording could not start (${message(error)}).`));
    }
    const chunks: Blob[] = [];

    return new Promise<RecordedClip>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        stream.getTracks().forEach((track) => track.stop());
        this.finishRecording(previousRatio, previous, startView);
      };
      recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onerror = (event: any) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Recording failed (${message(event?.error || 'recorder error')}).`));
      };
      recorder.onstop = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (this.abortRecording) {
          reject(new Error('Recording cancelled.'));
          return;
        }
        const type = recorder.mimeType || pick.mimeType || 'video/webm';
        const blob = new Blob(chunks, { type });
        if (!blob.size) {
          reject(new Error('The recorder produced an empty clip. Keep this tab visible while recording and try again.'));
          return;
        }
        resolve({ blob, mimeType: type, extension: /mp4/i.test(type) ? 'mp4' : 'webm' });
      };

      recorder.start(250);
      const startedAt = performance.now();
      const step = () => {
        if (settled) return;
        if (this.abortRecording) {
          if (recorder.state !== 'inactive') recorder.stop();
          return;
        }
        const t = Math.min(duration, (performance.now() - startedAt) / 1000);
        const cameraView = options.turntable
          ? turntableView(startView, t, duration)
          : doc.animation.camera.length ? evaluateCamera(doc.animation.camera, t) : null;
        this.applyPlayhead(t, cameraView);
        this.renderer.render(this.scene, this.camera);
        options.onProgress?.(t / duration);
        if (t >= duration) {
          window.setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 200);
          return;
        }
        window.requestAnimationFrame(step);
      };
      window.requestAnimationFrame(step);
    });
  }

  cancelRecording(): void {
    this.abortRecording = true;
  }

  private finishRecording(previousRatio: number, previous: any, startView: CameraView): void {
    this.recording = false;
    this.renderer.setPixelRatio(previousRatio);
    this.renderer.setSize(previous.x, previous.y, false);
    this.camera.aspect = previous.x / Math.max(1, previous.y);
    this.camera.updateProjectionMatrix();
    this.setHelpersVisible(true);
    this.setView(startView);
    this.applyPlayhead(this.playhead, null);
  }

  /**
   * Small preview images of every lighting preset and element category,
   * rendered with this engine's own lights and builders so each thumbnail is
   * exactly what the option produces. Categories with nothing to draw are
   * left out and the UI falls back to its swatch.
   */
  renderThumbnails(width = 192, height = 120): { lighting: Partial<Record<LightingId, string>>; categories: Partial<Record<CategoryId, string>> } {
    const T = this.T;
    const lighting: Partial<Record<LightingId, string>> = {};
    const categories: Partial<Record<CategoryId, string>> = {};
    const camera = new T.PerspectiveCamera(36, width / height, 0.05, 200);
    const previousRatio = this.renderer.getPixelRatio();
    const previous = this.renderer.getSize(new T.Vector2());
    const previousExposure = this.renderer.toneMappingExposure;
    const canvas: HTMLCanvasElement = this.renderer.domElement;
    const noopCtx: BuildContext = { ...this.ctx, onAssetError: () => undefined };

    const shoot = (preset: LightingPreset, elements: SceneElement[], view: CameraView): string => {
      const stage = new T.Scene();
      stage.environment = this.envTexture;
      const lights = buildLights(T, preset);
      const backdrop = buildBackdrop(T, 'cyclorama', preset.backdropColor);
      const objects = elements.map((element) => {
        const object = buildElement(noopCtx, element);
        this.applyTransform(object, element);
        return object;
      });
      stage.add(lights, backdrop, ...objects);
      applyAtmosphere(T, stage, preset, 'cyclorama', preset.backdropColor);
      camera.position.set(view.position[0], view.position[1], view.position[2]);
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(view.target[0], view.target[1], view.target[2]);
      this.renderer.toneMappingExposure = preset.exposure;
      this.renderer.render(stage, camera);
      const url = canvas.toDataURL('image/jpeg', 0.82);
      [lights, backdrop, ...objects].forEach(disposeObject);
      return url;
    };

    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      const sample = [
        createElement('pedestal', { position: [-0.5, 0, 0] }),
        createElement('sphere', { position: [-0.5, 1.31, 0], scale: [0.7, 0.7, 0.7], material: 'glossy', color: '#f5f6f8' }),
        createElement('mannequin', { position: [0.75, 0, 0.1], rotation: [0, -25, 0] }),
      ];
      const view: CameraView = { position: [2.6, 1.7, 4.4], target: [0.1, 0.9, 0], fov: 36 };
      LIGHTING_PRESETS.forEach((preset) => {
        try { lighting[preset.id] = shoot(preset, sample, view); } catch { /* swatch fallback */ }
      });
      const studio = lightingPreset('studio');
      const sets: Partial<Record<CategoryId, SceneElement[]>> = {
        primitives: [
          createElement('cube', { position: [-0.9, 0.5, 0], rotation: [0, 25, 0] }),
          createElement('sphere', { position: [0.25, 0.5, 0.3] }),
          createElement('cone', { position: [1.2, 0.5, -0.2] }),
        ],
        props: [
          createElement('table', { position: [-0.3, 0, 0], rotation: [0, 15, 0] }),
          createElement('chair', { position: [0.9, 0, 0.6], rotation: [0, -40, 0] }),
          createElement('plant', { position: [-1.35, 0, -0.3] }),
        ],
        characters: [
          createElement('mannequin', { position: [-0.45, 0, 0], rotation: [0, 20, 0] }),
          createElement('figure', { position: [0.55, 0, -0.2], rotation: [0, -20, 0] }),
        ],
      };
      CATEGORIES.forEach((category) => {
        const set = sets[category.id];
        if (!set) return;
        try {
          categories[category.id] = shoot(studio, set, { position: [2.4, 1.8, 4.2], target: [0, 0.75, 0], fov: 36 });
        } catch { /* swatch fallback */ }
      });
    } finally {
      this.renderer.setPixelRatio(previousRatio);
      this.renderer.setSize(previous.x, previous.y, false);
      this.renderer.toneMappingExposure = previousExposure;
      this.renderer.render(this.scene, this.camera);
    }
    return { lighting, categories };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abortRecording = true;
    window.cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    const canvas: HTMLCanvasElement = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('dblclick', this.handleDoubleClick);
    canvas.removeEventListener('webglcontextlost', this.handleContextLost as EventListener);
    try { this.gizmo.detach(); this.gizmo.dispose(); } catch { /* already gone */ }
    try { this.orbit.dispose(); } catch { /* already gone */ }
    this.tracked.forEach((entry) => disposeObject(entry.object));
    this.tracked.clear();
    disposeObject(this.lightsGroup);
    disposeObject(this.backdropGroup);
    disposeObject(this.helpersGroup);
    try { this.envTexture.dispose(); this.pmrem.dispose(); } catch { /* already gone */ }
    this.renderer.dispose();
    if (canvas.parentElement === this.container) this.container.removeChild(canvas);
  }
}
