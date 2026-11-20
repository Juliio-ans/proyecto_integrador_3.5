import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// PRÁCTICA 3.5. Sustituye este texto por tu número de control real.
const NUMERO_CONTROL = '24200260 . 24200';
const ESCENARIO = 38;                 // Límite de la plaza en cada eje.
const RADIO_PERSONAJE = 0.7;
const RUTA_MODELO = './assets/Soldier_png.glb';
const RUTA_HDR = './assets/cedar_bridge_sunset_2k.hdr';

const nodoEstado = document.querySelector('#estado');
const nodoAccion = document.querySelector('#accion');
const nodoChoques = document.querySelector('#choques');
const botonInicio = document.querySelector('#inicio');
const botonMusica = document.querySelector('#musica');
const audio = document.querySelector('#audio-fondo');
document.querySelector('#numcontrol').textContent = NUMERO_CONTROL;

const escena = new THREE.Scene();
escena.background = new THREE.Color(0x7796ab);
// Niebla gris clara, visible al alejarse del personaje y los objetos.
escena.fog = new THREE.Fog(0xc4cbd2, 27, 105);

const camara = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 180);
camara.position.set(10, 8.5, 34);
const render = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
render.setPixelRatio(Math.min(window.devicePixelRatio, 2));
render.setSize(innerWidth, innerHeight);
render.shadowMap.enabled = true;
render.shadowMap.type = THREE.PCFSoftShadowMap;
render.outputColorSpace = THREE.SRGBColorSpace;
render.toneMapping = THREE.ACESFilmicToneMapping;
render.toneMappingExposure = 1.45;
document.querySelector('#escena').appendChild(render.domElement);

const controles = new OrbitControls(camara, render.domElement);
controles.target.set(0, 1.5, 20);
controles.enableDamping = true;
controles.enablePan = false;
controles.minDistance = 4.5;
controles.maxDistance = 42;
controles.maxPolarAngle = Math.PI * 0.48;
controles.update();

escena.add(new THREE.HemisphereLight(0xffdfb9, 0x254a6b, 2.15));
const sol = new THREE.DirectionalLight(0xffd29a, 3.2);
sol.position.set(-24, 38, -22);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
sol.shadow.camera.left = sol.shadow.camera.bottom = -48;
sol.shadow.camera.right = sol.shadow.camera.top = 48;
sol.shadow.camera.near = 1;
sol.shadow.camera.far = 110;
sol.shadow.bias = -0.0001;
escena.add(sol);

// Ambiente auténtico HDR de 360 grados reutilizado de la práctica 3.4.
new RGBELoader().load(RUTA_HDR, textura => {
  textura.mapping = THREE.EquirectangularReflectionMapping;
  escena.background = textura;
  escena.environment = textura;
}, undefined, error => {
  console.error('No se cargó el HDR:', error);
  nodoEstado.textContent = 'No se pudo cargar el HDR; comprueba la carpeta assets.';
});

const mate = (color, roughness = 0.78, metalness = 0.06) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

// Textura creada en Canvas, sin usar ningún JPG ni descargar recursos externos.
const lienzo = document.createElement('canvas');
lienzo.width = lienzo.height = 512;
const ctx = lienzo.getContext('2d');
ctx.fillStyle = '#777c83';
ctx.fillRect(0, 0, 512, 512);
for (let y = 0; y < 8; y++) {
  for (let x = 0; x < 8; x++) {
    const px = x * 64 + (y % 2) * 32;
    const py = y * 64;
    const brillo = ((x * 23 + y * 13) % 24);
    ctx.fillStyle = `rgb(${119 + brillo}, ${123 + brillo}, ${129 + brillo})`;
    ctx.fillRect(px + 2, py + 2, 60, 60);
  }
}
// Grano de la piedra, reproducible en todas las computadoras.
for (let i = 0; i < 4900; i++) {
  const x = (i * 167) % 512, y = (i * 311) % 512;
  ctx.fillStyle = i % 3 === 0 ? '#f7f6ed21' : '#16243716';
  ctx.fillRect(x, y, 2, 2);
}
const texturaPiso = new THREE.CanvasTexture(lienzo);
texturaPiso.colorSpace = THREE.SRGBColorSpace;
texturaPiso.wrapS = texturaPiso.wrapT = THREE.RepeatWrapping;
texturaPiso.repeat.set(9, 9);
texturaPiso.anisotropy = render.capabilities.getMaxAnisotropy();
const piso = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ map:texturaPiso, roughness:.94, metalness:0 })
);
piso.rotation.x = -Math.PI / 2;
piso.receiveShadow = true;
escena.add(piso);

const base = new THREE.Mesh(new THREE.BoxGeometry(80.5, 1.7, 80.5), mate(0x273747, 0.72));
base.position.y = -0.9;
base.receiveShadow = true;
escena.add(base);

const trazo = new THREE.Mesh(new THREE.PlaneGeometry(12, 78), mate(0x454e5b, .92));
trazo.rotation.x = -Math.PI / 2;
trazo.position.y = .012;
trazo.receiveShadow = true;
escena.add(trazo);
for (let z = -34; z <= 34; z += 8) {
  const marca = new THREE.Mesh(new THREE.PlaneGeometry(.18, 3.6), mate(0xe4d6b7, .94));
  marca.rotation.x = -Math.PI / 2;
  marca.position.set(0, .02, z);
  escena.add(marca);
}

const obstaculos = []; // Cuerpos estáticos con colisión real (AABB).
const esferas = [];    // Cuerpos dinámicos que rebotan y pueden patearse.

function cubo(x, z, ancho, profundidad, alto, color) {
  const grupo = new THREE.Group();
  grupo.position.set(x, 0, z);
  const caja = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, profundidad), mate(color, .75, .15));
  caja.position.y = alto / 2;
  caja.castShadow = caja.receiveShadow = true;
  grupo.add(caja);
  const canto = new THREE.Mesh(new THREE.BoxGeometry(ancho + .07, .12, profundidad + .07), mate(0xf3c68a));
  canto.position.y = alto - .06;
  canto.castShadow = true;
  grupo.add(canto);
  escena.add(grupo);
  obstaculos.push({x, z, mitadX:ancho / 2, mitadZ:profundidad / 2});
}

// Cuatro cajones y dos bancos: se pueden rodear, pero no atravesar.
cubo(-13, -12, 3.5, 3.5, 2, 0x72573d);
cubo(13, -10, 3.5, 3.5, 2, 0x786045);
cubo(-13, 13, 3.5, 3.5, 2, 0x72573d);
cubo(14, 13, 3.5, 3.5, 2, 0x786045);

function banco(x, z) {
  const grupo = new THREE.Group();
  grupo.position.set(x, 0, z);
  const tablas = [
    {y:.9, z:0, ancho:2.8, alto:.18, profundo:1},
    {y:1.5, z:-.43, ancho:2.8, alto:.9, profundo:.16}
  ];
  for (const tabla of tablas) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(tabla.ancho, tabla.alto, tabla.profundo), mate(0xb88252));
    mesh.position.set(0, tabla.y, tabla.z);
    mesh.castShadow = mesh.receiveShadow = true;
    grupo.add(mesh);
  }
  for (const signo of [-1, 1]) {
    const pata = new THREE.Mesh(new THREE.BoxGeometry(.18, .85, .7), mate(0x253b4a, .43, .45));
    pata.position.set(signo * 1.03, .43, 0);
    grupo.add(pata);
  }
  escena.add(grupo);
  obstaculos.push({x, z, mitadX:1.5, mitadZ:.8});
}
banco(-23, -3);
banco(23, 5);

function farola(x, z) {
  const columna = new THREE.Mesh(new THREE.CylinderGeometry(.12, .2, 7.2, 10), mate(0x28343e, .32, .7));
  columna.position.set(x, 3.6, z);
  columna.castShadow = true;
  escena.add(columna);
  const bombilla = new THREE.Mesh(new THREE.SphereGeometry(.37, 16, 12),
    new THREE.MeshStandardMaterial({color:0xffd79b, emissive:0xffca81, emissiveIntensity:2.1}));
  bombilla.position.set(x, 7.25, z);
  escena.add(bombilla);
  const iluminacion = new THREE.PointLight(0xffce96, 42, 20, 1.7);
  iluminacion.position.set(x, 6.9, z);
  escena.add(iluminacion);
  obstaculos.push({x, z, mitadX:.23, mitadZ:.23});
}
farola(-32, -27);
farola(32, -27);
farola(-32, 27);
farola(32, 27);

// Barandas laterales: decoración y fronteras visibles de la zona jugable.
for (const x of [-39.2, 39.2]) {
  const pared = new THREE.Mesh(new THREE.BoxGeometry(.65, 1.2, 80), mate(0x304c64, .65, .2));
  pared.position.set(x, .6, 0);
  pared.castShadow = pared.receiveShadow = true;
  escena.add(pared);
}
for (const z of [-39.2, 39.2]) {
  const pared = new THREE.Mesh(new THREE.BoxGeometry(80, 1.2, .65), mate(0x304c64, .65, .2));
  pared.position.set(0, .6, z);
  pared.castShadow = pared.receiveShadow = true;
  escena.add(pared);
}

function agregarPelota(x, z, color, indice) {
  const radio = .67;
  const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(radio, 22, 14), mate(color, .35, .1));
  cuerpo.position.set(x, radio, z);
  cuerpo.castShadow = cuerpo.receiveShadow = true;
  // Aros contrastantes que permiten ver que la pelota realmente gira.
  const aro = new THREE.Mesh(new THREE.TorusGeometry(.5, .055, 8, 32), mate(0xffffff));
  aro.rotation.x = .7;
  cuerpo.add(aro);
  escena.add(cuerpo);
  esferas.push({mesh:cuerpo, r:radio, velocidad:new THREE.Vector2((indice % 2 ? -1 : 1) * .35, (indice % 3 - 1) * .4)});
}
[
  [-4, -21, 0xd29a59], [9, -19, 0x54b3d6], [-9, -2, 0xf0a4a4],
  [7, 6, 0xeab95a], [-3, 8, 0x91c9aa], [18, 23, 0xb8a0e9], [-20, 19, 0xe29b68]
].forEach((dato, i) => agregarPelota(...dato, i));

const personaje = new THREE.Group();
personaje.position.set(0, 0, 20);
escena.add(personaje);
let mezclador, acciones = {}, accionActual = null, modo = 'caminar';
let listo = false, activo = false, choques = 0, ultimoChoque = -5;
let anguloDestino = 0;
const teclas = new Set();
const reloj = new THREE.Clock();

function marcarChoque() {
  const tiempo = reloj.getElapsedTime();
  if (tiempo - ultimoChoque > .4) {
    choques++;
    nodoChoques.textContent = String(choques);
    ultimoChoque = tiempo;
  }
}

function tocaCaja(x, z, radio) {
  return obstaculos.some(ob => {
    const cx = THREE.MathUtils.clamp(x, ob.x - ob.mitadX, ob.x + ob.mitadX);
    const cz = THREE.MathUtils.clamp(z, ob.z - ob.mitadZ, ob.z + ob.mitadZ);
    return (x - cx) ** 2 + (z - cz) ** 2 < radio ** 2;
  });
}

function puedePasar(x, z) {
  if (Math.abs(x) > ESCENARIO - RADIO_PERSONAJE || Math.abs(z) > ESCENARIO - RADIO_PERSONAJE) return false;
  return !tocaCaja(x, z, RADIO_PERSONAJE);
}

// La tercera secuencia mueve el brazo del personaje humano para saludar.
// Se parte de la animación Idle original: no se reemplaza por un maniquí.
function crearSaludo(idle) {
  const tracks = idle.tracks.filter(t => !/RightArm\.quaternion|RightForeArm\.quaternion/.test(t.name)).map(t => t.clone());
  const tiempos = [0, .28, .62, 1.08, 1.36, 1.67, 2.16, 2.48];
  for (const bone of ['RightArm', 'RightForeArm']) {
    const fuente = idle.tracks.find(t => t.name.includes(bone) && t.name.endsWith('.quaternion'));
    if (!fuente) continue;
    const inicial = new THREE.Quaternion().fromArray(fuente.values, 0);
    const offsets = bone === 'RightArm'
      ? [0, .65, 1.15, 1.15, 1.15, 1.15, .5, 0]
      : [0, -.48, -1.25, -.72, -1.3, -.75, -.3, 0];
    const muestras = [];
    offsets.forEach((valor, i) => {
      const desplazamiento = bone === 'RightArm'
        ? new THREE.Quaternion().setFromEuler(new THREE.Euler(-valor, 0, -valor * .4))
        : new THREE.Quaternion().setFromEuler(new THREE.Euler(0, valor, -valor * .3));
      const resultado = inicial.clone().multiply(desplazamiento);
      muestras.push(resultado.x, resultado.y, resultado.z, resultado.w);
    });
    tracks.push(new THREE.QuaternionKeyframeTrack(fuente.name, tiempos, muestras));
  }
  return new THREE.AnimationClip('Saludar', 2.48, tracks);
}

// Solo se reproduce Walk/Run mientras haya movimiento real por teclado.
// Si se sueltan las teclas, se reproduce la animación Idle del modelo.
function hayTeclasMovimiento() {
  return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
    .some(tecla => teclas.has(tecla));
}

function actualizarAnimacion() {
  if (!mezclador) return;
  const tipo = !activo ? 'quieto' : modo === 'saludar' ? 'saludar' : hayTeclasMovimiento() ? modo : 'quieto';
  const siguiente = acciones[tipo];
  if (!siguiente) return;
  if (accionActual === siguiente) return;
  if (accionActual) accionActual.fadeOut(.22);
  siguiente.reset().fadeIn(.22).play();
  accionActual = siguiente;
  nodoAccion.textContent = ({quieto:'Quieto', caminar:'Caminar', correr:'Correr', saludar:'Saludar'})[tipo];
}

function cambiarAccion(nuevoModo) {
  if (!acciones[nuevoModo]) return;
  modo = nuevoModo;
  actualizarAnimacion();
}

new GLTFLoader().load(RUTA_MODELO, gltf => {
  const humano = gltf.scene;
  humano.traverse(obj => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  humano.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(humano);
  const escala = 2.7 / Math.max(.01, caja.getSize(new THREE.Vector3()).y);
  humano.scale.setScalar(escala);
  humano.updateMatrixWorld(true);
  const calculada = new THREE.Box3().setFromObject(humano);
  const centro = calculada.getCenter(new THREE.Vector3());
  humano.position.x -= centro.x;
  humano.position.z -= centro.z;
  humano.position.y -= calculada.min.y;
  // Conservamos la orientación frontal original del modelo (hacia -Z).
  // Girarlo 180 grados haría que el personaje caminara de espaldas.
  personaje.add(humano);

  mezclador = new THREE.AnimationMixer(humano);
  const encontrar = nombre => gltf.animations.find(c => c.name.toLowerCase() === nombre.toLowerCase());
  const walk = encontrar('Walk');
  const run = encontrar('Run');
  const idle = encontrar('Idle');
  if (!walk || !run || !idle) {
    nodoEstado.textContent = 'El modelo no incluye las animaciones necesarias.';
    return;
  }
  acciones = {
    quieto:mezclador.clipAction(idle),
    caminar:mezclador.clipAction(walk),
    correr:mezclador.clipAction(run),
    saludar:mezclador.clipAction(crearSaludo(idle))
  };
  acciones.caminar.setEffectiveTimeScale(1.1);
  acciones.correr.setEffectiveTimeScale(1.15);
  cambiarAccion('caminar');
  listo = true;
  botonInicio.disabled = false;
  nodoEstado.textContent = '¡Listo! Pulsa Espacio o Iniciar.';
}, progreso => {
  if (progreso.total) nodoEstado.textContent = `Cargando personaje ${Math.round(progreso.loaded / progreso.total * 100)} %`;
}, error => {
  console.error('Error al cargar el modelo humano:', error);
  nodoEstado.textContent = 'No se abrió Soldier_png.glb. Ejecuta un servidor local.';
});

function iniciarDetener() {
  if (!listo) return;
  activo = !activo;
  botonInicio.textContent = activo ? 'Ⅱ Detener' : '▶ Iniciar';
  nodoEstado.textContent = activo ? 'Listo · pulsa W A S D para desplazarte' : 'Detenido · pulsa Espacio para continuar';
  actualizarAnimacion();
}
botonInicio.disabled = true;
botonInicio.addEventListener('click', iniciarDetener);

document.addEventListener('keydown', evento => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(evento.code)) evento.preventDefault();
  if (evento.repeat && ['KeyQ','KeyE','Space'].includes(evento.code)) return;
  teclas.add(evento.code);
  if (evento.code === 'Space') iniciarDetener();
  if (evento.code === 'Digit1') cambiarAccion('caminar');
  if (evento.code === 'Digit2') cambiarAccion('correr');
  if (evento.code === 'Digit3') cambiarAccion('saludar');
  if (evento.code === 'KeyQ') anguloDestino += Math.PI / 2;
  if (evento.code === 'KeyE') anguloDestino -= Math.PI / 2;
});
document.addEventListener('keyup', evento => teclas.delete(evento.code));
window.addEventListener('blur', () => teclas.clear());

document.querySelector('#centrar').addEventListener('click', () => {
  const {x,z} = personaje.position;
  camara.position.set(x + 10, 8.5, z + 14);
  controles.target.set(x, 1.5, z);
  controles.update();
});

botonMusica.addEventListener('click', async () => {
  if (audio.paused) {
    try {
      audio.volume = .44;
      await audio.play();
      botonMusica.textContent = '♫ Pausar música';
    } catch (error) {
      nodoEstado.textContent = 'No se pudo abrir el MP3; revisa assets/musica.mp3.';
      console.error(error);
    }
  } else {
    audio.pause();
    botonMusica.textContent = '♫ Música';
  }
});

const paso = new THREE.Vector3();
const vec2 = new THREE.Vector2();
function moverJugador(dt) {
  const diferencia = Math.atan2(Math.sin(anguloDestino - personaje.rotation.y), Math.cos(anguloDestino - personaje.rotation.y));
  personaje.rotation.y += diferencia * Math.min(1, dt * 8);
  if (!activo || modo === 'saludar') return;
  const derecha = (teclas.has('KeyD') || teclas.has('ArrowRight') ? 1 : 0) -
                   (teclas.has('KeyA') || teclas.has('ArrowLeft') ? 1 : 0);
  const adelante = (teclas.has('KeyW') || teclas.has('ArrowUp') ? 1 : 0) -
                    (teclas.has('KeyS') || teclas.has('ArrowDown') ? 1 : 0);
  if (!derecha && !adelante) return;
  // Three.js considera -Z como adelante. Así W avanza, S retrocede,
  // A se desplaza a la izquierda y D a la derecha respecto al personaje.
  paso.set(derecha, 0, -adelante).normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, personaje.rotation.y);
  const velocidad = modo === 'correr' ? 8 : 4.2;
  const dx = paso.x * velocidad * dt;
  const dz = paso.z * velocidad * dt;
  if (puedePasar(personaje.position.x + dx, personaje.position.z)) personaje.position.x += dx;
  else marcarChoque();
  if (puedePasar(personaje.position.x, personaje.position.z + dz)) personaje.position.z += dz;
  else marcarChoque();
  // El jugador transfiere impulso a las pelotas y estas continúan por inercia.
  for (const pelota of esferas) {
    vec2.set(pelota.mesh.position.x - personaje.position.x, pelota.mesh.position.z - personaje.position.z);
    if (vec2.length() < pelota.r + RADIO_PERSONAJE) {
      if (vec2.lengthSq() < .0001) vec2.set(1, 0);
      vec2.normalize();
      pelota.velocidad.addScaledVector(vec2, velocidad * 1.15);
      marcarChoque();
    }
  }
}

function actualizarFisica(dt) {
  for (const pelota of esferas) {
    const pos = pelota.mesh.position;
    const anteriorX = pos.x, anteriorZ = pos.z;
    pos.x += pelota.velocidad.x * dt;
    pos.z += pelota.velocidad.y * dt;
    if (Math.abs(pos.x) > ESCENARIO - pelota.r) {
      pos.x = THREE.MathUtils.clamp(pos.x, -ESCENARIO + pelota.r, ESCENARIO - pelota.r);
      pelota.velocidad.x *= -.78;
    }
    if (Math.abs(pos.z) > ESCENARIO - pelota.r) {
      pos.z = THREE.MathUtils.clamp(pos.z, -ESCENARIO + pelota.r, ESCENARIO - pelota.r);
      pelota.velocidad.y *= -.78;
    }
    if (tocaCaja(pos.x, pos.z, pelota.r)) {
      if (!tocaCaja(anteriorX, pos.z, pelota.r)) {
        pos.x = anteriorX;
        pelota.velocidad.x *= -.7;
      } else if (!tocaCaja(pos.x, anteriorZ, pelota.r)) {
        pos.z = anteriorZ;
        pelota.velocidad.y *= -.7;
      } else {
        pos.x = anteriorX; pos.z = anteriorZ;
        pelota.velocidad.multiplyScalar(-.55);
      }
    }
    // Fricción lineal, rebote y rotación visible de cada objeto físico.
    pelota.velocidad.multiplyScalar(Math.exp(-1.2 * dt));
    pelota.mesh.rotation.x += pelota.velocidad.y * dt / pelota.r;
    pelota.mesh.rotation.z -= pelota.velocidad.x * dt / pelota.r;
  }
  // Choque entre esferas: se separan y se intercambia parte del impulso.
  for (let i = 0; i < esferas.length; i++) {
    for (let j = i + 1; j < esferas.length; j++) {
      const a = esferas[i], b = esferas[j];
      const diferencia = new THREE.Vector2(b.mesh.position.x - a.mesh.position.x, b.mesh.position.z - a.mesh.position.z);
      const dist = diferencia.length();
      if (dist > 0.0001 && dist < a.r + b.r) {
        const normal = diferencia.multiplyScalar(1 / dist);
        const penetracion = (a.r + b.r - dist) / 2;
        a.mesh.position.x -= normal.x * penetracion;
        a.mesh.position.z -= normal.y * penetracion;
        b.mesh.position.x += normal.x * penetracion;
        b.mesh.position.z += normal.y * penetracion;
        const relativo = b.velocidad.clone().sub(a.velocidad).dot(normal);
        if (relativo < 0) {
          const impulso = -(1 + .75) * relativo / 2;
          a.velocidad.addScaledVector(normal, -impulso);
          b.velocidad.addScaledVector(normal, impulso);
        }
      }
    }
  }
}

function ciclo() {
  requestAnimationFrame(ciclo);
  const dt = Math.min(reloj.getDelta(), .04);
  actualizarAnimacion();
  moverJugador(dt);
  actualizarFisica(dt);
  // Idle sigue reproduciéndose suavemente aunque el jugador esté detenido.
  if (mezclador) mezclador.update(dt);
  const nuevoCentro = new THREE.Vector3(personaje.position.x, 1.45, personaje.position.z);
  const avance = nuevoCentro.sub(controles.target).multiplyScalar(Math.min(1, dt * 3.5));
  camara.position.add(avance);
  controles.target.add(avance);
  controles.update();
  render.render(escena, camara);
}
ciclo();

window.addEventListener('resize', () => {
  camara.aspect = innerWidth / innerHeight;
  camara.updateProjectionMatrix();
  render.setSize(innerWidth, innerHeight);
});
