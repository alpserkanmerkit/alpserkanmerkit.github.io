/* ==========================================================================
   arm3d.js — ES module: the real Outcome 1 bogie arm (mesh from the Fusion render), "printed" layer by layer by a cut-plane shader.
   Needs the three importmap in the page head (Home + Mechanical only):
     <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"}}</script>
   Exports:
     hero(canvas, {light, autoPrint})  → full-bleed hero: starfield + arm; prints after ASM.ready (loader / View Transition done);
                                         follows the pointer; scrolling the hero away un-prints it.
     stage(canvas)                     → interactive copy for a pinned story step. Returns a view with
                                         .on (bool, render only while true) · .morph (0..1: turn printed-PLA blue + swing to the
                                         nearest flat profile, for a match-cut to a photo) · .print(dur = 1.6) (re-print, amber → green).
   Both return null when WebGL is unavailable — keep a fallback <img> next to the canvas.
   ========================================================================== */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const Y0 = -0.75, Y1 = 1.25;               // arm height range in model space (print sweep)
const AMBER = new THREE.Color(0xffb547), GREEN = new THREE.Color(0x57e08a);
const PLA = new THREE.Color(0xebe7de), BLUE = new THREE.Color(0x1636b0);

function printMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xebe7de, roughness: .42, metalness: 0, clearcoat: .35 });
  mat.userData.uCut = { value: Y0 };
  mat.onBeforeCompile = sh => {
    sh.uniforms.uCut = mat.userData.uCut;
    sh.vertexShader = 'varying float vLY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLY = position.y;');
    sh.fragmentShader = 'uniform float uCut;\nvarying float vLY;\n' + sh.fragmentShader
      .replace('void main() {', 'void main() {\n if (vLY > uCut) discard;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n float e = smoothstep(uCut - .07, uCut, vLY);\n gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, .62, .2) * 2.2, e);');
  };
  return mat;
}

/* the real Outcome 1 arm: a mesh made from the Fusion render (image-to-3D), decimated to 30k faces in Blender.
   Loads async; scaled so it spans x ≈ ±2, y ≈ -0.73..1.23 (inside the Y0..Y1 print sweep), centred on z. */
const ARM_URL = '/assets/media/arm_outcome1.glb';
let armGeo = null;
const armReady = new GLTFLoader().loadAsync(ARM_URL).then(g => {
  g.scene.updateMatrixWorld(true);
  const parts = []; g.scene.traverse(o => { if (o.isMesh) parts.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); });
  const geo = parts[0]; geo.computeBoundingBox();
  const b = geo.boundingBox, c = b.getCenter(new THREE.Vector3()), s = 3.98 / (b.max.x - b.min.x);
  geo.translate(-c.x, -c.y, -c.z); geo.scale(s, s, s); geo.translate(0, .25, 0);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return (armGeo = geo);
}).catch(() => null);

function buildArm(solidMat, wireMat) {
  const arm = new THREE.Group(), wire = new THREE.Group();
  const add = geo => { arm.add(new THREE.Mesh(geo, solidMat)); wire.add(new THREE.Mesh(geo, wireMat)); };
  if (armGeo) add(armGeo); else armReady.then(g => g && add(g));
  arm.add(wire);
  return arm;
}
function makeView(canvas, opts) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { return null; }
  const dprCap = opts.light ? 1.5 : (innerWidth < 900 ? 1.5 : 2);
  renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(opts.fov || 32, 1, .1, 100);
  const solid = printMaterial();
  const wireMat = new THREE.MeshBasicMaterial({ color: 0xffb547, wireframe: true, transparent: true, opacity: 0, depthWrite: false });
  const arm = buildArm(solid, wireMat);
  scene.add(arm);
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 4, 5); scene.add(key);
  const warm = new THREE.PointLight(0xffb547, 30, 20); warm.position.set(-4, 1, 3); scene.add(warm);
  const cool = new THREE.PointLight(0x5ce1e6, 24, 20); cool.position.set(4, -1, -2); scene.add(cool);
  /* cut = how far the print has progressed; unprint (0..1) lowers the cut plane again (hero scroll-out) */
  const v = { renderer, scene, camera, arm, solid, wireMat, visible: false, cut: { value: Y0 }, unprint: 0, tick: () => {} };
  v.resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; opts.frame(camera, w, h); camera.updateProjectionMatrix(); };
  /* passTo: wireframe colour tweens amber → that colour during the print (candidate → passed) */
  v.print = (dur = 2.2, passTo = null) => {
    if (!window.gsap) { v.cut.value = Y1; return; }
    const tint = { t: 0 };
    gsap.killTweensOf([v.cut, wireMat]);
    v.cut.value = Y0; wireMat.color.copy(AMBER);
    const tl = gsap.timeline()
      .to(wireMat, { opacity: .35, duration: .35 })
      .to(v.cut, { value: Y1, duration: dur, ease: 'power2.inOut' }, .1)
      .to(wireMat, { opacity: 0, duration: .8 }, dur - .3);
    if (passTo) tl.to(tint, { t: 1, duration: dur, ease: 'power1.inOut', onUpdate: () => wireMat.color.lerpColors(AMBER, passTo, tint.t) }, .1);
  };
  v.draw = () => { solid.userData.uCut.value = v.cut.value - v.unprint * (Y1 - Y0 + .1); renderer.render(scene, camera); };
  addEventListener('resize', v.resize); v.resize();
  new IntersectionObserver(([e]) => { v.visible = e.isIntersecting; if (e.isIntersecting) v.resize(); }).observe(canvas);
  views.add(v); startLoop();
  return v;
}

/* one shared render loop for every view on the page */
const views = new Set(), clock = new THREE.Clock();
let looping = false;
function startLoop() {
  if (looping) return; looping = true;
  (function loop() {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    const t = clock.getElapsedTime();
    views.forEach(v => v.tick(t));
  })();
}
const ptr = { x: 0, y: 0 };
addEventListener('pointermove', e => { ptr.x = e.clientX / innerWidth - .5; ptr.y = e.clientY / innerHeight - .5; });

/* ---------- hero ---------- */
export function hero(canvas, { light = false, autoPrint = true } = {}) {
  if (!canvas) return null;
  const v = makeView(canvas, { light, frame: (cam, w) => { const wide = w > 900; cam.position.set(wide ? -1.2 : 0, wide ? -.4 : -2.1, wide ? 9 : 14); } });
  if (!v) return null;
  v.arm.rotation.set(.35, -.6, .05);
  const P = light ? 1000 : 1400, pg = new THREE.BufferGeometry(), pos = new Float32Array(P * 3);
  for (let i = 0; i < P; i++) {
    const r = 6 + Math.random() * 14, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1);
    pos.set([r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p) - 6], i * 3);
  }
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({ size: .035, color: 0x9aa3b5, transparent: true, opacity: .7 });
  const stars = new THREE.Points(pg, starMat);
  v.scene.add(stars);
  /* native scroll position (works with and without Lenis): 0 at the top, 1 once the hero has scrolled away */
  let scrollP = 0, vel = 0;
  const readScroll = () => { scrollP = Math.min(1, Math.max(0, scrollY / innerHeight)); };
  addEventListener('scroll', readScroll, { passive: true }); readScroll();
  v.tick = t => {
    if (!v.visible) return;
    const lenis = window.ASM && window.ASM.lenis, lv = lenis ? Math.abs(lenis.velocity || 0) : 0;
    vel += (Math.min(lv, 60) - vel) * .1;
    const a = v.arm;
    a.rotation.y += ((-.6 + ptr.x * .8 + t * .12 + scrollP * 2.2) - a.rotation.y) * .06;
    a.rotation.x += ((.35 + ptr.y * .4 - scrollP * .5) - a.rotation.x) * .06;
    a.position.y = Math.sin(t * .8) * .06 + scrollP * 1.4 + .25;
    v.unprint = Math.min(1, scrollP * 1.15);   // scroll out = un-print, scroll back = re-print
    stars.rotation.y = t * .015; stars.rotation.x = ptr.y * .1;
    stars.scale.z = 1 + vel * .06;               // starfield stretches with scroll speed
    starMat.size = .035 + vel * .0012;
    v.draw();
  };
  if (autoPrint) {
    const go = () => v.print(2.4);
    const ready = window.ASM && window.ASM.ready;
    if (ready) ready.then(go); else if (window.__introDone) go(); else addEventListener('asm:ready', go, { once: true });
  }
  return v;
}

/* ---------- stage: live, interactive copy for a story step (desktop) ---------- */
export function stage(canvas) {
  if (!canvas) return null;
  const v = makeView(canvas, { fov: 30, frame: cam => cam.position.set(0, .15, 8.2) });
  if (!v) return null;
  v.cut.value = Y1; v.on = true; v.morph = 0;
  v.arm.rotation.set(.3, -.5, 0);
  let sx = 0, sy = 0;
  (canvas.parentElement || canvas).addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); sx = (e.clientX - r.left) / r.width - .5; sy = (e.clientY - r.top) / r.height - .5; });
  const print = v.print;
  v.print = (dur = 1.6) => print(dur, GREEN);
  v.tick = t => {
    if (!v.visible || !v.on) return;
    const a = v.arm, m = v.morph;
    /* match-cut: blend toward the nearest flat profile view (y = kπ, x ≈ 0) and the printed-PLA blue */
    const ry = -.5 + sx * 1.6 + t * .25, rx = .3 + sy * .8, flat = Math.round(ry / Math.PI) * Math.PI;
    a.rotation.y += ((ry + (flat - ry) * m) - a.rotation.y) * (.08 + m * .12);
    a.rotation.x += ((rx + (.04 - rx) * m) - a.rotation.x) * (.08 + m * .12);
    v.solid.color.lerpColors(PLA, BLUE, m);
    v.draw();
  };
  return v;
}
