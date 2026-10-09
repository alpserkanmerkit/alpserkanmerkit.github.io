/* ==========================================================================
   rover3d.js — ES module: the rover assembly (Fusion 360 STL → split into bodies and lit in Blender → Draco glTF)
   that comes apart as you scroll. Each node carries its own explode offset in glTF extras (userData.ex, metres, Y-up).
   The belt drive runs first: nodes with extras.spin turn about their axle, belts (extras.belt, concept geometry drawn in
   Blender) carry a moving tooth texture and fade out as the teardown starts.
   Needs the three importmap in the page head.
   Export:
     teardown(canvas) → view with .p (0..1: assembled → apart; set from a ScrollTrigger). Loads the model only when the
                        canvas nears the viewport. Returns null when WebGL is unavailable — keep a fallback <img>.
   ========================================================================== */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* phones get a lighter copy (bogie arms decimated harder); both carry the baked self-AO in vertex colours */
const URL = matchMedia('(max-width: 900px)').matches ? '/assets/media/rover_assembly_m.glb' : '/assets/media/rover_assembly.glb';
const DRACO = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/gltf/';
/* order of the teardown: plate and motor lift first, then arms, shafts, pulleys, wheels slide out */
const DELAY = { chassis: 0, box: .04, axle: .22, bogie: .12, pulley: .3, wheel: .38 };
/* concept drive parts drawn in Blender: centre shaft + hubs follow the part they sit on */
const ALIAS = { shaft: 'chassis', hub_c: 'chassis', hub_p: 'chassis', hub_s: 'pulley', hub_w: 'wheel' };
const kind = n => { const a = Object.keys(ALIAS).find(k => n.startsWith(k)); return a ? ALIAS[a] : (n.match(/^(chassis|box|axle|bogie|pulley|wheel)/) || [, 'wheel'])[1]; };
/* drive: every pulley is 36 teeth (nominal 1:1), so all spin at one rate; slowed for the eye.
   Belt UVs run 1 unit per ~12 mm of belt, so the tooth texture moves at OMEGA·r / 12 mm. */
const OMEGA = Math.PI, R = .024, PITCH = .012;
function beltTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 4;
  const g = c.getContext('2d'); g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, 32, 4); g.fillStyle = '#6b5233'; g.fillRect(0, 0, 13, 4);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}
const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export function teardown(canvas) {
  if (!canvas) return null;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 900 ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, .05, 50);
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(2, 3, 2); scene.add(key);
  const warm = new THREE.PointLight(0xffb547, 6, 8); warm.position.set(-2, .8, 1.2); scene.add(warm);
  const cool = new THREE.PointLight(0x5ce1e6, 5, 8); cool.position.set(1.6, .6, -1.6); scene.add(cool);
  const rig = new THREE.Group(); scene.add(rig);

  const parts = [], spinners = [];
  const beltTex = beltTexture();
  /* one belt material per drive stage (motor · long · bogie · wheel) so an amber pulse can walk the power path */
  const STAGE = n => n.startsWith('belt_m') ? 0 : n.startsWith('belt_l') ? 1 : n.startsWith('belt_b') ? 2 : 3;
  const beltMats = [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ map: beltTex, roughness: .65, metalness: 0, transparent: true, side: THREE.DoubleSide, emissive: 0xffb547, emissiveIntensity: 0 }));
  const v = { p: 0, visible: false };
  let loading = false;
  const load = () => {
    if (loading) return; loading = true;
    const gl = new GLTFLoader(); gl.setDRACOLoader(new DRACOLoader().setDecoderPath(DRACO));
    gl.loadAsync(URL).then(g => {
      g.scene.traverse(o => {
        if (o.userData && o.userData.belt) o.traverse(m => { if (m.isMesh) m.material = beltMats[STAGE(o.name)]; });
        if (o.userData && o.userData.spin) spinners.push(o);
        if (!o.userData || !o.userData.ex) return;
        const [x, y, z] = o.userData.ex;
        parts.push({ o, base: o.position.clone(), ex: new THREE.Vector3(x, y, z), d: DELAY[kind(o.name)] });
      });
      const b = new THREE.Box3().setFromObject(g.scene), c = b.getCenter(new THREE.Vector3());
      g.scene.position.set(-c.x, -b.min.y, -c.z);
      rig.add(g.scene);
      canvas.dispatchEvent(new Event('rover:loaded'));
    }).catch(() => canvas.dispatchEvent(new Event('rover:error')));
  };

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    /* keep the exploded footprint (~1.3 m wide) in frame on narrow screens */
    far = w / h < 1 ? 5.4 : w / h < 1.4 ? 2.9 : 2.3;   // portrait · squarish (home door) · wide stage
    frame(); camera.updateProjectionMatrix();
  };
  /* close on the running drive, pull back as it comes apart */
  /* phones: start on one bogie group (near side, rear) so the belts read, then widen to the whole rover */
  let far = 2.3;
  const DIR = new THREE.Vector3(.62, .5, .78), MID = new THREE.Vector3(0, .1, 0), GROUP = new THREE.Vector3(-.32, .09, .26), Y = new THREE.Vector3(0, 1, 0), tg = new THREE.Vector3();
  const frame = () => {
    const e = ease(Math.min(1, v.p / .5)), phone = far > 3;
    const near = phone ? 1.25 : far * .8, d = near + (far - near) * e;
    if (phone) tg.copy(GROUP).applyAxisAngle(Y, rig.rotation.y).lerp(MID, e); else tg.copy(MID);
    camera.position.copy(DIR).multiplyScalar(d).add(tg); camera.lookAt(tg);
  };
  addEventListener('resize', resize); resize();
  new IntersectionObserver(([e]) => { v.visible = e.isIntersecting; if (e.isIntersecting) resize(); }, { rootMargin: '600px 0px' }).observe(canvas);
  new IntersectionObserver(([e]) => { if (e.isIntersecting) load(); }, { rootMargin: '1200px 0px' }).observe(canvas);

  let px = 0;
  (canvas.parentElement || canvas).addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); px = (e.clientX - r.left) / r.width - .5; });
  const clock = new THREE.Clock();
  (function loop() {
    requestAnimationFrame(loop);
    if (!v.visible || document.hidden) return;
    const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
    /* run the drive (Blender −Y spin = glTF +Z); belts fade out before the parts move */
    for (const o of spinners) o.rotation.z += OMEGA * dt;
    beltTex.offset.x -= OMEGA * R / PITCH * dt;
    /* power path: a 2.4 s pulse travels motor → long belt → bogie belts → wheel belts */
    const op = 1 - Math.min(1, v.p / .1), ph = (t % 2.4) / 2.4 * 4;
    beltMats.forEach((m, k) => { m.opacity = op; m.visible = op > .01; m.emissiveIntensity = 1.4 * Math.max(0, 1 - Math.abs(ph - k - .5) * 1.6); });
    for (const q of parts) {
      const k = ease(Math.min(1, Math.max(0, (v.p - q.d) / (1 - .38))));
      q.o.position.copy(q.base).addScaledVector(q.ex, k);
    }
    frame();
    rig.rotation.y +=((-.25 + px * .7 + Math.sin(t * .15) * .12 + v.p * .35) - rig.rotation.y) * .05;
    renderer.render(scene, camera);
  })();
  return v;
}
