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
  scene.fog = new THREE.Fog(0xcdebff, 140, 520);   // light atmospheric depth, no grey haze

  const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.05, 600);
  // The "rig" is the player's body in the world. In VR the headset moves the camera inside it.
  const rig = new THREE.Group(); rig.name = 'rig';
  rig.add(camera);
  scene.add(rig);

  // Lights: bright cartoony daylight
  const hemi = new THREE.HemisphereLight(0xd6ecff, 0xffd2a6, 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.55);
  sun.position.set(40, 80, 25);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45; sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun); scene.add(sun.target);

  const sky = buildSky(); scene.add(sky);

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
  let lastT = performance.now();
  function followSun(p) {
    sun.position.set(p.x + 40, p.y + 80, p.z + 25);
    sun.target.position.set(p.x, p.y, p.z);
    // clouds drift slowly across the sky; the sky dome stays centered on the player
    const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    sky.position.set(p.x, 0, p.z);
    if (sky.userData.clouds) sky.userData.clouds.rotation.y += dt * 0.006;
  }
  return { renderer, scene, camera, rig, sun, hemi, applyQuality, followSun };
}

function buildSky() {
  const g = new THREE.SphereGeometry(500, 24, 12);
  const cols = [];
  const top = new THREE.Color(0x2f7cf0), mid = new THREE.Color(0x7cc6ff), hor = new THREE.Color(0xd8f0ff), warm = new THREE.Color(0xfff1d6);
  const p = g.attributes.position, c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 500;
    if (y > 0.2) c.copy(mid).lerp(top, Math.min(1, (y - 0.2) / 0.65));
    else if (y > -0.02) c.copy(hor).lerp(mid, (y + 0.02) / 0.22);
    else c.copy(warm).lerp(hor, Math.max(0, (y + 0.2) / 0.18));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10; sky.name = 'skyDome';
  const grp = new THREE.Group(); grp.add(sky);
  // sun disc with a soft halo
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(20, 24), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }));
  const halo = new THREE.Mesh(new THREE.CircleGeometry(38, 24), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false, transparent: true, opacity: 0.25, depthWrite: false }));
  sunDisc.position.set(180, 300, 110); sunDisc.lookAt(0, 0, 0); halo.position.set(181, 301.5, 111); halo.lookAt(0, 0, 0); grp.add(halo, sunDisc);
  // puffy cartoon clouds: clusters of round puffs with flat-ish bottoms and soft blue-grey undersides
  const batch = new GeoBatch();
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const white = new THREE.Color(0xffffff), under = new THREE.Color(0xc9d9ee), cc = new THREE.Color();
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + r() * 0.2, rad = 230 + r() * 140;
    const cx = Math.cos(a) * rad, cy = 90 + r() * 60, cz = Math.sin(a) * rad, tx = -Math.sin(a), tz = Math.cos(a);
    const n = 4 + Math.floor(r() * 4), size = 9 + r() * 7;
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * size * 1.15, s = size * (0.75 + r() * 0.55) * (k === Math.floor(n / 2) ? 1.25 : 1);
      const px = cx + tx * off + (r() - 0.5) * size, py = cy + r() * size * 0.5, pz = cz + tz * off + (r() - 0.5) * size;
      batch.geom(puff, trs(px, py, pz, r(), r(), 0, s, s * 0.72, s), 0xffffff, (vi, v) => cc.copy(under).lerp(white, Math.min(1, Math.max(0, (v.y - (py - s * 0.5)) / (s * 1.1)))));
    }
  }
  const clouds = new THREE.Mesh(batch.build(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  grp.add(clouds); grp.userData.clouds = clouds;
  grp.name = 'sky';
  return grp;
}
