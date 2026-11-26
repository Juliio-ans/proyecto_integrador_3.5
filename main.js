import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// PRÁCTICA 3.7: Continuación en primera persona de Centinela del puente (3.4 y 3.5).
const TOTAL_BALIZAS = 5;
const LIMITE = 16.6; // Frontera invisible para impedir que el jugador salga.
const RADIO_JUGADOR = .62;
// En los Meta Quest, empujar el stick hacia adelante da eje Y negativo.
// Por eso invertimos solo Y; el eje X positivo sigue desplazando a la derecha.
// Si un visor invierte laterales, cambia FACTOR_LATERAL_VR de 1 a -1.
const FACTOR_AVANCE_VR = -1;
const FACTOR_LATERAL_VR = 1;
const GRAVEDAD = 18;
const IMPULSO_SALTO = 5.3; // Salto moderado, especialmente en VR.

const MODELO = 'assets/Soldier_png.glb';
const HDR = 'assets/cedar_bridge_sunset_2k.hdr';

const mensaje = document.querySelector('#estado');
const marcador = document.querySelector('#puntos');
const marcadorChoques = document.querySelector('#choques');
const botonMusica = document.querySelector('#musica');
const audio = document.querySelector('#audio-fondo');
const campana = document.querySelector('#audio-chime');
const portada = document.querySelector('#portada');

const escena = new THREE.Scene();
escena.background = new THREE.Color(0x7796ab); // Color provisional hasta cargar el HDR.
escena.fog = new THREE.Fog(0xc4cbd2, 27, 105); // Niebla gris clara, como en la práctica 3.5.

// Primera persona: la cámara representa los ojos de nuestro personaje.
const jugador = new THREE.Group();
jugador.position.set(0, 0, 14);
escena.add(jugador);
const camara = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .08, 140);
camara.position.set(0, 1.65, 0);
camara.rotation.x = -.035;
jugador.add(camara);

const render = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
render.setSize(innerWidth, innerHeight);
render.setPixelRatio(Math.min(devicePixelRatio, 1.7));
render.outputColorSpace = THREE.SRGBColorSpace;
render.toneMapping = THREE.ACESFilmicToneMapping;
render.toneMappingExposure = 1.4;
render.shadowMap.enabled = true;
render.shadowMap.type = THREE.PCFSoftShadowMap;
render.xr.enabled = true;
render.xr.setReferenceSpaceType('local-floor');
document.querySelector('#escena').appendChild(render.domElement);

const entrarVR = VRButton.createButton(render);
entrarVR.style.bottom = '120px';
entrarVR.style.zIndex = '20';
document.body.appendChild(entrarVR);

// Mismo escenario HDR del puente al atardecer utilizado en 3.4 y 3.5.
// Se usa como fondo VISIBLE y como iluminación ambiental para conservar la continuidad.
// La cúpula estrellada y la luna anteriores tapaban el HDR y se retiraron.
new RGBELoader().load(HDR, hdr => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  escena.background = hdr;
  escena.environment = hdr;
  console.log('Fondo HDR del puente cargado correctamente');
}, undefined, error => {
  console.error('No se pudo cargar el HDR del puente:', error);
  mensaje.textContent = 'No se pudo cargar el fondo HDR; revisa assets/cedar_bridge_sunset_2k.hdr';
});

// Iluminación cálida acorde con el HDR de atardecer de la práctica 3.5.
escena.add(new THREE.HemisphereLight(0xffdfb9, 0x254a6b, 2.15));
const luzAtardecer = new THREE.DirectionalLight(0xffd29a, 3.2);
luzAtardecer.position.set(-24, 38, -22);
luzAtardecer.castShadow = true;
luzAtardecer.shadow.mapSize.set(1024, 1024);
luzAtardecer.shadow.camera.left = luzAtardecer.shadow.camera.bottom = -26;
luzAtardecer.shadow.camera.right = luzAtardecer.shadow.camera.top = 26;
luzAtardecer.shadow.camera.far = 110;
escena.add(luzAtardecer);

const mate = (color, rugosidad=.8, metal=.08) => new THREE.MeshStandardMaterial({color,roughness:rugosidad,metalness:metal});

// Piso con textura: pasto oscuro, piedras y un camino de plaza urbana.
function texturaSuelo(colorFondo, verde) {
  const c=document.createElement('canvas');
  c.width=c.height=512;
  const x=c.getContext('2d');
  x.fillStyle=colorFondo;
  x.fillRect(0,0,512,512);
  for(let i=0;i<6500;i++) {
    const px=(i*127)%512,py=(i*293)%512;
    x.fillStyle=verde ? (i%3===0 ? '#71936528' : '#172c211a') : (i%4===0 ? '#e8d9b027' : '#182c3a25');
    x.fillRect(px,py,(i%4)+1,(i%5)+2);
  }
  const t=new THREE.CanvasTexture(c);
  t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(7,7);
  return t;
}
const pasto = texturaSuelo('#2b4b32',true);
const adoquin = texturaSuelo('#68717b',false);
const suelo = new THREE.Mesh(new THREE.PlaneGeometry(40,40),
  new THREE.MeshStandardMaterial({map:pasto,roughness:1}));
suelo.rotation.x=-Math.PI/2;
suelo.receiveShadow=true;
escena.add(suelo);
const sendero = new THREE.Mesh(new THREE.PlaneGeometry(8,38),
  new THREE.MeshStandardMaterial({map:adoquin,roughness:.91}));
sendero.rotation.x=-Math.PI/2;
sendero.position.y=.012;
sendero.receiveShadow=true;
escena.add(sendero);
for(let z=-15;z<=15;z+=6) {
  const linea=new THREE.Mesh(new THREE.PlaneGeometry(.14,2.7),mate(0xdfd0b2));
  linea.rotation.x=-Math.PI/2;
  linea.position.set(0,.025,z);
  escena.add(linea);
}

// Obstáculos sólidos retomados de 3.5. Usan colisión circular contra cajas.
const obstaculos=[];
function agregarCaja(x,z,ancho=2.4,profundo=2.4,alto=1.6) {
  const grupo=new THREE.Group(); grupo.position.set(x,0,z);
  const caja=new THREE.Mesh(new THREE.BoxGeometry(ancho,alto,profundo),mate(0x6b5541,.85));
  caja.position.y=alto/2;
  caja.castShadow=caja.receiveShadow=true;
  grupo.add(caja);
  const borde=new THREE.Mesh(new THREE.BoxGeometry(ancho+.07,.1,profundo+.07),mate(0xb89a68));
  borde.position.y=alto-.05; grupo.add(borde);
  escena.add(grupo);
  obstaculos.push({x,z,mx:ancho/2,mz:profundo/2});
}
agregarCaja(-7,9);
agregarCaja(8,9);
agregarCaja(-7,-2);
agregarCaja(8,-3);
agregarCaja(-8,-14);
agregarCaja(9,-14);

function posteLuz(x,z) {
  const poste=new THREE.Mesh(new THREE.CylinderGeometry(.1,.16,6.6,8),mate(0x2d3d50,.4,.6));
  poste.position.set(x,3.3,z);poste.castShadow=true;escena.add(poste);
  const faro=new THREE.Mesh(new THREE.SphereGeometry(.32,12,10),
    new THREE.MeshStandardMaterial({color:0xffd696,emissive:0xffc176,emissiveIntensity:2.5}));
  faro.position.set(x,6.65,z);escena.add(faro);
  const luz=new THREE.PointLight(0xffcd93,28,16,1.7);
  luz.position.set(x,6.5,z);escena.add(luz);
  obstaculos.push({x,z,mx:.23,mz:.23});
}
for(const [x,z] of [[-14,12],[14,12],[-14,-11],[14,-11]]) posteLuz(x,z);

// Muros visibles del puente + límite invisible de la navegación.
for(const x of [-17.1,17.1]) {
  const muro=new THREE.Mesh(new THREE.BoxGeometry(.7,1.45,36),mate(0x35506a,.6,.2));
  muro.position.set(x,.72,0);muro.castShadow=true;escena.add(muro);
}
for(const z of [-17.1,17.1]) {
  const muro=new THREE.Mesh(new THREE.BoxGeometry(35,1.45,.7),mate(0x35506a,.6,.2));
  muro.position.set(0,.72,z);muro.castShadow=true;escena.add(muro);
}

const pelotas=[];
function nuevaPelota(x,z,color,n) {
  const radio=.6;
  const m=new THREE.Mesh(new THREE.SphereGeometry(radio,20,14),mate(color,.4,.15));
  m.position.set(x,radio,z);m.castShadow=true;escena.add(m);
  const raya=new THREE.Mesh(new THREE.TorusGeometry(.42,.05,6,24),mate(0xffefc1));
  raya.rotation.x=.75;m.add(raya);
  pelotas.push({m,radio,v:new THREE.Vector2(n%2 ? -.35 : .4, (n%3-1)*.35)});
}
[
  [-2,10,0x64b9e2],[4,6,0xd3aa57],[-3,-5,0xd17a7a],
  [5,-7,0xa7d19b],[-2,-13,0x998cda],[3,-14,0xe6a36d]
].forEach((val,n)=>nuevaPelota(...val,n));

const balizas=[];
const seleccionables=[];
function nuevaBaliza(x,z,indice) {
  const grupo=new THREE.Group(); grupo.position.set(x,0,z);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.48,.61,.36,12),mate(0x303f55,.45,.45));
  base.position.y=.18;grupo.add(base);
  const brillo=new THREE.MeshStandardMaterial({color:0x8bddff,emissive:0x49adff,emissiveIntensity:1.7,roughness:.2,metalness:.3});
  const orb=new THREE.Mesh(new THREE.IcosahedronGeometry(.45,2),brillo);
  orb.position.y=1.18;orb.castShadow=true;grupo.add(orb);
  const aro=new THREE.Mesh(new THREE.TorusGeometry(.75,.055,8,36),mate(0xe2d6a2,.45,.3));
  aro.position.y=1.18;aro.rotation.x=.55;grupo.add(aro);
  const luz=new THREE.PointLight(0x5bb8ff,7,5,1.8);
  luz.position.y=1.18;grupo.add(luz);
  escena.add(grupo);
  const objeto={x,z,grupo,orb,aro,brillo,luz,indice,activa:false};
  orb.userData.baliza=objeto;
  seleccionables.push(orb);
  balizas.push(objeto);
}
[
  [-5.4,4.5],[5.2,2.5],[-12,-9],[11,-9.5],[0,-15]
].forEach((datos,i)=>nuevaBaliza(...datos,i));

// Personaje humano de 3.5 reutilizado como guardia animado que patrulla el puente.
let mezcladorGuardia=null, guardia=null;
new GLTFLoader().load(MODELO,gltf=>{
  guardia=gltf.scene;
  guardia.traverse(p=>{if(p.isMesh){p.castShadow=true;p.receiveShadow=true;}});
  guardia.updateMatrixWorld(true);
  const caja=new THREE.Box3().setFromObject(guardia);
  const altura=caja.getSize(new THREE.Vector3()).y;
  guardia.scale.setScalar(2.45/Math.max(.01,altura));
  guardia.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(guardia);
  const centro=b.getCenter(new THREE.Vector3());
  guardia.position.set(6-centro.x,-b.min.y,-12-centro.z);
  escena.add(guardia);
  const clip=gltf.animations.find(a=>a.name==='Walk') ?? gltf.animations[0];
  mezcladorGuardia=new THREE.AnimationMixer(guardia);
  if(clip) mezcladorGuardia.clipAction(clip).play();
},undefined,error=>console.warn('No se pudo abrir el guardia GLB:',error));

// Colisiones del personaje con cajas, postes y fronteras invisibles.
function golpeaObstaculo(x,z,radio=RADIO_JUGADOR) {
  if(Math.abs(x)>LIMITE-radio || Math.abs(z)>LIMITE-radio) return true;
  for(const b of obstaculos) {
    const cx=THREE.MathUtils.clamp(x,b.x-b.mx,b.x+b.mx);
    const cz=THREE.MathUtils.clamp(z,b.z-b.mz,b.z+b.mz);
    if((x-cx)**2+(z-cz)**2<radio**2) return true;
  }
  return false;
}

let iniciado=false, choques=0, ultimoChoque=-5, sonidoCtx=null;
let velocidadVertical=0, saltando=false;
const saltoBotonVR = new WeakMap(); // Evita repetir el salto al mantener A o X.
function saltar() {
  if (!iniciado || saltando) return;
  saltando = true;
  velocidadVertical = IMPULSO_SALTO;
}
function actualizarSalto(dt) {
  if (!saltando) return;
  velocidadVertical -= GRAVEDAD * dt;
  jugador.position.y += velocidadVertical * dt;
  if (jugador.position.y <= 0) {
    jugador.position.y = 0;
    velocidadVertical = 0;
    saltando = false;
  }
}

const reloj=new THREE.Clock();
const teclas=new Set();

function contextoAudio() {
  const Audio=window.AudioContext || window.webkitAudioContext;
  if(!Audio) return null;
  if(!sonidoCtx) sonidoCtx=new Audio();
  if(sonidoCtx.state==='suspended') sonidoCtx.resume().catch(()=>{});
  return sonidoCtx;
}

function sonido(frecuencia=740,duracion=.17) {
  const ctx=contextoAudio();
  if(!ctx || ctx.state!=='running') return;
  const oscilador=ctx.createOscillator();
  const volumen=ctx.createGain();
  oscilador.type='sine';
  oscilador.frequency.setValueAtTime(frecuencia,ctx.currentTime);
  oscilador.frequency.exponentialRampToValueAtTime(Math.max(80,frecuencia/2),ctx.currentTime+duracion);
  volumen.gain.setValueAtTime(.075,ctx.currentTime);
  volumen.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duracion);
  oscilador.connect(volumen);volumen.connect(ctx.destination);
  oscilador.start();oscilador.stop(ctx.currentTime+duracion);
}

function chocar() {
  const ahora=reloj.elapsedTime;
  if(ahora-ultimoChoque<.48) return;
  ultimoChoque=ahora;
  marcadorChoques.textContent=String(++choques);
  sonido(180,.11);
}

function mover(dx,dz) {
  if(dx) {
    if(!golpeaObstaculo(jugador.position.x+dx,jugador.position.z)) jugador.position.x+=dx;
    else chocar();
  }
  if(dz) {
    if(!golpeaObstaculo(jugador.position.x,jugador.position.z+dz)) jugador.position.z+=dz;
    else chocar();
  }
  for(const p of pelotas) {
    const dist=new THREE.Vector2(p.m.position.x-jugador.position.x,p.m.position.z-jugador.position.z);
    if(dist.length()<p.radio+RADIO_JUGADOR) {
      if(dist.lengthSq()<.001) dist.set(1,0);
      p.v.addScaledVector(dist.normalize(),4.8);
      chocar();
    }
  }
}

function activarBaliza(b) {
  if(!b || b.activa) return;
  b.activa=true;
  b.brillo.color.setHex(0x8effad);
  b.brillo.emissive.setHex(0x2fff94);
  b.luz.color.setHex(0x7fffb1);
  campana.currentTime=0;
  campana.volume=.6;
  campana.play().catch(()=>sonido(980+b.indice*90,.25));
  const total=balizas.filter(x=>x.activa).length;
  marcador.textContent=`${total} / ${TOTAL_BALIZAS}`;
  mensaje.textContent=total===TOTAL_BALIZAS ? '¡Ronda completada! Encendiste las cinco balizas.' : `Baliza ${total} activada. Busca la siguiente.`;
}

const rayo=new THREE.Raycaster();
const pantalla=new THREE.Vector2();
function objetivo() {
  const impacto=rayo.intersectObjects(seleccionables,false)[0];
  return impacto?.object.userData.baliza ?? null;
}
function desdePantalla(x=0,y=0) {
  camara.updateMatrixWorld(true);
  pantalla.set(x,y);
  rayo.setFromCamera(pantalla,camara);
  rayo.far=18;
  return objetivo();
}
function desdeControl(control) {
  control.updateMatrixWorld(true);
  rayo.ray.origin.setFromMatrixPosition(control.matrixWorld);
  rayo.ray.direction.set(0,0,-1).transformDirection(control.matrixWorld);
  rayo.far=16;
  return objetivo();
}

// Ambos controles Meta Quest lanzan rayos y responden al gatillo selectstart.
for(let i=0;i<2;i++) {
  const control=render.xr.getController(i);
  control.addEventListener('selectstart',()=>{contextoAudio();activarBaliza(desdeControl(control));});
  const linea=new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,-14)
  ]),new THREE.LineBasicMaterial({color:0x8adaff,transparent:true,opacity:.6}));
  control.add(linea);
  jugador.add(control);
  // Representación sencilla de cada mando en VR, sin descargar modelos externos.
  const grip=render.xr.getControllerGrip(i);
  const mango=new THREE.Mesh(new THREE.CylinderGeometry(.035,.043,.18,10),mate(i===0 ? 0x90c9ee : 0xcab5ee,.35,.3));
  mango.rotation.x=Math.PI/2;
  mango.position.z=-.07;
  grip.add(mango);
  const boton=new THREE.Mesh(new THREE.SphereGeometry(.05,10,8),mate(0x263c52));
  boton.position.set(0,.035,-.11);
  grip.add(boton);
  jugador.add(grip);
}

// Selección manteniendo la mirada fija 2 segundos: alternativa sin gatillo.
let observada=null, tiempoMirada=0;
function mirarBalizas(dt) {
  if(!iniciado) return;
  let b;
  if(render.xr.isPresenting) {
    const xrCam=render.xr.getCamera(camara);
    const ojo=xrCam.cameras?.[0] ?? xrCam;
    ojo.updateMatrixWorld(true);
    rayo.ray.origin.setFromMatrixPosition(ojo.matrixWorld);
    rayo.ray.direction.set(0,0,-1).transformDirection(ojo.matrixWorld);
    rayo.far=18;
    b=objetivo();
  } else b=desdePantalla();
  if(b!==observada) {observada=b;tiempoMirada=0;}
  else if(b && !b.activa) {
    tiempoMirada+=dt;
    if(tiempoMirada>=2) {activarBaliza(b);tiempoMirada=0;}
  }
}

// En PC se captura el cursor al pulsar Comenzar recorrido.
// Una vez capturado, mover el ratón gira la cámara SIN mantener presionado el clic.
// Escape libera el ratón de manera normal (Pointer Lock API).
const botonMirar = document.querySelector('#mirar');
const estadoRaton = document.querySelector('#estado-raton');
function girarMirada(dx,dy) {
  jugador.rotation.y -= dx * .0034;
  camara.rotation.x = THREE.MathUtils.clamp(camara.rotation.x - dy * .0032,-1.2,1.2);
}
function capturarRaton() {
  if (!iniciado || render.xr.isPresenting) return;
  if (document.pointerLockElement === render.domElement) return;
  try {
    const solicitud = render.domElement.requestPointerLock?.();
    solicitud?.catch?.(() => {
      estadoRaton.textContent = 'El navegador no permitió capturar el ratón. Pulsa «Controlar mirada».';
    });
  } catch (error) {
    console.warn('No se pudo capturar el ratón:', error);
    estadoRaton.textContent = 'Pulsa «Controlar mirada» para mover la cámara.';
  }
}
render.domElement.addEventListener('mousemove',e=>{
  if (!render.xr.isPresenting && document.pointerLockElement===render.domElement) {
    girarMirada(e.movementX,e.movementY);
  }
});
// Clic en el escenario: al tener ratón capturado activa balizas;
// después de Esc, un clic en el escenario permite volver a capturarlo.
render.domElement.addEventListener('click',()=>{
  if (!iniciado || render.xr.isPresenting) return;
  if (document.pointerLockElement===render.domElement) activarBaliza(desdePantalla());
  else capturarRaton();
});
document.addEventListener('pointerlockchange',()=>{
  const capturado = document.pointerLockElement===render.domElement;
  botonMirar.textContent = capturado ? 'Esc: liberar ratón' : '⌖ Controlar mirada';
  estadoRaton.textContent = capturado
    ? 'Mueve el ratón para mirar, sin mantener clic. Esc libera el cursor.'
    : 'Ratón libre. Pulsa «Controlar mirada» o haz clic en el escenario para regresar.';
  if (!capturado) teclas.clear(); // Evita continuar caminando al salir con Esc.
});
document.addEventListener('pointerlockerror',()=>{
  estadoRaton.textContent = 'No se pudo capturar el ratón: usa el botón «Controlar mirada».';
});

botonMirar.addEventListener('click',()=>{
  if (!iniciado) empezar();
  if (document.pointerLockElement===render.domElement) document.exitPointerLock?.();
  else capturarRaton();
});

function empezar() {
  iniciado=true;
  portada.style.display='none';
  mensaje.textContent='Usa WASD para explorar, Espacio para saltar y F para las balizas.';
  contextoAudio();
}
// El clic de inicio es el gesto del usuario requerido para activar Pointer Lock.
document.querySelector('#jugar').addEventListener('click',()=>{
  empezar();
  capturarRaton();
});
document.querySelector('#ayuda').addEventListener('click',()=>{
  const mostrar = portada.style.display==='none';
  portada.style.display=mostrar ? '' : 'none';
  if (mostrar) document.exitPointerLock?.();
  else if (iniciado) capturarRaton();
});

document.addEventListener('keydown',e=>{
  if(e.code==='Escape') {
    document.exitPointerLock?.();
    teclas.clear();
    return;
  }
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  if(e.repeat && ['KeyQ','KeyE','KeyF','Space'].includes(e.code)) return;
  teclas.add(e.code);
  if(e.code==='Space') saltar();
  if(e.code==='KeyF' && iniciado) {contextoAudio();activarBaliza(desdePantalla());}
  if(e.code==='KeyQ' && iniciado) jugador.rotation.y+=Math.PI/2;
  if(e.code==='KeyE' && iniciado) jugador.rotation.y-=Math.PI/2;
});
document.addEventListener('keyup',e=>teclas.delete(e.code));
window.addEventListener('blur',()=>teclas.clear());

// Esta es la única pista musical del proyecto. No se reproduce al iniciar.
// La reproducción y pausa dependen exclusivamente del botón visible.
botonMusica.addEventListener('click', async () => {
  if (audio.paused) {
    try {
      audio.volume = 0.55;
      await audio.play();
      botonMusica.textContent = '♫ Pausar música';
      botonMusica.setAttribute('aria-pressed', 'true');
    } catch (error) {
      console.warn('No se pudo reproducir la música:', error);
      mensaje.textContent = 'No se pudo iniciar la música. Revisa assets/musica.mp3.';
    }
  } else {
    audio.pause();
    botonMusica.textContent = '♫ Reproducir música';
    botonMusica.setAttribute('aria-pressed', 'false');
  }
});

// Movimiento de escritorio y controles XR.
// En Quest, eje Y del stick: -1 adelante, +1 atrás; el código lo convierte
// a +1 avanzar / -1 retroceder, relativo al rumbo de la cabeza.
// El joystick derecho gira en pasos de 30° para reducir giros bruscos.
const adelante=new THREE.Vector3();
const derecha=new THREE.Vector3();
const rumbo=new THREE.Vector3();
let esperaGiro=0;
function aplicarDireccion(ax,ay,velocidad,dt,camaraReferencia=camara) {
  camaraReferencia.getWorldDirection(adelante);
  adelante.y=0;
  if(adelante.lengthSq()<.0001) adelante.set(0,0,-1);
  adelante.normalize();
  derecha.set(-adelante.z,0,adelante.x);
  rumbo.copy(derecha).multiplyScalar(ax).addScaledVector(adelante,ay);
  if(rumbo.lengthSq()>.001) {
    rumbo.normalize().multiplyScalar(velocidad*dt);
    mover(rumbo.x,rumbo.z);
  }
}
function navegar(dt) {
  if(!iniciado) return;
  if(render.xr.isPresenting) {
    const sesion=render.xr.getSession();
    const camaraXR=render.xr.getCamera(camara);
    const vistaCabeza=camaraXR.cameras?.[0] ?? camaraXR;
    for(const entrada of sesion?.inputSources ?? []) {
      const axes=entrada.gamepad?.axes;
      // Botón A (derecha) o X (izquierda): un salto por pulsación.
      const botonSaltar=Boolean(entrada.gamepad?.buttons?.[3]?.pressed);
      if(botonSaltar && !saltoBotonVR.get(entrada)) saltar();
      saltoBotonVR.set(entrada,botonSaltar);
      if(!axes || axes.length<2) continue;
      const x=axes.length>=4 ? axes[axes.length-2] : axes[0];
      const y=axes.length>=4 ? axes[axes.length-1] : axes[1];
      if(entrada.handedness==='left') {
        aplicarDireccion(Math.abs(x)>.2 ? x * FACTOR_LATERAL_VR : 0,
          Math.abs(y)>.2 ? y * FACTOR_AVANCE_VR : 0,2.6,dt,vistaCabeza);
      } else if(entrada.handedness==='right' && esperaGiro<=0 && Math.abs(x)>.8) {
        jugador.rotation.y+=x>0 ? -Math.PI/6 : Math.PI/6;
        esperaGiro=.4;
      }
    }
    esperaGiro=Math.max(0,esperaGiro-dt);
  } else {
    const ax=Number(teclas.has('KeyD')||teclas.has('ArrowRight'))-Number(teclas.has('KeyA')||teclas.has('ArrowLeft'));
    const ay=Number(teclas.has('KeyW')||teclas.has('ArrowUp'))-Number(teclas.has('KeyS')||teclas.has('ArrowDown'));
    aplicarDireccion(ax,ay,teclas.has('ShiftLeft')||teclas.has('ShiftRight') ? 6 : 3.1,dt);
  }
}

// Pelotas con inercia, fricción y rebote: dinámica retomada de la práctica 3.5.
function fisica(dt) {
  for(const p of pelotas) {
    const m=p.m,anterior=m.position.clone();
    m.position.x+=p.v.x*dt;
    m.position.z+=p.v.y*dt;
    if(Math.abs(m.position.x)>LIMITE-p.radio) {
      m.position.x=THREE.MathUtils.clamp(m.position.x,-LIMITE+p.radio,LIMITE-p.radio);
      p.v.x*=-.72;
    }
    if(Math.abs(m.position.z)>LIMITE-p.radio) {
      m.position.z=THREE.MathUtils.clamp(m.position.z,-LIMITE+p.radio,LIMITE-p.radio);
      p.v.y*=-.72;
    }
    if(golpeaObstaculo(m.position.x,m.position.z,p.radio)) {
      m.position.copy(anterior);
      p.v.multiplyScalar(-.7);
    }
    p.v.multiplyScalar(Math.exp(-1.25*dt));
    m.rotation.x+=p.v.y*dt/p.radio;
    m.rotation.z-=p.v.x*dt/p.radio;
  }
}

render.xr.addEventListener('sessionstart',()=>{
  if (document.pointerLockElement===render.domElement) document.exitPointerLock?.();
  iniciado=true;
  portada.style.display='none';
  document.querySelector('#mira').style.display='none';
  mensaje.textContent='VR activo. Mira y apunta con los dos controles.';
});
render.xr.addEventListener('sessionend',()=>{
  document.querySelector('#mira').style.display='';
  mensaje.textContent='Modo PC. Explora con WASD y selecciona con F.';
});

render.setAnimationLoop(()=>{
  const dt=Math.min(reloj.getDelta(),.05);
  const t=reloj.elapsedTime;
  navegar(dt);
  actualizarSalto(dt);
  fisica(dt);
  mirarBalizas(dt);
  if(mezcladorGuardia) mezcladorGuardia.update(dt);
  if(guardia) {
    guardia.position.x=6+Math.sin(t*.45)*1.2;
    guardia.rotation.y=Math.cos(t*.45)>0 ? -Math.PI/2 : Math.PI/2;
  }
  for(const b of balizas) {
    b.orb.rotation.y+=dt*(b.activa ? 2.4 : .65);
    b.orb.position.y=1.18+Math.sin(t*2+b.indice)*.085;
    b.aro.rotation.z+=dt*.4;
  }
  render.render(escena,camara);
});

window.addEventListener('resize',()=>{
  camara.aspect=innerWidth/innerHeight;
  camara.updateProjectionMatrix();
  render.setSize(innerWidth,innerHeight);
});
mensaje.textContent='Escenario listo. Comienza el recorrido o entra en VR.';
