/**
 * Three.js renderer: the same Frame the 2D pitch draws, seen from your player's
 * shoulder. Coordinates: pitch x -> three x, pitch y -> three z, up is y.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PITCH, type Team } from '../sim/types';
import type { Vec } from '../sim/vec';
import type { Frame } from './pitch';

const KIT: Record<Team, number> = { us: 0xffd84d, them: 0xe63963 };
const NUMBER_COLOR: Record<Team, string> = { us: '#1a1608', them: '#ffffff' };
const EYE = 1.6;

export interface Projected {
  x: number;
  y: number;
  /** Inside the viewport and in front of the camera. */
  onScreen: boolean;
  /** Behind the camera entirely. */
  behind: boolean;
}

interface ProcRig {
  torso: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
}

interface AnimRig {
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction;
  walk: THREE.AnimationAction;
  run: THREE.AnimationAction;
}

interface PlayerRig {
  group: THREE.Group;
  sprite: THREE.Sprite;
  ring: THREE.Mesh;
  /** Procedural stand-in, used until the skinned model has loaded. */
  proc?: ProcRig;
  /** Skinned, animated model. */
  anim?: AnimRig;
}

const makeNumberSprite = (num: number, team: Team): THREE.Sprite => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d');
  ctx.fillStyle = team === 'us' ? '#ffd84d' : '#e63963';
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = NUMBER_COLOR[team];
  ctx.font = '700 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.085, 0.085, 1);
  sprite.position.y = 2.35;
  return sprite;
};

const makeBallTexture = (): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d');
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#161616';
  for (let i = 0; i < 12; i++) {
    const x = (i % 6) * 42 + (i >= 6 ? 21 : 0) + 10;
    const y = i >= 6 ? 92 : 36;
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const makePitchTexture = (): THREE.CanvasTexture => {
  const ppm = 20;
  const c = document.createElement('canvas');
  c.width = PITCH.L * ppm;
  c.height = PITCH.W * ppm;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d');
  for (let i = 0; i < PITCH.L / 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#2b7a45' : '#27703f';
    ctx.fillRect(i * 6 * ppm, 0, 6 * ppm, c.height);
  }
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = 0.12 * ppm;
  const rect = (x0: number, y0: number, x1: number, y1: number): void => ctx.strokeRect(x0 * ppm, y0 * ppm, (x1 - x0) * ppm, (y1 - y0) * ppm);
  rect(0.06, 0.06, PITCH.L - 0.06, PITCH.W - 0.06);
  ctx.beginPath();
  ctx.moveTo((PITCH.L / 2) * ppm, 0);
  ctx.lineTo((PITCH.L / 2) * ppm, c.height);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc((PITCH.L / 2) * ppm, (PITCH.W / 2) * ppm, 5 * ppm, 0, Math.PI * 2);
  ctx.stroke();
  const y0 = (PITCH.W - 24) / 2;
  rect(0.06, y0, 10, y0 + 24);
  rect(PITCH.L - 10, y0, PITCH.L - 0.06, y0 + 24);
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (const x of [8, PITCH.L - 8]) {
    ctx.beginPath();
    ctx.arc(x * ppm, (PITCH.W / 2) * ppm, 0.18 * ppm, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

export class Scene3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  /** Six-face capture around the eye; the panorama shader unwraps it. */
  private readonly cubeTarget: THREE.WebGLCubeRenderTarget;
  private readonly cubeCamera: THREE.CubeCamera;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly panoUniforms: { cube: { value: THREE.Texture }; yaw: { value: number }; xMax: { value: number }; yMin: { value: number }; yMax: { value: number } };
  /** Horizontal field of view of the strip, radians. */
  hfov = (125 * Math.PI) / 180;
  /** Vertical range of the strip, radians (down is negative). */
  pMin = (-50 * Math.PI) / 180;
  pMax = (30 * Math.PI) / 180;
  /** Panini projection distance: 0 is rectilinear, 1 is the classic compromise. */
  private readonly panini = 1;
  private readonly rigs = new Map<string, PlayerRig>();
  private readonly ball: THREE.Mesh;
  private readonly ballShadow: THREE.Mesh;
  private readonly lanes = new THREE.Group();
  private readonly camPos = new THREE.Vector3(0, EYE, 0);
  private camYaw = 0;
  private yawInit = false;
  private ballAnchorYaw = 0;
  private model: THREE.Object3D | null = null;
  private clips: THREE.AnimationClip[] = [];
  cssW = 0;
  cssH = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0x0e1a22);
    this.scene.fog = new THREE.Fog(0x0e1a22, 45, 110);

    this.cubeTarget = new THREE.WebGLCubeRenderTarget(640, { generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.cubeCamera = new THREE.CubeCamera(0.1, 220, this.cubeTarget);
    this.scene.add(this.cubeCamera);
    this.panoUniforms = {
      cube: { value: this.cubeTarget.texture },
      yaw: { value: 0 },
      xMax: { value: this.paniniX(this.hfov / 2) },
      yMin: { value: Math.tan(this.pMin) },
      yMax: { value: Math.tan(this.pMax) },
    };
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.panoUniforms,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `
          uniform samplerCube cube; uniform float yaw; uniform float xMax; uniform float yMin; uniform float yMax;
          varying vec2 vUv;
          const float D = 1.0;
          void main(){
            // Inverse Panini: screen (x, y) -> azimuth phi, elevation theta.
            float x = mix(-xMax, xMax, vUv.x);
            float y = mix(yMin, yMax, vUv.y);
            float k = x / (D + 1.0);
            float phi = atan(k) + asin(clamp(k * D / sqrt(1.0 + k * k), -1.0, 1.0));
            float S = (D + 1.0) / (D + cos(phi));
            float theta = atan(y / S);
            float a = yaw + phi;
            vec3 d = vec3(cos(theta) * cos(a), sin(theta), cos(theta) * sin(a));
            vec3 c = textureCube(cube, d).rgb;
            // The cube capture is linear; the canvas wants sRGB.
            gl_FragColor = vec4(pow(max(c * 1.35, 0.0), vec3(1.0 / 2.2)), 1.0);
          }`,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.quadScene.add(quad);

    const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x2a5a36, 1.15);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
    sun.position.set(20, 40, -25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(PITCH.L, PITCH.W),
      new THREE.MeshStandardMaterial({ map: makePitchTexture(), roughness: 1 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(PITCH.L / 2, 0, PITCH.W / 2);
    grass.receiveShadow = true;
    this.scene.add(grass);
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(PITCH.L + 30, PITCH.W + 30),
      new THREE.MeshStandardMaterial({ color: 0x1f5a33, roughness: 1 }),
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(PITCH.L / 2, -0.01, PITCH.W / 2);
    apron.receiveShadow = true;
    this.scene.add(apron);

    for (const x of [0, PITCH.L]) this.scene.add(this.makeGoal(x));

    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 24, 16),
      new THREE.MeshStandardMaterial({ map: makeBallTexture(), roughness: 0.4 }),
    );
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.25, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.ballShadow);
    this.scene.add(this.lanes);

    new GLTFLoader().load(
      `${import.meta.env.BASE_URL}models/xbot.glb`,
      (gltf) => {
        this.model = gltf.scene;
        this.clips = gltf.animations;
        // Rebuild every rig with the skinned model on the next draw.
        for (const rig of this.rigs.values()) this.scene.remove(rig.group);
        this.rigs.clear();
      },
      undefined,
      (err) => console.warn('player model failed to load, keeping procedural figures', err),
    );
  }

  /** Panini horizontal screen coordinate for an azimuth. */
  private paniniX(phi: number): number {
    return ((this.panini + 1) * Math.sin(phi)) / (this.panini + Math.cos(phi));
  }

  /** Height / width the strip wants for undistorted pixels. */
  get aspect(): number {
    return (Math.tan(this.pMax) - Math.tan(this.pMin)) / (2 * this.paniniX(this.hfov / 2));
  }

  /** World direction (pitch-plane angle) the at-feet ball sits in; fixed per moment, not tied to the camera. */
  setBallAnchorYaw(yaw: number): void {
    this.ballAnchorYaw = yaw;
  }

  /**
   * The Mixamo mesh is a robot. We hide it and hang a stylised human on its bones:
   * shirt, shorts, socks, boots, skin and hair. Bone space is centimetres.
   */
  private dress(root: THREE.Object3D, team: Team): void {
    const bones = new Map<string, THREE.Object3D>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.visible = false;
      if ((o as THREE.Bone).isBone) bones.set(o.name.replace(/^mixamorig:?/, ''), o);
    });
    const mats = {
      kit: new THREE.MeshStandardMaterial({ color: KIT[team], roughness: 0.8 }),
      shorts: new THREE.MeshStandardMaterial({ color: team === 'us' ? 0x1c1c1c : 0xf2f2f2, roughness: 0.85 }),
      sock: new THREE.MeshStandardMaterial({ color: KIT[team], roughness: 0.85 }),
      skin: new THREE.MeshStandardMaterial({ color: 0xd9a37a, roughness: 0.75 }),
      hair: new THREE.MeshStandardMaterial({ color: 0x2b1d16, roughness: 0.9 }),
      boot: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 }),
    };
    const up = new THREE.Vector3(0, 1, 0);
    const limb = (from: string, to: string, r: number, mat: THREE.Material, shrink = 0): void => {
      const a = bones.get(from);
      const b = bones.get(to);
      if (!a || !b) return;
      const dir = b.position.clone();
      const len = dir.length() - shrink;
      if (len <= 0.5) return;
      dir.normalize();
      const geo = new THREE.CapsuleGeometry(r, len, 4, 10);
      geo.translate(0, len / 2 + shrink / 2, 0);
      const m = new THREE.Mesh(geo, mat);
      m.quaternion.setFromUnitVectors(up, dir);
      m.castShadow = true;
      a.add(m);
    };
    const ball = (at: string, r: number, mat: THREE.Material, offset = new THREE.Vector3()): void => {
      const a = bones.get(at);
      if (!a) return;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
      m.position.copy(offset);
      m.castShadow = true;
      a.add(m);
    };
    // Torso and pelvis
    limb('Spine', 'Spine1', 10.5, mats.kit);
    limb('Spine1', 'Spine2', 11.5, mats.kit);
    limb('Spine2', 'Neck', 12, mats.kit);
    const hips = bones.get('Hips');
    const lUp = bones.get('LeftUpLeg');
    const rUp = bones.get('RightUpLeg');
    if (hips && lUp && rUp) {
      const mid = lUp.position.clone().add(rUp.position).multiplyScalar(0.5);
      const across = lUp.position.clone().sub(rUp.position);
      const w = across.length();
      const geo = new THREE.CapsuleGeometry(8.5, w, 4, 10);
      const m = new THREE.Mesh(geo, mats.shorts);
      m.quaternion.setFromUnitVectors(up, across.normalize());
      m.position.copy(mid).add(new THREE.Vector3(0, 3, 0));
      m.castShadow = true;
      hips.add(m);
    }
    // Head and neck
    limb('Neck', 'Head', 5, mats.skin);
    const head = bones.get('Head');
    const top = bones.get('HeadTop_End');
    if (head && top) {
      const h = top.position.length();
      const c = top.position.clone().multiplyScalar(0.48);
      ball('Head', h * 0.5, mats.skin, c);
      ball('Head', h * 0.5 + 0.6, mats.hair, c.clone().add(new THREE.Vector3(0, 2.2, -1.8)));
    }
    // Arms
    for (const side of ['Left', 'Right']) {
      limb(`${side}Shoulder`, `${side}Arm`, 5.5, mats.kit);
      limb(`${side}Arm`, `${side}ForeArm`, 4.6, mats.kit, 2);
      limb(`${side}ForeArm`, `${side}Hand`, 3.8, mats.skin);
      ball(`${side}Hand`, 4, mats.skin);
      limb(`${side}UpLeg`, `${side}Leg`, 7, mats.shorts, 0);
      limb(`${side}Leg`, `${side}Foot`, 5.2, mats.skin, 0);
      // Sock: lower half of the shin in kit colour.
      const shin = bones.get(`${side}Leg`);
      const foot = bones.get(`${side}Foot`);
      if (shin && foot) {
        const dir = foot.position.clone();
        const len = dir.length();
        dir.normalize();
        const geo = new THREE.CapsuleGeometry(5.6, len * 0.45, 4, 10);
        geo.translate(0, len * 0.72, 0);
        const m = new THREE.Mesh(geo, mats.sock);
        m.quaternion.setFromUnitVectors(up, dir);
        m.castShadow = true;
        shin.add(m);
      }
      limb(`${side}Foot`, `${side}ToeBase`, 4.5, mats.boot);
      ball(`${side}ToeBase`, 4.2, mats.boot);
    }
  }

  private buildSkinned(team: Team): { root: THREE.Object3D; anim: AnimRig } {
    if (!this.model) throw new Error('model not loaded');
    const root = SkeletonUtils.clone(this.model);
    // Mixamo rigs face +z; our rigs face +x.
    root.rotation.y = Math.PI / 2;
    this.dress(root, team);
    const mixer = new THREE.AnimationMixer(root);
    const action = (n: string): THREE.AnimationAction => {
      const clip = THREE.AnimationClip.findByName(this.clips, n);
      if (!clip) throw new Error(`clip ${n} missing`);
      const a = mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(0);
      return a;
    };
    const anim = { mixer, idle: action('idle'), walk: action('walk'), run: action('run') };
    anim.idle.setEffectiveWeight(1);
    return { root, anim };
  }

  private makeGoal(x: number): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const w = 6;
    const h = 2;
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, h, 12);
    for (const dz of [-w / 2, w / 2]) {
      const post = new THREE.Mesh(postGeo, mat);
      post.position.set(x, h / 2, PITCH.W / 2 + dz);
      post.castShadow = true;
      g.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, w, 12), mat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(x, h, PITCH.W / 2);
    g.add(bar);
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
    );
    net.rotation.y = Math.PI / 2;
    net.position.set(x + (x === 0 ? -1.2 : 1.2), h / 2, PITCH.W / 2);
    g.add(net);
    return g;
  }

  private rigFor(id: string, team: Team, num: number): PlayerRig {
    const existing = this.rigs.get(id);
    if (existing) return existing;
    const group = new THREE.Group();
    if (this.model) {
      const { root, anim } = this.buildSkinned(team);
      group.add(root);
      const sprite = makeNumberSprite(num, team);
      sprite.position.y = 2.15;
      group.add(sprite);
      const ring = this.makeRing();
      group.add(ring);
      this.scene.add(group);
      const rig: PlayerRig = { group, sprite, ring, anim };
      this.rigs.set(id, rig);
      return rig;
    }
    const kit = new THREE.MeshStandardMaterial({ color: KIT[team], roughness: 0.75 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a37a, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 });
    const sock = new THREE.MeshStandardMaterial({ color: team === 'us' ? 0xffd84d : 0xe63963, roughness: 0.9 });

    // Local +x is forward. Torso group leans when running.
    const torso = new THREE.Group();
    torso.position.y = 0.95;
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.42, 6, 14), kit);
    chest.position.y = 0.42;
    chest.castShadow = true;
    torso.add(chest);
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.2, 0.22, 12), dark);
    shorts.position.y = 0.08;
    torso.add(shorts);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.85 }));
    head.position.y = 0.88;
    head.castShadow = true;
    torso.add(head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), skin);
    face.position.set(0.08, 0.86, 0);
    torso.add(face);

    const limb = (len: number, r: number, mat: THREE.Material, lower?: THREE.Material): THREE.Group => {
      const g = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, len * 0.5, 10), mat);
      upper.position.y = -len * 0.25;
      upper.castShadow = true;
      g.add(upper);
      const low = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.7, len * 0.5, 10), lower ?? mat);
      low.position.y = -len * 0.75;
      low.castShadow = true;
      g.add(low);
      return g;
    };
    const hipL = limb(0.92, 0.09, skin, sock);
    hipL.position.set(0, 0.95, 0.12);
    const hipR = limb(0.92, 0.09, skin, sock);
    hipR.position.set(0, 0.95, -0.12);
    const armL = limb(0.62, 0.06, kit, skin);
    armL.position.set(0, 0.72, 0.27);
    const armR = limb(0.62, 0.06, kit, skin);
    armR.position.set(0, 0.72, -0.27);
    torso.add(armL, armR);
    group.add(torso, hipL, hipR);

    const sprite = makeNumberSprite(num, team);
    sprite.position.y = 2.15;
    group.add(sprite);

    const ring = this.makeRing();
    group.add(ring);

    this.scene.add(group);
    const rig: PlayerRig = { group, sprite, ring, proc: { torso, hipL, hipR, armL, armR } };
    this.rigs.set(id, rig);
    return rig;
  }

  private makeRing(): THREE.Mesh {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.55, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.visible = false;
    return ring;
  }

  /** Ground markers under players: id -> colour. Pass null to hide all. */
  setMarkers(markers: Map<string, number> | null): void {
    for (const [id, rig] of this.rigs) {
      const c = markers?.get(id);
      rig.ring.visible = c !== undefined;
      if (c !== undefined) (rig.ring.material as THREE.MeshBasicMaterial).color.setHex(c);
    }
  }

  resize(cssW: number, cssH: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.setSize(cssW, cssH, true);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
  }

  /** Set the look direction (pitch-plane angle) for the frozen view; eased per frame. */
  setYaw(yaw: number, immediate = false): void {
    if (immediate || !this.yawInit) {
      this.camYaw = yaw;
      this.yawInit = true;
      return;
    }
    let d = yaw - this.camYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.camYaw += d * 0.12;
  }

  get yaw(): number {
    return this.camYaw;
  }

  nudgeYaw(delta: number): void {
    this.camYaw += delta;
  }

  /**
   * Draw a frame from over the shoulder of `anchorId`. When `lookAtBall` is set the
   * camera tracks the ball; otherwise it uses the current yaw.
   */
  draw(frame: Frame, anchorId: string, lookAtBall: boolean, laneTargets: Vec[] | null, dt = 1 / 60): void {
    for (const p of frame.players) {
      const rig = this.rigFor(p.id, p.team, p.num);
      rig.group.position.set(p.pos.x, 0, p.pos.y);
      rig.group.rotation.y = -p.facing;
      // First person: you don't see yourself.
      rig.group.visible = p.id !== anchorId;
      const speed = p.speed ?? 0;
      if (rig.anim) {
        // Blend idle / walk / run by speed; stride length follows speed through timeScale.
        const wRun = Math.min(1, Math.max(0, (speed - 2.2) / 2.3));
        const wWalk = Math.min(1, Math.max(0, speed / 1.2)) * (1 - wRun);
        const wIdle = Math.max(0, 1 - wWalk - wRun);
        rig.anim.idle.setEffectiveWeight(wIdle);
        rig.anim.walk.setEffectiveWeight(wWalk);
        rig.anim.run.setEffectiveWeight(wRun);
        rig.anim.walk.setEffectiveTimeScale(Math.max(0.6, Math.min(1.6, speed / 1.6)));
        rig.anim.run.setEffectiveTimeScale(Math.max(0.7, Math.min(1.5, speed / 5)));
        rig.anim.mixer.update(dt);
      } else if (rig.proc) {
        const run = Math.min(1, speed / 4.5);
        const ph = p.stride ?? 0;
        const idle = p.idle ?? 0;
        const swing = 0.15 + 0.6 * run;
        rig.proc.hipL.rotation.z = Math.sin(ph) * swing * run;
        rig.proc.hipR.rotation.z = Math.sin(ph + Math.PI) * swing * run;
        rig.proc.armL.rotation.z = Math.sin(ph + Math.PI) * swing * 0.8 * run + 0.15;
        rig.proc.armR.rotation.z = Math.sin(ph) * swing * 0.8 * run - 0.15;
        rig.proc.torso.rotation.z = -0.22 * run + Math.sin(idle * 1.7) * 0.015;
        rig.proc.torso.position.y = 0.95 + Math.abs(Math.sin(ph)) * 0.05 * run + Math.sin(idle * 2.1) * 0.008;
        rig.sprite.position.y = 2.15 + Math.abs(Math.sin(ph)) * 0.05 * run;
      }
    }
    const anchor = frame.players.find((p) => p.id === anchorId);
    let bx = frame.ball.x;
    let bz = frame.ball.y;
    if (anchor && Math.hypot(bx - anchor.pos.x, bz - anchor.pos.y) < 0.6) {
      // Ball at your feet: a boot's length ahead in a fixed world direction, so it
      // sits at the bottom of the view when you look that way and sweeps like
      // everything else when you turn.
      const rx = -Math.sin(this.ballAnchorYaw);
      const rz = Math.cos(this.ballAnchorYaw);
      bx = anchor.pos.x + Math.cos(this.ballAnchorYaw) * 1.5 + rx * 0.3;
      bz = anchor.pos.y + Math.sin(this.ballAnchorYaw) * 1.5 + rz * 0.3;
    }
    // Roll the ball along its direction of travel.
    const pdx = bx - this.ball.position.x;
    const pdz = bz - this.ball.position.z;
    const moved = Math.hypot(pdx, pdz);
    if (moved > 1e-4 && moved < 3) {
      const axis = new THREE.Vector3(pdz, 0, -pdx).normalize();
      this.ball.rotateOnWorldAxis(axis, moved / 0.22);
    }
    this.ball.position.set(bx, 0.22 + frame.ballZ * 3.2, bz);
    this.ballShadow.position.set(bx, 0.005, bz);
    const sh = 1 - frame.ballZ * 0.6;
    this.ballShadow.scale.set(sh, sh, 1);

    if (anchor) {
      if (lookAtBall) {
        const dx = frame.ball.x - anchor.pos.x;
        const dz = frame.ball.y - anchor.pos.y;
        if (Math.hypot(dx, dz) > 0.8) this.setYaw(Math.atan2(dz, dx));
      }
      this.camPos.set(anchor.pos.x, EYE, anchor.pos.y);
      this.cubeCamera.position.lerp(this.camPos, 0.35);
    }

    this.lanes.clear();
    if (laneTargets && anchor) {
      const mat = new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, dashSize: 0.6, gapSize: 0.5 });
      for (const t of laneTargets) {
        // From directly beneath the eye, so every lane visibly comes out from under you.
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(anchor.pos.x, 0.04, anchor.pos.y),
          new THREE.Vector3(t.x, 0.04, t.y),
        ]);
        const line = new THREE.Line(geo, mat);
        line.computeLineDistances();
        this.lanes.add(line);
      }
    }

    this.cubeCamera.update(this.renderer, this.scene);
    this.panoUniforms.yaw.value = this.camYaw;
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  /** Screen position of a pitch point at a given height, in the panorama's mapping. */
  project(p: Vec, height = 1.2): Projected {
    const eye = this.cubeCamera.position;
    const dx = p.x - eye.x;
    const dy = height - eye.y;
    const dz = p.y - eye.z;
    let da = Math.atan2(dz, dx) - this.camYaw;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    const behind = Math.abs(da) > this.hfov / 2;
    const S = (this.panini + 1) / (this.panini + Math.cos(da));
    const x = S * Math.sin(da);
    const y = S * Math.tan(pitch);
    const xMax = this.paniniX(this.hfov / 2);
    const u = (x + xMax) / (2 * xMax);
    const v = (y - Math.tan(this.pMin)) / (Math.tan(this.pMax) - Math.tan(this.pMin));
    return { x: u * this.cssW, y: (1 - v) * this.cssH, onScreen: !behind && v >= 0 && v <= 1, behind };
  }
}
