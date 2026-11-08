// Renderer, scene, sky, lights. Tuned for Meta Quest 3 (72-90 FPS) and desktop.
import * as THREE from 'three';
import { settings, onSettings } from '../ui/settings.js';
import { GeoBatch, trs } from './geo.js';

export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0xbfe6ff, 70, 260);

  const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.05, 600);
  // The "rig" is the player's body in the world. In VR the headset moves the camera inside it.
  const rig = new THREE.Group(); rig.name = 'rig';
  rig.add(camera);
  scene.add(rig);

  // Lights: bright cartoony daylight
  const hemi = new THREE.HemisphereLight(0xcfeaff, 0xffc89a, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.set(40, 80, 25);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45; sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun); scene.add(sun.target);

  scene.add(buildSky());

  function applyQuality() {
    const inXR = renderer.xr.isPresenting;
    const pr = settings.quality === 'high' ? Math.min(window.devicePixelRatio, 2) : settings.quality === 'med' ? Math.min(window.devicePixelRatio, 1.25) : 0.85;
    renderer.setPixelRatio(pr);
    // Quest: shadows cost a whole extra render pass, so in VR they're only on with 'Pretty' graphics
    const wantShadows = settings.shadows && (!inXR || settings.quality === 'high');
    if (renderer.shadowMap.enabled !== wantShadows) {
      renderer.shadowMap.enabled = wantShadows; sun.castShadow = wantShadows;
      scene.traverse(o => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); } });
    }
    const size = settings.quality === 'high' ? 2048 : settings.quality === 'med' ? 1024 : 512;
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    if (!inXR) { camera.fov = settings.fov; camera.updateProjectionMatrix(); }
    // XR resolution + foveation (Quest): balanced = native-ish, fast = lower
    renderer.xr.setFramebufferScaleFactor(settings.quality === 'high' ? 1.2 : settings.quality === 'med' ? 1.0 : 0.8);
    renderer.xr.setFoveation(settings.quality === 'high' ? 0.3 : 1.0);
  }
  applyQuality();
  onSettings(applyQuality);

  window.addEventListener('resize', () => {
    if (renderer.xr.isPresenting) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  });

  // keep the shadow camera centered on the player so shadows stay sharp
  function followSun(p) {
    sun.position.set(p.x + 40, p.y + 80, p.z + 25);
    sun.target.position.set(p.x, p.y, p.z);
  }
  return { renderer, scene, camera, rig, sun, hemi, applyQuality, followSun };
}

function buildSky() {
  const g = new THREE.SphereGeometry(500, 24, 12);
  const cols = [];
  const top = new THREE.Color(0x3d8bff), mid = new THREE.Color(0x8fd3ff), hor = new THREE.Color(0xffd6a5);
  const p = g.attributes.position, c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 500;
    if (y > 0.25) c.copy(mid).lerp(top, Math.min(1, (y - 0.25) / 0.6));
    else c.copy(hor).lerp(mid, Math.max(0, (y + 0.05) / 0.3));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  const grp = new THREE.Group(); grp.add(sky);
  // sun disc + puffy low-poly clouds
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(22, 16), new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false }));
  sunDisc.position.set(180, 300, 110); sunDisc.lookAt(0, 0, 0); grp.add(sunDisc);
  const batch = new GeoBatch();
  const ico = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + Math.sin(i * 7) * 0.3, r = 260 + (i % 4) * 40;
    const cx = Math.cos(a) * r, cy = 95 + (i % 5) * 14, cz = Math.sin(a) * r;
    const tx = -Math.sin(a), tz = Math.cos(a); // tangent so clouds stretch sideways
    for (let k = 0; k < 4; k++) {
      const s = 10 + ((i * 3 + k * 5) % 7) * 2.2, off = k * 11 - 16;
      batch.geom(ico, trs(cx + tx * off, cy + (k % 2) * 4, cz + tz * off, k, i, 0, s, s * 0.7, s), 0xffffff);
    }
  }
  const clouds = new THREE.Mesh(batch.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false, emissive: 0x777788 }));
  grp.add(clouds);
  grp.name = 'sky';
  return grp;
}
