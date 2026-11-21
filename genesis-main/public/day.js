import { api, esc, icon, modal, moods, navigate, shareDialog, toast } from './ui.js';
import { frameComposition } from './composition.js';
import { audioBands, elapsedSeconds, playingDay, playTrack, progress, recordingAudio, seekTrack, setDucking, spotifyLinks, stopTrack } from './media.js';
import { mountSpotifyPlayer } from './spotify.js';
import { pickTrack, isVideoItem } from './analysis.js';
import { mountDeck } from './deck.js';
import { mountDayWeather } from './weather.js';
import { archivePatina } from './patina.js';
import { contactSheetLayout, drawPostcardDesign, drawSoundSignature } from './postcard.js';
import { buildVisualRecipe, gradeColor } from './visual-recipe.js';
import { tempoLabel } from './rhythm.js';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const cssColor = color => /^#[0-9a-f]{6}$/i.test(color) ? color : '#767667';
const percent = value => `${Math.round(clamp(Number(value) || 0, 0, 1) * 100)}%`;
const stamp = date => new Intl.DateTimeFormat('ru', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(`${date}T12:00:00`));
const paletteHTML = colors => (colors || []).map(color => `<span title="${cssColor(color)}" style="--swatch:${cssColor(color)}"></span>`).join('');
let clean = null;
export function cleanupDay() {
  clean?.();
  clean = null;
  document.body.classList.remove('in-day');
  for (const prop of ['--day-bg', '--day-surface', '--day-accent', '--day-paper', '--day-frame', '--day-border']) {
    document.body.style.removeProperty(prop);
  }
}

function weatherIndex(recipe) {
  return ['warm_haze','mist','rain_glass','wind_sparks','clear_light'].indexOf(recipe.weatherType);
}

// All styles process the original photographs. Supports Beat Spotlight (focus 0..1)
// so peripheral frames soften while the active frame stays vivid and breathing.
const vertex = `attribute vec2 pos; varying vec2 uv;
void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}`;
const fragment = `precision mediump float;
varying vec2 uv; uniform sampler2D photo; uniform vec2 crop, offset, texel;
uniform vec3 grade, cursor, bands;
uniform vec4 film, textureShape;
uniform float weather, t, loud, reveal, focus;
float noise(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*4375.5453);}
void main(){
 vec2 p=vec2(uv.x,1.-uv.y);
 vec2 q=(p-.5)*crop+.5+offset;
 vec3 original=texture2D(photo,q).rgb;
 float periph=1.-clamp(focus,0.,1.);
 float clearMask=(1.-smoothstep(.05,.28,distance(p,cursor.xy)))*cursor.z;
 float brush=textureShape.x*(1.+.34*bands.y+.65*periph);
 vec2 d=texel*brush;
 vec3 card=(texture2D(photo,q+vec2(d.x,0.)).rgb+texture2D(photo,q-vec2(d.x,0.)).rgb+
            texture2D(photo,q+vec2(0.,d.y)).rgb+texture2D(photo,q-vec2(0.,d.y)).rgb)*.25;
 vec3 diag=(texture2D(photo,q+vec2(d.x*1.15,d.y*.85)).rgb+texture2D(photo,q-vec2(d.x*1.15,d.y*.85)).rgb+
            texture2D(photo,q+vec2(d.x*.85,-d.y*1.15)).rgb+texture2D(photo,q+vec2(-d.x*.85,d.y*1.15)).rgb)*.25;
 vec3 near=mix(card,diag,.48);
 float painterly=clamp((brush-2.2)/4.2,0.,1.)*(1.-clearMask*.9);
 float mistLocal=clamp(film.w+.18*periph,0.,1.)*(1.-clearMask*.92);
 vec3 c=mix(original,near,clamp(.06+.38*mistLocal+.26*painterly+.14*periph,0.,.78));
 c += (original-near)*max(0.,grade.y-1.)*2.1*(1.-periph*.65);
 float y=dot(c,vec3(.2126,.7152,.0722));
 float hi=max(c.r,max(c.g,c.b)), lo=min(c.r,min(c.g,c.b)), chroma=hi-lo;
 float light=.5*(hi+lo), hue=0.;
 if(chroma>.0001){
   if(hi==c.r) hue=(c.g-c.b)/chroma;
   else if(hi==c.g) hue=2.+(c.b-c.r)/chroma;
   else hue=4.+(c.r-c.g)/chroma;
 }
 hue=mod(hue*60.+360.,360.);
 hue+=clamp(mod(39.-hue+540.,360.)-180.,-film.x,film.x)*4.*light*(1.-light);
 vec3 k=mod(vec3(0.,8.,4.)+hue/30.+12.,12.);
 float sat=grade.x*(1.-.22*periph);
 float amplitude=min(.5*chroma*sat,min(light,1.-light));
 c=light-amplitude*clamp(min(k-3.,9.-k),-1.,1.);
 c=((c-.5)*grade.y+.5+vec3(-.09,.015,.095)*film.y*max(0.,.5-y))*grade.z;
 vec3 halo=(texture2D(photo,q+d*3.).rgb+texture2D(photo,q-d*3.).rgb+
            texture2D(photo,q+vec2(d.x,-d.y)*2.4).rgb+texture2D(photo,q-vec2(d.x,-d.y)*2.4).rgb)*.25;
 float bright=smoothstep(.48,.89,dot(halo,vec3(.2126,.7152,.0722)));
 float haloAmt=film.z*(1.+.55*bands.y)*(1.-clearMask*.75);
 c+=vec3(.15,.074,.03)*bright*haloAmt;
 float weave=(sin(gl_FragCoord.x*.75)*cos(gl_FragCoord.y*.75))*.016*painterly;
 c+=weave;
 c=mix(c,vec3(.92,.91,.86),mistLocal*.13);
 float edge=smoothstep(.42,.96,distance(p,vec2(.5,.5)));
 float grainAmt=(textureShape.y+.18*periph)*(1.+.42*bands.z)*(1.-clearMask*.85);
 c=mix(c,c*(1.-.18*grainAmt)+vec3(.07,.035,.01)*haloAmt,edge*(.22*grainAmt+.28*haloAmt));
 float grainSeed=floor(t*(10.+8.*bands.z));
 float grain=noise(floor(gl_FragCoord.xy/(1.+textureShape.y*2.3))+vec2(grainSeed*.37,grainSeed*.71));
 c+=(grain-.5)*(.01+.065*grainAmt);
 float dots=sin(gl_FragCoord.x*1.25)*sin(gl_FragCoord.y*1.25);
 c-=max(dots,0.)*.085*textureShape.z*(1.-textureShape.y)*(1.-clearMask*.9);
 float wxMask=1.-clearMask*.92;
 float wt=t*(1.+.35*bands.z);
 if(weather<.5){float glow=pow(max(0.,1.-distance(p,vec2(.08+.13*sin(wt*.2),.2))*.94),2.);c+=vec3(.085,.051,.012)*glow*wxMask;}
 else if(weather<1.5){
   float bank=.50+.08*sin(p.x*4.-wt*.35)+.05*sin(p.x*11.-wt*.63);
   float low=.74+.055*sin(p.x*7.-wt*.29);
   float fog=(1.-smoothstep(.02,.23,abs(p.y-bank)))*(.54+.38*sin(p.x*4.+p.y*5.-wt*.41));
   fog+=.36*(1.-smoothstep(.02,.16,abs(p.y-low)))*(.65+.35*cos(p.x*5.-wt*.77));
   c=mix(c,vec3(.83,.88,.87),fog*.26*wxMask);
 }
 else if(weather<2.5){vec2 v=vec2(p.x*106.+p.y*10.,p.y*5.-wt*(.8+.5*loud+.7*bands.z));float drop=smoothstep(.98,1.,fract(v.x))*smoothstep(.72,1.,fract(v.y+noise(vec2(floor(v.x),0.))));c+=vec3(.14+.08*bands.z)*drop*wxMask;}
 else if(weather<3.5){float line=pow(max(0.,sin(p.y*250.+wt*2.)),18.)*max(0.,sin(p.x*9.+p.y*24.+wt*1.4));c+=vec3(.035+.03*bands.z)*line*wxMask;}
 else{float light=pow(max(0.,1.-distance(p,vec2(.8+.1*sin(wt*.2),.07))*.98),3.);c+=vec3(.05,.044,.032)*light*wxMask;}
 c*=(1.-.22*periph);
 c=mix(c,mix(c,original,.74),clearMask*.88);
 float dev=smoothstep(0.,1.,clamp(reveal,0.,1.));
 if(dev<.999){
   vec3 soft=mix(near,c,smoothstep(.1,.9,dev));
   float lum=dot(soft,vec3(.299,.587,.114));
   vec3 latent=mix(vec3(lum*.78+.14),vec3(.92,.90,.84),.42);
   c=mix(latent,soft,dev);
 }
 gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;

function shaderSurface() {
  const surface = document.createElement('canvas');
  const gl = surface.getContext('webgl', { alpha:false, antialias:false, preserveDrawingBuffer:true });
  if (!gl) return null;
  const shaders = [], program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type); shaders.push(shader);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    shaders.forEach(shader => gl.deleteShader(shader)); gl.deleteProgram(program); return null;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const attr = gl.getAttribLocation(program, 'pos'); gl.enableVertexAttribArray(attr); gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);
  const loc = Object.fromEntries(['crop','offset','texel','grade','film','textureShape','weather','t','loud','reveal','cursor','bands','focus'].map(key => [key,gl.getUniformLocation(program,key)]));
  const textures = new Map();
  function useTexture(source) {
    const isVideo = typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement;
    if (isVideo && (source.readyState < 2 || !source.videoWidth)) return null;
    const cached = textures.get(source);
    if (cached) {
      textures.delete(source);
      textures.set(source, cached);
      gl.bindTexture(gl.TEXTURE_2D, cached.tex);
      if (isVideo) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
        cached.width = source.videoWidth;
        cached.height = source.videoHeight;
      }
      return cached;
    }
    // Keep up to 5 textures resident in GPU memory so all 1-5 contact-sheet items render at 60fps.
    if (textures.size === 5) {
      const oldest = textures.keys().next().value;
      gl.deleteTexture(textures.get(oldest).tex);
      textures.delete(oldest);
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, key, gl.LINEAR);
    for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
    const limit = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 1920);
    const natW = isVideo ? source.videoWidth : source.naturalWidth;
    const natH = isVideo ? source.videoHeight : source.naturalHeight;
    let upload = source, width = natW, height = natH;
    if (!isVideo && Math.max(natW, natH) > limit) {
      const scale = limit / Math.max(natW, natH);
      upload = document.createElement('canvas');
      width = upload.width = Math.max(1, Math.round(natW * scale));
      height = upload.height = Math.max(1, Math.round(natH * scale));
      upload.getContext('2d').drawImage(source, 0, 0, width, height);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, upload);
    const uploaded = { tex, width: Math.max(1, width), height: Math.max(1, height) };
    textures.set(source, uploaded);
    return uploaded;
  }
  return {
    draw(source, w, h, time, level, recipe, camera={zoom:1,x:0,y:0}, fx={}) {
      if (gl.isContextLost()) return null;
      if (surface.width !== w || surface.height !== h) { surface.width = w; surface.height = h; gl.viewport(0, 0, w, h); }
      const texture = useTexture(source);
      if (!texture) return null;
      gl.uniform2f(loc.texel,1/texture.width,1/texture.height);
      const ratio = (w/h)/(texture.width/texture.height);
      const x = Math.min(1,ratio)/camera.zoom, y = Math.min(1,1/ratio)/camera.zoom;
      gl.uniform2f(loc.crop,x,y);
      gl.uniform2f(loc.offset,clamp(((camera.anchorX ?? .5)-.5)*(1-x)+camera.x*x,(x-1)/2,(1-x)/2),clamp(((camera.anchorY ?? .5)-.5)*(1-y)+camera.y*y,(y-1)/2,(1-y)/2));
      gl.uniform3f(loc.grade,recipe.saturation,recipe.contrast,recipe.exposure);
      gl.uniform4f(loc.film,recipe.amberShift,recipe.shadowCool,recipe.halation,recipe.mist);
      gl.uniform4f(loc.textureShape,recipe.brushRadius,recipe.grain,recipe.geometry,0);
      gl.uniform1f(loc.weather,weatherIndex(recipe));
      gl.uniform1f(loc.t,(time*recipe.particleSpeed)%400);
      gl.uniform1f(loc.loud,level);
      gl.uniform1f(loc.reveal,fx.reveal ?? 1);
      gl.uniform1f(loc.focus,fx.focus ?? 1);
      gl.uniform3f(loc.cursor,fx.cursorX ?? .5,fx.cursorY ?? .5,fx.cursorStrength ?? 0);
      gl.uniform3f(loc.bands,fx.bass ?? 0,fx.mid ?? 0,fx.high ?? 0);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4); return surface;
    },
    dispose() { for(const {tex} of textures.values())gl.deleteTexture(tex); textures.clear(); gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(s => gl.deleteShader(s)); gl.getExtension('WEBGL_lose_context')?.loseContext(); }
  };
}

function linesFor(ctx, text, width) {
  const lines = []; let line = '';
  for (const word of text.split(/\s+/u)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawWeather(ctx, width, height, type, time, sound) {
  ctx.save();
  if(type===0 || type===4) {
    const x=type===0 ? width*.13 : width*.79;
    const light=ctx.createRadialGradient(x,height*.12,0,x,height*.12,height*.84);
    light.addColorStop(0,type===0?'rgba(255,208,125,.16)':'rgba(255,250,215,.13)');light.addColorStop(1,'transparent');
    ctx.fillStyle=light;ctx.fillRect(0,0,width,height);
  } else if(type===1) {
    const band=height*(.42+.13*Math.sin(time*.35));
    const mist=ctx.createLinearGradient(0,band-height*.33,0,band+height*.33);
    mist.addColorStop(0,'transparent');mist.addColorStop(.5,'rgba(221,228,222,.16)');mist.addColorStop(1,'transparent');
    ctx.fillStyle=mist;ctx.fillRect(0,0,width,height);
  } else {
    ctx.strokeStyle=type===2?'rgba(239,247,250,.22)':'rgba(250,247,231,.13)';
    ctx.lineWidth=1.4;ctx.beginPath();
    for(let i=0;i<52;i++){
      const x=(i*193.27+(type===3?time*90:0))%width, y=(i*79.13+time*(type===2?170+sound*70:4))%height;
      ctx.moveTo(x,y);ctx.lineTo(x+(type===2?-4:width*.055),y+(type===2?20:1));
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Bake the Canvas 2D fallback once per source and recipe.
function createPhotoGrader(recipe) {
  const cache = new WeakMap();
  let lut;
  return image => {
    if (cache.has(image)) return cache.get(image);
    const steps = 16, cells = steps + 1;
    if (!lut) {
      lut = new Uint8Array(cells ** 3 * 3);
      let entry = 0;
      for (let r = 0; r <= steps; r++) for (let g = 0; g <= steps; g++) for (let b = 0; b <= steps; b++) {
        const color = parseInt(gradeColor([r/steps,g/steps,b/steps],recipe).slice(1),16);
        lut[entry++] = color >> 16; lut[entry++] = color >> 8; lut[entry++] = color;
      }
    }
    const plate = document.createElement('canvas');
    const scale = Math.min(1, 900 / Math.max(image.naturalWidth,image.naturalHeight));
    const w = plate.width = Math.max(1, Math.round(image.naturalWidth * scale));
    const h = plate.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = plate.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(image,0,0,w,h);
    const frame = ctx.getImageData(0,0,w,h), pixels = frame.data;
    const original = new Uint8Array(pixels);
    const radius = Math.max(1,Math.round(recipe.brushRadius * w/880));
    const softness = .06 + recipe.mist*.37 - Math.max(0,recipe.contrast-1)*2;
    const cell = 1 + Math.round(recipe.grain*2);
    for (let y=0; y<h; y++) {
      for (let x=0; x<w; x++) {
        const i=(y*w+x)*4;
        const left=(y*w+Math.max(0,x-radius))*4, right=(y*w+Math.min(w-1,x+radius))*4;
        const top=(Math.max(0,y-radius)*w+x)*4, bottom=(Math.min(h-1,y+radius)*w+x)*4;
        let address=0;
        for (let c=0;c<3;c++) {
          const near=(original[left+c]+original[right+c]+original[top+c]+original[bottom+c])*.25;
          pixels[i+c]=original[i+c]+(near-original[i+c])*softness;
          address=address*cells+Math.round(pixels[i+c]*steps/255);
        }
        const halo=clamp((.2126*original[left]+.7152*original[left+1]+.0722*original[left+2]-146)/85,0,1)*recipe.halation;
        const hash=Math.imul((x/cell|0)+321,10619863)^Math.imul((y/cell|0)+73,311119);
        const grain=((Math.imul(hash^(hash>>>16),0x45d9f3b)>>>24)/255-.5)*(2+14*recipe.grain);
        const dots=(x%4===0 && y%4===0) ? 14*recipe.geometry*(1-recipe.grain) : 0;
        for(let c=0;c<3;c++) {
          const value=pixels[i+c], residual=value-Math.round(value*steps/255)*255/steps;
          const graded=lut[address*3+c]+residual;
          pixels[i+c]=graded+(232-graded)*recipe.mist*.12+halo*(c===0?33:c===1?16:7)+grain-dots;
        }
      }
    }
    ctx.putImageData(frame,0,0);
    cache.set(image,plate);
    return plate;
  };
}

function cameraAt(seconds, photoIndex, energy, bass, focus, parallaxX = 0, parallaxY = 0) {
  const cycle = seconds * (.085 + energy * .02) + photoIndex * 2.1 - .6;
  return {
    zoom: 1.03 + .016 * (1 - Math.cos(cycle)) / 2 + clamp(bass, 0, 1) * .035 * focus,
    x: .012 * Math.sin(cycle) + parallaxX * .016 * (.35 + .65 * focus),
    y: .006 * Math.sin(cycle + .7) + parallaxY * .012 * (.35 + .65 * focus)
  };
}

function scene(canvas, day, {dayNumber, onPhoto, onProgress, onScrub, onBands, onCursorMove, onOpenLoupe, reducedMotion, initialRecipe}) {
  canvas.width = 880; canvas.height = 1100;
  const ctx = canvas.getContext('2d',{alpha:false});
  const photos = day.photos;
  const count = photos.length;
  let shader = shaderSurface(), frame = 0, running = true, visible = true, recording = false;
  let playing = !reducedMotion.matches, time = 0, lastFrame = null, readyCount = 0;
  let activeIndex = 0, focusChangedAt = 0, nextBeatAt = Infinity;
  let revealStart = reducedMotion.matches ? -5000 : 0, lastBeatPhrase = -1;
  const media = photos.map(item => ({
    item, isVideo: isVideoItem(item), poster: null, video: null, duration: item.duration || 0
  }));
  const spotWeights = new Float32Array(count);
  spotWeights[0] = 1;
  let recipe = initialRecipe, gradePhoto = createPhotoGrader(recipe);
  const videoRate = () => clamp(.74 + recipe.motionSpeed * .28, .72, 1.32);
  function syncVideos() {
    const run = (playing || recording) && !document.hidden;
    for (const entry of media) {
      if (!entry.video) continue;
      entry.video.playbackRate = videoRate();
      if (run) entry.video.play().catch(() => {});
      else entry.video.pause();
    }
  }
  const withSequence = count > 1;
  const shotLength = () => recipe.intervalMs;
  const visibility = 'IntersectionObserver' in window ? new IntersectionObserver(([entry])=>{
    visible=entry.isIntersecting;
    if (!visible) lastFrame=null;
  }) : null;
  visibility?.observe(canvas);
  const W=canvas.width, H=canvas.height;
  const caption=day.coverText || String(day.quote || day.title).slice(0,220).trim();
  const shortDate=stamp(day.date);
  let layout, titleFont, quoteFont, quoteLines, quoteLineH;

  // Tactile pointer state: hovered photo slot, glass-wipe UV inside that slot, parallax, signature scrub.
  const pointer = {
    cx: W * .5, cy: H * .5, hoveredSlot: -1, u: .5, v: .5,
    strength: 0, targetStrength: 0, nx: 0, ny: 0, targetNx: 0, targetNy: 0,
    hoverSig: -1, draggingSig: false
  };

  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / Math.max(1, rect.width)),
      y: (e.clientY - rect.top) * (H / Math.max(1, rect.height))
    };
  }
  function sigFraction(pt) {
    const box = layout.sigBox, pad = 12;
    if (pt.x < box.x - pad || pt.x > box.x + box.w + pad || pt.y < box.y - pad || pt.y > box.y + box.h + pad) return -1;
    return clamp(box.vertical ? (pt.y - box.y) / Math.max(1, box.h) : (pt.x - box.x) / Math.max(1, box.w));
  }
  function hitSlot(pt) {
    // Check active slot first (highest z-order in overlap mode), then top-down.
    const order = [...layout.slots].sort((a, b) => (a.index === activeIndex ? 1 : 0) - (b.index === activeIndex ? 1 : 0)).reverse();
    for (const slot of order) {
      if (pt.x >= slot.x && pt.x <= slot.x + slot.w && pt.y >= slot.y && pt.y <= slot.y + slot.h) return slot;
    }
    return null;
  }
  function setFocus(idx) {
    const next = ((idx % count) + count) % count;
    if (next !== activeIndex) {
      activeIndex = next;
      focusChangedAt = time;
      nextBeatAt = time + shotLength();
      onPhoto?.(activeIndex);
      onProgress?.(0);
    }
  }
  function handleMove(e) {
    const pt = canvasPoint(e);
    pointer.cx = pt.x; pointer.cy = pt.y;
    const frac = sigFraction(pt);
    if (pointer.draggingSig) {
      const box = layout.sigBox;
      const dragged = clamp(box.vertical ? (pt.y - box.y) / Math.max(1, box.h) : (pt.x - box.x) / Math.max(1, box.w));
      pointer.hoverSig = dragged;
      onScrub?.(dragged);
      return;
    }
    pointer.hoverSig = frac;
    pointer.targetNx = clamp((pt.x / W) * 2 - 1, -1, 1);
    pointer.targetNy = clamp((pt.y / H) * 2 - 1, -1, 1);
    if (frac >= 0) {
      canvas.style.cursor = 'pointer';
      pointer.hoveredSlot = -1;
      pointer.targetStrength = 0;
    } else {
      const slot = hitSlot(pt);
      if (slot) {
        canvas.style.cursor = 'zoom-in';
        pointer.hoveredSlot = slot.index;
        pointer.u = clamp((pt.x - slot.x) / Math.max(1, slot.w));
        pointer.v = clamp((pt.y - slot.y) / Math.max(1, slot.h));
        pointer.targetStrength = 1;
        if (slot.index !== activeIndex) setFocus(slot.index);
      } else {
        canvas.style.cursor = '';
        pointer.hoveredSlot = -1;
        pointer.targetStrength = 0;
      }
    }
    onCursorMove?.(e.clientX, e.clientY, true);
  }
  function handleDown(e) {
    const pt = canvasPoint(e);
    const frac = sigFraction(pt);
    if (frac >= 0) {
      pointer.draggingSig = true;
      pointer.hoverSig = frac;
      canvas.setPointerCapture?.(e.pointerId);
      onScrub?.(frac);
      return;
    }
    const slot = hitSlot(pt);
    if (slot) onOpenLoupe?.(slot.index);
  }
  function handleUp() { pointer.draggingSig = false; }
  function handleLeave() {
    pointer.draggingSig = false;
    pointer.hoverSig = -1;
    pointer.hoveredSlot = -1;
    pointer.targetStrength = 0;
    pointer.targetNx = 0;
    pointer.targetNy = 0;
    canvas.style.cursor = '';
    onCursorMove?.(0, 0, false);
  }
  function handleVisibility() { syncVideos(); }
  document.addEventListener('visibilitychange', handleVisibility);
  canvas.addEventListener('pointermove', handleMove);
  canvas.addEventListener('pointerdown', handleDown);
  canvas.addEventListener('pointerup', handleUp);
  canvas.addEventListener('pointercancel', handleUp);
  canvas.addEventListener('pointerleave', handleLeave);

  function preparePrint() {
    layout = contactSheetLayout(W, H, recipe, count);
    const angular = recipe.typeWeight >= 540;
    titleFont = (angular ? Math.round(recipe.typeWeight) + ' ' : '500 ') + '40px ' +
      (angular ? 'Manrope, Arial, sans-serif' : '"Cormorant Garamond", Lora, Georgia, serif');
    let qSize = angular ? 21 : 25;
    do {
      quoteFont = (angular ? '500 ' : 'italic 400 ') + qSize + 'px ' +
        (angular ? 'Manrope, Arial, sans-serif' : '"Cormorant Garamond", Lora, Georgia, serif');
      ctx.font = quoteFont;
      quoteLines = linesFor(ctx, '«' + caption.replace(/^[«"]|[»"]$/g, '') + '»', layout.footer.w);
      if (quoteLines.length <= 2 || qSize <= 16) break;
      qSize -= 2;
    } while (true);
    quoteLineH = Math.round(qSize * 1.24);
  }
  preparePrint();

  function drawSlot(slot, entry, focus, fx) {
    const { x, y, w, h, softEdge, label, timecode } = slot;
    const isLiveVideo = Boolean(entry.video && entry.video.readyState >= 2 && entry.video.videoWidth > 0);
    const source = isLiveVideo ? entry.video : entry.poster;
    const isHovered = pointer.hoveredSlot === slot.index;
    const slotFx = {
      ...fx,
      focus,
      cursorX: isHovered ? pointer.u : .5,
      cursorY: isHovered ? pointer.v : .5,
      cursorStrength: isHovered ? pointer.strength : 0
    };
    const seconds = time / 1000;
    const anchor = frameComposition(entry.item, day.mood, w / Math.max(1, h));
    const camera = cameraAt((time - focusChangedAt) / 1000 * recipe.motionSpeed + slot.index * 3.1, slot.index, day.energy || 0, fx.bass, focus, pointer.nx, pointer.ny);
    camera.anchorX = anchor.x;
    camera.anchorY = anchor.y;
    let art = null;
    if (source) {
      try { art = shader?.draw(source, w, h, seconds, fx.pulse, recipe, camera, slotFx); }
      catch { shader?.dispose(); shader = null; }
    }
    ctx.save();
    if (art) {
      ctx.drawImage(art, x, y, w, h);
    } else if (source) {
      const plate = isLiveVideo ? source : gradePhoto(source);
      const pw = isLiveVideo ? source.videoWidth : plate.width;
      const ph = isLiveVideo ? source.videoHeight : plate.height;
      const scale = Math.max(w / pw, h / ph) * camera.zoom;
      const dw = pw * scale, dh = ph * scale;
      const px = clamp((w - dw) * anchor.x - camera.x * w, w - dw, 0);
      const py = clamp((h - dh) * anchor.y - camera.y * h, h - dh, 0);
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      ctx.drawImage(plate, x + px, y + py, dw, dh);
      if (slotFx.cursorStrength > .02 && !isLiveVideo) {
        ctx.save();
        ctx.beginPath(); ctx.arc(x + slotFx.cursorX * w, y + slotFx.cursorY * h, Math.min(w, h) * .22 * slotFx.cursorStrength, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(source, x + px, y + py, dw, dh);
        ctx.restore();
      }
      drawWeather(ctx, w, h, weatherIndex(recipe), seconds * recipe.particleSpeed * (1 + fx.high * .5), fx.pulse);
      if (focus < .98) {
        ctx.fillStyle = '#0e100d'; ctx.globalAlpha = (1 - focus) * .22; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
      }
      if (fx.reveal < .99) {
        ctx.fillStyle = recipe.sheetBg || recipe.paper; ctx.globalAlpha = (1 - fx.reveal) * .65; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
      }
    } else {
      ctx.fillStyle = recipe.palette[slot.index % recipe.palette.length] || '#2b2d29';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();

    // Impressionism: soft feathered vignette border so overlapping studies blend gently like sketchbook washes.
    if (softEdge) {
      ctx.save();
      const edgeW = Math.max(8, Math.round(Math.min(w, h) * .055));
      const bg = recipe.sheetBg || recipe.paper;
      for (const [gx0, gy0, gx1, gy1, rx, ry, rw, rh] of [
        [x, y, x, y + edgeW, x, y, w, edgeW],
        [x, y + h, x, y + h - edgeW, x, y + h - edgeW, w, edgeW],
        [x, y, x + edgeW, y, x, y, edgeW, h],
        [x + w, y, x + w - edgeW, y, x + w - edgeW, y, edgeW, h]
      ]) {
        const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        g.addColorStop(0, bg);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = .58;
        ctx.fillStyle = g;
        ctx.fillRect(rx, ry, rw, rh);
      }
      ctx.restore();
    }

    // Crisp 1px color-graded border on every slot, highlighted smoothly on the active focused slot.
    ctx.save();
    const isFocused = count > 1 && focus > .65;
    if (isFocused) {
      ctx.strokeStyle = recipe.frameHighlight || recipe.sheetInk;
      ctx.globalAlpha = .86 * focus;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + .75, y + .75, w - 1.5, h - 1.5);
    } else if (!softEdge) {
      ctx.strokeStyle = recipe.frameBorder || recipe.sheetRule;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    }

    // Crisp shutter flash on the newly focused slot during hard beat-synced cuts.
    if (slot.index === activeIndex && recipe.cutSharpness >= .68 && time - focusChangedAt < 130 && focusChangedAt > 100) {
      ctx.fillStyle = recipe.frameHighlight || recipe.sheetInk;
      ctx.globalAlpha = (1 - (time - focusChangedAt) / 130) * .16;
      ctx.fillRect(x, y, w, h);
    }

    // Contact-sheet mini-index [01], [02]... (plus ▶ duration on videos, or timecode on 35mm cinema).
    ctx.globalAlpha = .45 + .55 * focus;
    ctx.font = '600 13px Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const durTag = entry.duration > 0 ? ` ${Math.floor(entry.duration / 60)}:${String(Math.round(entry.duration % 60)).padStart(2, '0')}` : '';
    const tagText = entry.isVideo ? `${label} ▶${durTag}` : label;
    const tagW = Math.max(36, Math.ceil(ctx.measureText(tagText).width) + 10);
    const tagBg = layout.style === 'film' ? (recipe.backdrop || '#141312') : (recipe.sheetBg || recipe.paper);
    const tagFg = recipe.sheetInk || '#f5f2eb';
    const tagAlpha = ctx.globalAlpha;
    ctx.globalAlpha = tagAlpha * .88;
    ctx.fillStyle = tagBg;
    ctx.fillRect(x + 6, y + 6, tagW, 19);
    ctx.strokeStyle = recipe.frameBorder || recipe.sheetRule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 6.5, y + 6.5, tagW - 1, 18);
    ctx.globalAlpha = tagAlpha;
    ctx.fillStyle = tagFg;
    ctx.fillText(tagText, x + 10, y + 9);
    if (timecode && layout.style === 'film') {
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255, 214, 158, 0.85)';
      ctx.font = '500 11px Consolas, monospace';
      ctx.fillText(entry.isVideo && entry.video ? clockValue(entry.video.currentTime) : timecode, x + w - 8, y + h - 17);
    }
    ctx.restore();
  }

  function paint(completeCaption = false) {
    const audioActive = (playing || recording) && playingDay() === day.id;
    const beatTime = audioActive ? elapsedSeconds() : time / 1000;
    const beat = recipe.bpm ? Math.exp(-6 * ((beatTime * recipe.bpm / 60) % 1)) : 0;
    const liveBands = audioActive ? audioBands() : { bass: beat * .55 * recipe.beatReactivity, mid: beat * .35 * .5, high: beat * .28 * .4, level: beat * .45 };
    const bass = clamp(Math.max(liveBands.bass, beat * recipe.beatReactivity * .75));
    const mid = clamp(liveBands.mid);
    const high = clamp(liveBands.high);
    const pulse = clamp((audioActive ? Math.max(beat, liveBands.level) : beat) * recipe.beatReactivity);
    onBands?.({ bass, mid, high });

    // Smooth Beat Spotlight transition (snappy on hard cuts, gliding on lyrical tracks).
    const spotSpeed = (recording || reducedMotion.matches) ? 1 : (recipe.cutSharpness >= .68 ? .38 : .13);
    for (let i = 0; i < count; i++) {
      const target = (count === 1 || i === activeIndex) ? 1 : 0;
      spotWeights[i] += (target - spotWeights[i]) * spotSpeed;
    }

    const lerp = recording ? 0 : .14;
    pointer.strength += ((recording ? 0 : pointer.targetStrength) - pointer.strength) * (lerp || 1);
    pointer.nx += ((recording ? 0 : pointer.targetNx) - pointer.nx) * (lerp || 1);
    pointer.ny += ((recording ? 0 : pointer.targetNy) - pointer.ny) * (lerp || 1);

    const reveal = (reducedMotion.matches || recording) ? 1 : clamp((time - revealStart) / 1800);
    const fx = { reveal, bass, mid, high, pulse };

    // 1. Archival Contact Sheet surface tinted from the day's own K-Means palette.
    ctx.fillStyle = recipe.sheetBg || recipe.paper;
    ctx.fillRect(0, 0, W, H);
    if (layout.style === 'film') {
      ctx.fillStyle = recipe.backdrop || '#120f0d';
      ctx.fillRect(0, layout.stage.y, W, layout.stage.h);
    }

    // 2. Render ALL 1–5 photos/videos simultaneously in their mode-specific Contact Sheet slots.
    const drawOrder = [...layout.slots].sort((a, b) => (a.index === activeIndex ? 1 : 0) - (b.index === activeIndex ? 1 : 0));
    for (const slot of drawOrder) {
      drawSlot(slot, media[slot.index], spotWeights[slot.index], fx);
    }

    // 3. Permanent Contact Sheet 1px dividers, calibration swatches ■ ■ ■ ■, perforations & Kandinsky powerCell.
    drawPostcardDesign(ctx, W, H, recipe, count, { bass, mid, high });

    // 4. Index Header typography (№04 · 14.10.26     ЗОЛОТАЯ ДЫМКА     ■ ■ ■ ■).
    ctx.save();
    ctx.fillStyle = recipe.sheetInk;
    ctx.font = '600 15px Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const hy = Math.round(layout.header.h / 2) + 1;
    ctx.fillText(`№${dayNumber} · ${shortDate}`, layout.header.x, hy);
    ctx.textAlign = 'center';
    ctx.fillStyle = recipe.sheetMuted;
    ctx.font = '500 14px Consolas, monospace';
    ctx.fillText(recipe.weatherLabel.toUpperCase(), W * .5, hy);
    ctx.restore();

    // 5. Embedded clickable Sound Signature (bottom strip OR right 35mm optical track).
    ctx.save();
    ctx.globalAlpha = clamp((reveal - .16) / .84);
    drawSoundSignature(ctx, W, H, recipe, audioActive ? progress() : 0, { bass, mid, high }, recording ? -1 : pointer.hoverSig, count);
    ctx.restore();

    // 6. Contact Sheet Footer typography: Folder Title + BPM-synced Quote + Track Meta.
    ctx.save();
    ctx.translate(pointer.nx * 3.5, pointer.ny * 2.5);
    const fxLeft = layout.footer.x;
    const titleY = layout.footer.y + 48;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = recipe.sheetInk;
    ctx.font = titleFont;
    ctx.fillText(day.title, fxLeft, titleY, layout.footer.w);

    ctx.font = quoteFont;
    ctx.fillStyle = recipe.sheetMuted;
    const totalWords = quoteLines.reduce((sum, l) => sum + l.split(/\s+/u).filter(Boolean).length, 0);
    const elapsedRev = (time - revealStart) / 1000;
    const beatStep = Math.min(2.0 / Math.max(1, totalWords), clamp(30 / (recipe.bpm || 80), .14, .32));
    let wordCounter = 0;
    quoteLines.forEach((line, i) => {
      const ly = titleY + 34 + i * quoteLineH;
      if (completeCaption || !playing || reducedMotion.matches || recording || elapsedRev > 4.0) {
        ctx.globalAlpha = 1;
        ctx.fillText(line, fxLeft, ly, layout.footer.w);
        return;
      }
      const lw = ctx.measureText(line).width;
      const sx = lw > layout.footer.w ? layout.footer.w / lw : 1;
      let cx = fxLeft;
      const spaceW = ctx.measureText(' ').width * sx;
      for (const word of line.split(/\s+/u).filter(Boolean)) {
        const alpha = clamp((elapsedRev - (.30 + wordCounter * beatStep)) / .26);
        if (alpha > 0) {
          ctx.globalAlpha = alpha;
          ctx.fillText(word, cx, ly + (1 - alpha) * 3, ctx.measureText(word).width * sx);
        }
        cx += ctx.measureText(word).width * sx + spaceW;
        wordCounter++;
      }
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    // Bottom-right track attribution aligned with the Sound Signature strip.
    ctx.save();
    ctx.font = '500 13px Consolas, monospace';
    ctx.fillStyle = recipe.sheetMuted;
    ctx.textBaseline = 'middle';
    const metaY = H - Math.round(H * .041);
    const trackMeta = [day.track?.artist || 'DayTrace', recipe.bpm ? Math.round(recipe.bpm) + ' BPM' : null].filter(Boolean).join(' · ');
    if (layout.style === 'film') {
      ctx.textAlign = 'left';
      ctx.fillText('35MM OPTICAL SOUNDTRACK · ' + (day.track?.title || 'Музыка дня').toUpperCase(), layout.footer.x, metaY, layout.footer.w * .66);
    }
    ctx.textAlign = 'right';
    ctx.fillText(trackMeta, W - layout.pad, metaY, layout.footer.w * .36);
    ctx.restore();
  }

  function loadAll() {
    const loadImage = src => new Promise(resolve => {
      const image = new Image();
      image.decoding = 'async';
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
    return Promise.all(media.map(async entry => {
      if (!entry.isVideo) {
        const img = await loadImage(entry.item.src);
        if (!running || !img) return false;
        entry.poster = img;
        readyCount++;
        if (readyCount === 1 && !reducedMotion.matches) revealStart = time;
        paint();
        return true;
      }
      if (entry.item.poster) {
        loadImage(entry.item.poster).then(img => {
          if (!running || !img) return;
          entry.poster = img;
          if (!readyCount && !reducedMotion.matches) revealStart = time;
          readyCount++;
          paint();
        });
      }
      return await new Promise(resolve => {
        const video = document.createElement('video');
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.preload = 'auto';
        let settled = false;
        const finish = ok => { if (settled) return; settled = true; resolve(ok); };
        video.onloadeddata = () => {
          if (!running) return finish(false);
          entry.video = video;
          if (!entry.duration && Number.isFinite(video.duration)) entry.duration = video.duration;
          if (!readyCount && !reducedMotion.matches) revealStart = time;
          readyCount++;
          syncVideos();
          paint();
          finish(true);
        };
        video.onerror = () => finish(Boolean(entry.poster));
        video.src = entry.item.src;
        video.load();
      });
    }));
  }

  async function select(index) {
    setFocus(index);
    paint();
    return Boolean(media[activeIndex]?.video || media[activeIndex]?.poster);
  }

  function loop(ms) {
    if (!running) return;
    if (!document.hidden && (recording || (visible && playing))) {
      if (lastFrame === null) lastFrame = ms;
      if (ms - lastFrame >= 32) {
        if (playing || recording) time += Math.min(ms - lastFrame, 120);
        lastFrame = ms;
        const audioActive = (playing || recording) && playingDay() === day.id;
        // Beat Spotlight: advance focus across frames every 8 or 16 beats when not hovering a slot.
        if (withSequence && pointer.hoveredSlot < 0) {
          if (audioActive && recipe.bpm) {
            const phrase = Math.floor(elapsedSeconds() * 1000 / shotLength());
            if (lastBeatPhrase < 0) lastBeatPhrase = phrase;
            else if (phrase !== lastBeatPhrase) {
              lastBeatPhrase = phrase;
              setFocus(activeIndex + 1);
            }
          } else {
            lastBeatPhrase = -1;
            if (time >= nextBeatAt) setFocus(activeIndex + 1);
          }
        }
        paint();
        onProgress?.(clamp((time - focusChangedAt) / shotLength(), 0, 1));
      }
    } else {
      lastFrame = null;
    }
    frame = requestAnimationFrame(loop);
  }
  frame = requestAnimationFrame(loop);
  const loaded = loadAll().then(results => {
    if (!running) return false;
    nextBeatAt = time + shotLength();
    onPhoto?.(activeIndex);
    return results.some(Boolean);
  });

  return {
    get ready() { return readyCount > 0; },
    get playing() { return playing; },
    loaded,
    setPlaying(on) {
      playing = on; lastFrame = null; syncVideos();
      if (!on) paint();
    },
    exportPng(callback) {
      paint(true);
      canvas.toBlob(callback, 'image/png');
    },
    replayReveal() { if (!reducedMotion.matches) { revealStart = time; paint(); } },
    setRecipe(next) {
      recipe = next; gradePhoto = createPhotoGrader(recipe); preparePrint();
      nextBeatAt = time + shotLength(); lastBeatPhrase = -1; syncVideos();
      paint();
    },
    setRecording(on) {
      recording = on; lastFrame = null; lastBeatPhrase = -1;
      nextBeatAt = time + shotLength(); syncVideos();
      if (on) { focusChangedAt = time; paint(); }
    },
    select,
    stop() {
      running = false; visibility?.disconnect(); cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', handleVisibility);
      canvas.removeEventListener('pointermove', handleMove);
      canvas.removeEventListener('pointerdown', handleDown);
      canvas.removeEventListener('pointerup', handleUp);
      canvas.removeEventListener('pointercancel', handleUp);
      canvas.removeEventListener('pointerleave', handleLeave);
      for (const entry of media) {
        if (entry.video) { entry.video.pause(); entry.video.removeAttribute('src'); entry.video.load(); entry.video = null; }
      }
      shader?.dispose();
    }
  };
}

function openLoupe(day, initial, recipe) {
  const gradePhoto=createPhotoGrader(recipe);
  let index=initial, zoom=1, dx=0, dy=0, original=false, request=0, drag, raf=0, liveShader=null, videoEl=null, currentIsVideo=false;
  function stopVideoLoupe() {
    cancelAnimationFrame(raf); raf = 0;
    liveShader?.dispose(); liveShader = null;
    if (videoEl) { videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load(); videoEl.remove(); videoEl = null; }
  }
  const box=modal('Лупа воспоминания',`<div class="dt-loupe">
    <div class="dt-loupe-stage" tabindex="0" aria-label="Кадр воспоминания. Для перемещения увеличьте масштаб и перетащите."><div class="dt-loupe-plane"><img alt="" draggable="false"><canvas aria-hidden="true"></canvas></div></div>
    <div class="dt-loupe-tools"><button type="button" class="button secondary" data-lens-original aria-pressed="false">${icon('layers',17)} Арт-слой</button>
      <div class="dt-loupe-video-controls" data-lens-video-tools hidden>
        <button type="button" class="button secondary" data-lens-vplay>${icon('pause',15)} Пауза</button>
        <button type="button" class="button secondary" data-lens-vmute>${icon('volume-2',15)} Звук видео</button>
      </div>
      <label>${icon('zoom-in',18)} <input type="range" min="1" max="4" step="0.1" value="1" aria-label="Масштаб"><output>1×</output></label></div>
    <div class="dt-loupe-footer"><div><strong data-lens-file></strong><div class="dt-swatches">${paletteHTML(day.palette)}</div></div>
    ${day.photos.length>1?`<div class="dt-photo-index"><button class="icon-button" type="button" data-lens-step="-1" aria-label="Предыдущий кадр">${icon('chevron-left',18)}</button><span data-lens-count></span><button class="icon-button" type="button" data-lens-step="1" aria-label="Следующий кадр">${icon('chevron-right',18)}</button></div>`:''}</div></div>`,{wide:true, onClose: stopVideoLoupe});
  const stage=box.querySelector('.dt-loupe-stage'), plane=box.querySelector('.dt-loupe-plane'), photo=plane.querySelector('img'), layer=plane.querySelector('canvas');
  const range=box.querySelector('input[type=range]'), output=box.querySelector('output'), toggle=box.querySelector('[data-lens-original]');
  const vTools=box.querySelector('[data-lens-video-tools]'), vPlay=box.querySelector('[data-lens-vplay]'), vMute=box.querySelector('[data-lens-vmute]');
  function mediaRatio() {
    if (currentIsVideo && videoEl?.videoHeight) return videoEl.videoWidth / videoEl.videoHeight;
    return photo.naturalHeight ? photo.naturalWidth / photo.naturalHeight : 1;
  }
  function position() {
    const ratio=mediaRatio();
    const iw=Math.min(stage.clientWidth,stage.clientHeight*ratio), ih=iw/ratio;
    const maxX=Math.max(0,(iw*zoom-stage.clientWidth)/2), maxY=Math.max(0,(ih*zoom-stage.clientHeight)/2);
    dx=clamp(dx,-maxX,maxX);dy=clamp(dy,-maxY,maxY);
    plane.style.width=`${iw}px`;plane.style.height=`${ih}px`;
    plane.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(${zoom})`;
    stage.classList.toggle('can-pan',zoom>1); output.value=`${Number(zoom.toFixed(1))}×`;
  }
  const compare=()=>{
    layer.hidden=original;
    if (currentIsVideo && videoEl) {
      photo.style.visibility='hidden';
      videoEl.style.visibility=original?'visible':'hidden';
    } else {
      photo.style.visibility=original?'visible':'hidden';
    }
    toggle.innerHTML=`${icon(original?'image':'layers',17)} ${original?'Оригинал':'Арт-слой'}`;
    toggle.setAttribute('aria-pressed',String(original));
    toggle.title=original?'Показать обработку':'Показать оригинал';
  };
  function updateVideoButtons() {
    if (!videoEl) return;
    vPlay.innerHTML = `${icon(videoEl.paused ? 'play' : 'pause', 15)} ${videoEl.paused ? 'Играть' : 'Пауза'}`;
    vMute.innerHTML = `${icon('volume-2', 15)} ${videoEl.muted ? 'Вкл. звук' : 'Выкл. звук'}`;
  }
  function load() {
    stopVideoLoupe();
    const seq=++request, item=day.photos[index];zoom=1;dx=dy=0;range.value=1;original=false;
    currentIsVideo = isVideoItem(item);
    vTools.hidden = !currentIsVideo;
    box.querySelector('[data-lens-file]').textContent=item.name;
    if(box.querySelector('[data-lens-count]')) box.querySelector('[data-lens-count]').textContent=`${index+1} / ${day.photos.length}`;
    if (currentIsVideo) {
      photo.style.visibility='hidden';
      const vid = document.createElement('video');
      vid.loop = true; vid.playsInline = true; vid.muted = true; vid.crossOrigin = 'anonymous'; vid.preload = 'auto';
      if (item.poster) vid.poster = item.poster;
      plane.insertBefore(vid, layer);
      videoEl = vid;
      vid.onloadeddata = () => {
        if (seq !== request || !box.isConnected) return;
        const k = Math.min(1, 1280 / Math.max(vid.videoWidth || 1, vid.videoHeight || 1));
        layer.width = Math.max(1, Math.round((vid.videoWidth || 640) * k));
        layer.height = Math.max(1, Math.round((vid.videoHeight || 480) * k));
        liveShader = shaderSurface();
        const lctx = layer.getContext('2d');
        position(); compare();
        vid.play().catch(() => {});
        updateVideoButtons();
        const started = performance.now();
        const renderVideo = now => {
          if (seq !== request || !box.isConnected || videoEl !== vid) return;
          if (!original && vid.readyState >= 2) {
            let art = null;
            try { art = liveShader?.draw(vid, layer.width, layer.height, (now - started) / 1000, 0, recipe); } catch {}
            if (art) lctx.drawImage(art, 0, 0);
            else { lctx.drawImage(vid, 0, 0, layer.width, layer.height); drawWeather(lctx, layer.width, layer.height, weatherIndex(recipe), (now - started) / 1000, 0); }
          }
          raf = requestAnimationFrame(renderVideo);
        };
        raf = requestAnimationFrame(renderVideo);
      };
      vid.onerror = () => toast('Не удалось загрузить видео.');
      vid.src = item.src;
      vid.load();
      return;
    }
    photo.onload=()=>{
      if(seq!==request || !box.isConnected) return;
      const k=Math.min(1,2000/Math.max(photo.naturalWidth,photo.naturalHeight));layer.width=Math.max(1,Math.round(photo.naturalWidth*k));layer.height=Math.max(1,Math.round(photo.naturalHeight*k));
      const ctx=layer.getContext('2d');const shader=shaderSurface();let art;
      try { art=shader?.draw(photo,layer.width,layer.height,0,0,recipe); if(art) ctx.drawImage(art,0,0); } catch {} finally { shader?.dispose(); }
      if(!art){ctx.drawImage(gradePhoto(photo),0,0,layer.width,layer.height);drawWeather(ctx,layer.width,layer.height,weatherIndex(recipe),0,0);}
      position();compare();
    };
    photo.onerror=()=>toast('Не удалось загрузить фотографию.');photo.crossOrigin='anonymous';photo.src=item.src;photo.alt=item.name;
    layer.hidden=true;photo.style.visibility='visible';
  }
  vPlay.onclick = () => { if (!videoEl) return; if (videoEl.paused) videoEl.play().catch(() => {}); else videoEl.pause(); updateVideoButtons(); };
  vMute.onclick = () => { if (!videoEl) return; videoEl.muted = !videoEl.muted; if (!videoEl.muted) stopTrack(); updateVideoButtons(); };
  toggle.onclick=()=>{original=!original;compare();};range.oninput=()=>{zoom=Number(range.value);position();};
  stage.onwheel=e=>{e.preventDefault();zoom=clamp(zoom+(e.deltaY<0?.2:-.2),1,4);range.value=zoom;position();};
  stage.onpointerdown=e=>{if(zoom<=1)return;drag={x:e.clientX,y:e.clientY,dx,dy};stage.setPointerCapture(e.pointerId);};
  stage.onpointermove=e=>{if(!drag)return;dx=drag.dx+e.clientX-drag.x;dy=drag.dy+e.clientY-drag.y;position();};
  stage.onpointerup=stage.onpointercancel=()=>{drag=null;};
  stage.onkeydown=e=>{const delta={ArrowLeft:[35,0],ArrowRight:[-35,0],ArrowUp:[0,35],ArrowDown:[0,-35]}[e.key];if(delta){e.preventDefault();dx+=delta[0];dy+=delta[1];position();}};
  box.querySelectorAll('[data-lens-step]').forEach(button=>button.onclick=()=>{index=(index+Number(button.dataset.lensStep)+day.photos.length)%day.photos.length;load();});
  const observer=new ResizeObserver(()=>{ if(box.isConnected)position();else observer.disconnect(); });observer.observe(stage);
  load();
}

function xray(day,recipe) {
  const density = recipe.textSignals.socialDensity;
  const story = density < .23 ? 'Уединение в рассказе' : density > .72 ? 'Люди в рассказе' : 'Ритм и масштаб рассказа';
  const interval = secondsLabel(recipe);
  const entries=[
    ['layout','Композиция контактного листа',recipe.explanation.composition],
    ['image','Цвет снимков',recipe.explanation.color],
    ['layers','Фактура и звуковой автограф',recipe.explanation.texture],
    ['headphones','Ритм и фокус по биту',recipe.explanation.rhythm],
    ['sun','Погода',recipe.explanation.weather],
    ...(day.voice ? [['volume-2','Голос',recipe.explanation.voice]] : [])
  ];
  const paletteRow=(label,colors)=>`<div><span>${label}</span><div class="dt-swatches">${paletteHTML(colors)}</div></div>`;
  const techniques=(recipe.artTechniques || []).map(item=>`<span title="${esc(item.ref)}">${esc(item.name)} · <em>${esc(item.ref)}</em></span>`).join('');
  modal('Почему день выглядит так?',`<div class="dt-xray"><dl class="dt-proof">
    <div><dt>${icon('file-text',16)} Текст → поля</dt><dd>${story} · поля ${percent(recipe.whitespace)}</dd></div>
    <div><dt>${icon('image',16)} Фото → цвет</dt><dd class="dt-palette-proof">${paletteRow('Из снимков',recipe.basePalette)}${paletteRow('На открытке',recipe.palette)}</dd></div>
    <div><dt>${icon('waveform',16)} Музыка → ритм</dt><dd>${recipe.bpm ? recipe.bpm+' BPM' : 'Базовый темп'} · ${day.photos.length>1?'смена фокуса':'длина фразы'} ${interval} с</dd></div>
  </dl><details class="dt-proof-details"><summary>Подробнее об оформлении</summary><div class="dt-xray-mood"><div><span>Интонация дня</span><strong>${esc(moods[day.mood]?.label || day.mood)}</strong></div><div class="dt-axes"><label>Поля <b>${percent(recipe.whitespace)}</b></label><i style="--amount:${percent(recipe.whitespace)}"></i><label>Плотность линий <b>${percent(recipe.geometry)}</b></label><i style="--amount:${percent(recipe.geometry)}"></i></div></div>
    ${techniques?`<div class="dt-xray-techniques" aria-label="Активные художественные приёмы">${techniques}</div>`:''}
    ${entries.map(([name,label,detail])=>`<section class="dt-xray-row"><div class="dt-xray-icon">${icon(name,19)}</div><div><h3>${label}</h3><p>${esc(detail)}</p></div></section>`).join('')}</details></div>`);
}

function download(blob,filename) {
  const url=URL.createObjectURL(blob), anchor=document.createElement('a');
  anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
const filename = day => `${day.date} ${day.title.replace(/[<>:"/\\|?*\x00-\x1F]/g,'').slice(0,75)}`;
function external(url) {try {const resolved=new URL(url);return ['https:','http:'].includes(resolved.protocol)?resolved.href:'';}catch{return '';}}
function clockValue(seconds) {return `0:${String(Math.max(0,Math.floor(seconds))).padStart(2,'0')}`;}

const secondsLabel = recipe => (recipe.intervalMs / 1000).toLocaleString('ru', { maximumFractionDigits: 1 });

function comparisonStrip() {
  return `<section class="dt-compare" aria-label="Сравнение музыки">
    <button class="dt-compare-toggle" type="button" data-act="compare" aria-expanded="false" aria-controls="dt-comparison">${icon('waveform',18)} Сравнить музыку ${icon('chevron-down',15)}</button>
    <div id="dt-comparison" hidden><p class="dt-compare-hint">Переключайте этюды. Сохраните тот, который подходит этому дню.</p>
      <div class="dt-studies" data-studies role="group" aria-label="Два варианта звучания"></div>
      <p class="dt-compare-result" role="status" data-comparison-result></p>
      <div class="dt-compare-actions"><button type="button" class="button primary" data-act="save-track">Сохранить этот трек</button><button type="button" class="dt-text-action" data-act="audition"></button><button type="button" class="dt-text-action" data-act="cancel-track">Отменить</button></div>
    </div></section>`;
}

function trackBody(day,readOnly,recipe,previewing=false) {
  const track=day.track || {}, spotify=spotifyLinks(track), url=spotify?.url || external(track.url), metadata=[];
  if(spotify) metadata.push(spotify.automatic?'Автоподбор из Spotify':'Ваша ссылка на Spotify');
  else if(track.kind==='ambient') metadata.push('Генеративная композиция');
  else if(track.kind==='preview') metadata.push('Фрагмент из каталога');
  else if(track.kind==='file') metadata.push(track.studyId?'Этюд DayTrace':'Аудиофайл');
  else if(track.kind==='link') metadata.push('Ваша ссылка');
  metadata.push(tempoLabel(track));
  if(track.mode==='major'||track.mode==='minor')metadata.push(track.mode==='major'?'Мажор':'Минор');
  const env = recipe?.envelope || Array.from({length:44},(_,i)=>Math.abs(Math.sin(i*1.43)*Math.sin(.38*i+.45)));
  const waves=env.slice(0,44).map(v=>`<i style="--height:${18+Math.round(78*v)}%"></i>`).join('');
  const playable=!spotify && (track.kind==='ambient'||Boolean(track.src));
  return `<section class="dt-sound"><div class="dt-section-title">${icon('headphones',17)}<h2>Звук дня</h2></div>
  <div class="dt-track"><div class="dt-sleeve" style="--cover-one:${cssColor(day.palette?.[0])};--cover-two:${cssColor(day.palette?.[2])}"><div></div></div><div><h3>${esc(track.title||'Музыка дня')}</h3><p>${esc(track.artist||'DayTrace')}</p></div></div>
  ${playable?`<div class="dt-player"><button class="dt-play" type="button" data-act="play" aria-label="Воспроизвести фрагмент">${icon('play',18)}</button><div class="dt-wave" data-wave role="slider" aria-label="Перемотка трека" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">${waves}</div><output data-time>0:00</output></div>`:''}
  ${spotify?`<div data-spotify-player><div data-spotify-frame></div><p class="dt-spotify-status" role="status">Запускаем Spotify…</p></div>`:''}
  <p class="dt-track-meta">${metadata.map(esc).join(' · ')}</p>${track.reason?`<p class="dt-reason">${esc(track.reason)}</p>`:''}
  ${url||!readOnly?`<div class="dt-track-links">${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${spotify?'Открыть в Spotify':'Открыть трек'} ${icon('external-link',14)}</a>`:''}${readOnly?'':`<button type="button" data-act="reroll" ${previewing?'hidden':''}>${icon('refresh-cw',14)} Подобрать другой трек</button>`}</div>`:''}</section>`;
}

function tabPanel(day, name) {
  if(name==='photos') return `<div class="dt-thumbs">${day.photos.map((photo,i)=>{
    const vid = isVideoItem(photo);
    const preview = vid && !photo.poster
      ? `<video src="${esc(photo.src)}" muted preload="metadata" playsinline></video>`
      : `<img src="${esc(photo.poster || photo.src)}" alt="${esc(photo.name)}" loading="lazy">`;
    return `<button type="button" data-photo="${i}" aria-label="Рассмотреть ${vid ? 'видео' : 'фото'} ${i+1}">${preview}${vid ? '<em>▶</em>' : ''}<span>${icon('zoom-in',16)}</span></button>`;
  }).join('')}</div>`;
  if(name==='files') {
    const path=src=>String(src).split('/').slice(-2).map(segment=>{try{return decodeURIComponent(segment);}catch{return segment;}}).join('/');
    const mediaFiles = day.photos.flatMap(photo => {
      const vid = isVideoItem(photo);
      return [[vid ? 'film' : 'image', path(photo.src)], ...(photo.poster ? [['image', path(photo.poster)]] : [])];
    });
    const list=[['file-text','entry.txt'],['file-text','memory.json'],['file-text','memory.html'],...mediaFiles,...(day.track?.kind==='file'?[['music',path(day.track.src)]]:[]),...(day.voiceSrc?[['volume-2','voiceover.wav']]:[])];
    return `<ul class="dt-file-list">${list.map(([name,text])=>`<li>${icon(name,16)}${esc(text)}</li>`).join('')}</ul>`;
  }
  return `<div class="dt-entry-text">${esc(day.text)}</div>`;
}

export async function renderDay(root, savedDay, {readOnly=false, back='/', days=[savedDay], extraDays=0, onPickDay}={}) {
  cleanupDay();stopTrack();
  const day = { ...savedDay };
  let studies, comparison = null, savingTrack = false;
  let index=0, speaking=false, voiceAudio=null, voiceSequence=0, live=true, rerolling=false, recorder=null, recordStream=null, clipTimer, clockFrame=0, capturing=false, clipDeadline=0, preferSilent=false, hasRevealedAudio=false;
  const signals=new AbortController();
  let recipe=buildVisualRecipe(day);

  function applyBackdrop(nextRecipe) {
    document.body.classList.add('in-day');
    document.body.style.setProperty('--day-bg', nextRecipe.backdrop);
    document.body.style.setProperty('--day-surface', nextRecipe.backdropSurface);
    document.body.style.setProperty('--day-accent', nextRecipe.backdropAccent);
    document.body.style.setProperty('--day-paper', nextRecipe.paper);
    document.body.style.setProperty('--day-frame', nextRecipe.sheetBg);
    document.body.style.setProperty('--day-border', nextRecipe.frameBorder);
  }
  applyBackdrop(recipe);

  const dayNumber = String(Math.max(1, days.findIndex(item => item.id === day.id) + 1)).padStart(2, '0');
  const placardIndex = () => [
    `№ ${dayNumber}`,
    stamp(day.date),
    recipe.bpm ? `${Math.round(recipe.bpm)} BPM` : 'БЕЗ ТЕМПА',
    recipe.weatherLabel.toUpperCase()
  ].join(' · ');

  const initialFade=archivePatina(day.date,extraDays).toFixed(4);
  const clipHasSound=()=>!spotifyLinks(day.track) && ['ambient','file'].includes(day.track?.kind);
  const clipLabel=()=>clipHasSound()?'Видео · 15 с':'Видео · 15 с без звука';
  root.innerHTML=`<article class="dt-page"><div data-weather-layer aria-hidden="true"></div><div class="dt-day-nav">${back?`<button class="dt-back" type="button" data-act="back">${icon('arrow-left',17)} ${readOnly && back==='/'?'На главную':'В архив'}</button>`:''}
  ${readOnly?'':`<div class="dt-day-actions"><button class="button secondary" type="button" data-act="share">${icon('share',16)} Поделиться</button><a class="button secondary" href="/api/days/${encodeURIComponent(day.id)}/zip" download>${icon('download',16)} Скачать ZIP</a></div>`}</div>
  <header class="dt-heading"><p class="dt-placard" data-placard>${esc(placardIndex())}</p><h1>${esc(day.title)}</h1></header>
  <div class="dt-layout"><section class="dt-art-column" style="--fade:${initialFade}" aria-label="Архивный контактный лист дня"><div data-deck></div>${readOnly?'':comparisonStrip()}<div class="dt-stage"><canvas class="patina-card" role="img" aria-label="${esc(day.coverText || day.quote || day.title)}"></canvas><button class="dt-motion" type="button" data-act="motion" disabled></button>${day.photos.length>1?'<div class="dt-shot-progress" aria-hidden="true"></div>':''}<div class="dt-image-error" hidden>Фотография недоступна</div></div>
  <div class="dt-under-stage"><div class="dt-stage-tools"><button class="dt-text-action" type="button" data-act="loupe">${icon('zoom-in',17)} Рассмотреть фото</button><button class="dt-text-action" type="button" data-act="reveal" title="Повторить проявку памяти">${icon('refresh-cw',15)} Проявить заново</button></div>${day.photos.length>1?`<div class="dt-photo-index"><button class="icon-button" type="button" data-step="-1" aria-label="Предыдущее фото">${icon('chevron-left',16)}</button><span data-index>1 / ${day.photos.length}</span><button class="icon-button" type="button" data-step="1" aria-label="Следующее фото">${icon('chevron-right',16)}</button></div>`:''}</div>
  </section><aside class="dt-sidebar"><div class="dt-meta-panel"><div class="dt-section-title">${icon('layers',17)}<h2>Атмосфера дня</h2></div>
  <div class="dt-meta-line"><span>Погода</span><button class="dt-weather-replay" data-act="weather" type="button" title="Повторить погоду дня" aria-label="Повторить погоду дня · ${esc(recipe.weatherLabel)}">${esc(recipe.weatherLabel)} ${icon('refresh-cw',13)}</button></div><div class="dt-meta-line"><span>Площадь полей</span><strong data-print-space>${percent(recipe.whitespace)}</strong></div>
  <div class="dt-meta-line"><span>Палитра открытки</span><div class="dt-swatches" data-print-palette>${paletteHTML(recipe.palette)}</div></div>
  <button type="button" class="dt-xray-button" data-act="xray">${icon('scan',17)} Почему день выглядит так?</button></div>
  <div data-sound>${trackBody(day,readOnly,recipe)}</div>
  ${day.voice && (day.voiceSrc || 'speechSynthesis' in window)?`<button type="button" class="dt-voice" data-act="voice">${icon('volume-2',18)} <span>Послушать запись</span></button>`:''}
  ${readOnly?'':`<div class="dt-export"><div class="dt-section-title"><h2>Сохранить открытку</h2></div><div class="dt-export-actions"><button class="button secondary" type="button" data-act="png">${icon('image',16)} PNG</button><button class="button secondary" type="button" data-act="clip">${icon('film',16)} <span>${clipLabel()}</span></button></div><p role="status" data-record-status hidden></p></div>`}
  </aside></div><section class="dt-folder"><div class="dt-section-title">${icon('folder',19)}<h2>В папке дня</h2></div>
  <div class="dt-tabs" role="tablist" aria-label="Содержимое папки">${[['text','Текст записи'],['photos',`Оригиналы · ${day.photos.length}`],['files','Файлы']].map(([key,label],i)=>`<button type="button" id="dt-tab-${key}" role="tab" aria-controls="dt-tab-panel" aria-selected="${!i}" tabindex="${i?-1:0}" data-tab="${key}">${label}</button>`).join('')}</div>
  <div id="dt-tab-panel" class="dt-tab-panel" role="tabpanel" aria-labelledby="dt-tab-text">${tabPanel(day,'text')}</div></section></article>`;

  const find=q=>root.querySelector(q);
  let spotifyPlayer;
  function mountDayMusic() {
    const host = find('[data-spotify-player]');
    if (host) spotifyPlayer = mountSpotifyPlayer(host, day.track, spotifyLinks(day.track));
  }
  mountDayMusic();
  const deckHost=find('[data-deck]');
  deckHost.classList.add('patina-card');
  const weatherHost=find('[data-weather-layer]');
  let weather=mountDayWeather(weatherHost,day,recipe);
  const deck=mountDeck(deckHost,{day,days,readOnly,onPickDay,onPickPhoto:showPhoto});
  const canvas=find('.dt-stage canvas');
  const motionButton=find('[data-act=motion]');
  const shotProgress=find('.dt-shot-progress');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let colorReveal=[];
  function revealPostcard(){
    if(!canvas.classList.contains('patina-card'))return;
    const archived=getComputedStyle(canvas).filter;
    for(const surface of [canvas,deckHost]){
      surface.classList.remove('patina-card');
      if(!reduce.matches && surface.animate){
        colorReveal.push(surface.animate([{filter:archived},{filter:'none'}],{
          duration:1900, delay:80, fill:'backwards', easing:'ease-out'
        }));
      }
    }
  }
  async function scrubTo(fraction) {
    if (!clipHasSound()) return;
    try {
      if (playingDay() === day.id) {
        await seekTrack(fraction);
      } else {
        await playTrack(day, musicState, { offsetSeconds: fraction * 24, reveal: false });
        musicState();
      }
    } catch {}
  }
  const art=scene(canvas,day,{
    dayNumber, reducedMotion:reduce, initialRecipe:recipe,
    onPhoto(selected){
      revealPostcard();
      index=selected;
      deck.selectPhoto(index);
      const counter=find('.dt-photo-index [data-index]');
      if(counter)counter.textContent=`${index+1} / ${day.photos.length}`;
      find('.dt-image-error').hidden=true;
      motionButton.disabled=capturing;
    },
    onProgress(p){shotProgress?.style.setProperty('--shot-progress',String(p));},
    onScrub: scrubTo,
    onBands({ high }) { weather?.setHighBoost?.(high); },
    onCursorMove(x, y, active) { weather?.setCursor?.(x, y, active); },
    onOpenLoupe(slotIndex) { openLoupe(day, slotIndex, recipe); }
  });
  function motionState(){
    const playing=art.playing;
    motionButton.innerHTML=`<span>${playing?'Живой кадр':'На паузе'}</span>${icon(playing?'pause':'play',13)}`;
    motionButton.dataset.playing=String(playing);
    motionButton.setAttribute('aria-label',playing?'Поставить анимацию на паузу':'Воспроизвести анимацию');
  }
  function setMotion(playing){art.setPlaying(playing);motionState();}
  motionState();
  reduce.addEventListener('change',event=>{
    if(event.matches)colorReveal.forEach(animation=>animation.cancel());
    setMotion(!event.matches);
  },{signal:signals.signal});
  function musicState(){
    if(!live)return;
    const active=playingDay()===day.id, button=find('[data-act=play]');
    if(button){button.innerHTML=icon(active?'pause':'play',18);button.setAttribute('aria-label',active?'Остановить фрагмент':'Воспроизвести фрагмент');}
    find('.dt-player')?.classList.toggle('is-playing',active);
    const audition=find('[data-act=audition]');
    if(audition && comparison){
      audition.hidden=!clipHasSound();
      audition.innerHTML=icon(active?'pause':'play',14)+(active?' Пауза':' Послушать');
    }
  }
  async function startRevealRitual({ forceReplay = false } = {}) {
    if (forceReplay) {
      art.replayReveal();
      weather.destroy();
      weather = mountDayWeather(weatherHost, day, recipe);
    }
    if (!clipHasSound()) return;
    try {
      const ok = await playTrack(day, musicState, { reveal: !reduce.matches });
      if (ok && live) { hasRevealedAudio = true; musicState(); }
    } catch {}
  }
  async function showPhoto(i){
    const ok=await art.select((i+day.photos.length)%day.photos.length);
    if(live && ok===false && !art.ready){
      find('.dt-image-error').hidden=false;
      revealPostcard();
    }
  }
  function setTab(key){
    root.querySelectorAll('[data-tab]').forEach(btn=>{const active=btn.dataset.tab===key;btn.setAttribute('aria-selected',String(active));btn.tabIndex=active?0:-1;});
    const panel=find('[role=tabpanel]');panel.innerHTML=tabPanel(savedDay,key);panel.setAttribute('aria-labelledby',`dt-tab-${key}`);
  }
  let voiceCtx=null, voiceTimer=0;
  function resetVoice(){
    speaking=false;setDucking(false);const btn=live&&find('[data-act=voice] span');if(btn)btn.textContent='Послушать запись';
  }
  function stopVoice(){
    ++voiceSequence;
    clearTimeout(voiceTimer);voiceTimer=0;
    if(voiceAudio){voiceAudio.onended=voiceAudio.onerror=null;voiceAudio.pause();voiceAudio.removeAttribute('src');voiceAudio.load();voiceAudio=null;}
    if(voiceCtx){voiceCtx.close().catch(()=>{});voiceCtx=null;}
    if(speaking)window.speechSynthesis?.cancel();resetVoice();
  }
  function loadBrowserVoices(){
    if(!window.speechSynthesis)return Promise.resolve([]);
    const ready=speechSynthesis.getVoices();
    if(ready.length)return Promise.resolve(ready);
    return new Promise(resolve=>{
      let settled=false;
      const done=()=>{if(settled)return;settled=true;speechSynthesis.removeEventListener?.('voiceschanged',done);resolve(speechSynthesis.getVoices());};
      speechSynthesis.addEventListener?.('voiceschanged',done,{once:true});
      setTimeout(done,350);
    });
  }
  function pickRussianVoice(voices, preferMale, neuralOnly){
    const ru=voices.filter(v=>/^ru\b/i.test(v.lang||''));
    if(!ru.length)return null;
    const isNeural=v=>/natural|neural|online|google|siri|milena|katya|yuri/i.test(v.name||'');
    const isMale=v=>/dmitry|pavel|yuri|maxim|filipp|ermil|male/i.test(v.name||'');
    const isFemale=v=>/svetlana|dariya|irina|milena|katya|alena|jane|tatyana|female/i.test(v.name||'');
    const matchGender=v=>preferMale?isMale(v):isFemale(v);
    const pool=neuralOnly?ru.filter(isNeural):ru;
    if(!pool.length)return null;
    return pool.find(v=>/natural|neural|online/i.test(v.name||'') && matchGender(v))
      || pool.find(v=>/natural|neural|online/i.test(v.name||''))
      || pool.find(v=>/google/i.test(v.name||'') && matchGender(v))
      || pool.find(v=>/google/i.test(v.name||''))
      || pool.find(matchGender)
      || pool[0];
  }
  function splitSpeechChunks(text, maxLen=190){
    const clean=String(text||'').replace(/\s+/g,' ').trim();
    if(!clean)return [];
    const sentences=clean.split(/(?<=[.!?…])\s+/u).filter(Boolean);
    const chunks=[];
    for(const sentence of sentences){
      if(sentence.length<=maxLen){chunks.push(sentence);continue;}
      let rest=sentence;
      while(rest.length>maxLen){
        let cut=rest.lastIndexOf(',',maxLen);
        if(cut<maxLen*0.45)cut=rest.lastIndexOf(' ',maxLen);
        if(cut<20)cut=maxLen;
        chunks.push(rest.slice(0,cut+1).trim());
        rest=rest.slice(cut+1).trim();
      }
      if(rest)chunks.push(rest);
    }
    return chunks;
  }
  function buildRoomImpulse(ctx, seconds=0.42){
    const length=Math.max(1,Math.floor(ctx.sampleRate*seconds));
    const impulse=ctx.createBuffer(2,length,ctx.sampleRate);
    for(let ch=0;ch<2;ch++){
      const data=impulse.getChannelData(ch);
      let prev=0, seed=1337+ch*7919;
      for(let i=0;i<length;i++){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        const white=(seed/0xffffffff)*2-1;
        prev=prev*0.72+white*0.28;
        const env=Math.pow(1-i/length,2.8);
        data[i]=prev*env*0.42;
      }
    }
    return impulse;
  }
  async function say(){
    if(speaking){stopVoice();return;}
    spotifyPlayer?.pause();
    const seq=++voiceSequence;
    speaking=true;setDucking(true);find('[data-act=voice] span').textContent='Остановить голос';
    const preferMale=recipe.voice?.gender==='male';
    const speakBrowser=(voice, onFail)=>{
      if(!live || seq!==voiceSequence)return;
      if(!window.speechSynthesis){onFail?onFail():(resetVoice(),toast('Голос недоступен в этом браузере.'));return;}
      const chunks=splitSpeechChunks(day.text || day.quote);
      if(!chunks.length){resetVoice();return;}
      speechSynthesis.cancel();
      let idx=0;
      const nextChunk=()=>{
        if(!live || seq!==voiceSequence)return;
        if(idx>=chunks.length){resetVoice();return;}
        const utterance=new SpeechSynthesisUtterance(chunks[idx++]);
        utterance.lang='ru-RU';
        if(voice)utterance.voice=voice;
        utterance.rate=clamp(recipe.voice?.rate || 0.94, 0.84, 1.12);
        utterance.pitch=clamp(recipe.voice?.pitch || 0.98, 0.90, 1.04);
        utterance.volume=0.96;
        utterance.onend=()=>{
          if(seq!==voiceSequence)return;
          if(idx>=chunks.length){resetVoice();return;}
          voiceTimer=setTimeout(nextChunk,220);
        };
        utterance.onerror=e=>{
          if(seq!==voiceSequence)return;
          if(['canceled','interrupted'].includes(e.error))return;
          if(onFail){onFail();return;}
          resetVoice();
          if(live)toast('Голос недоступен в этом браузере.');
        };
        speechSynthesis.speak(utterance);
      };
      nextChunk();
    };
    const playMasteredFile=fallbackVoice=>{
      if(!live || seq!==voiceSequence)return;
      if(!day.voiceSrc){speakBrowser(fallbackVoice);return;}
      const file=new Audio(day.voiceSrc);file.crossOrigin='anonymous';voiceAudio=file;
      const AudioCtx=window.AudioContext || window.webkitAudioContext;
      if(AudioCtx){
        try {
          const ctx=new AudioCtx();voiceCtx=ctx;
          const src=ctx.createMediaElementSource(file);
          const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=85;
          const warmth=recipe.voice?.warmth ?? .65;
          const body=ctx.createBiquadFilter();body.type='peaking';body.frequency.value=215;body.Q.value=0.9;body.gain.value=2.6;
          const soften=ctx.createBiquadFilter();soften.type='peaking';soften.frequency.value=2800;soften.Q.value=1.1;soften.gain.value=-1.8;
          const deEss=ctx.createBiquadFilter();deEss.type='peaking';deEss.frequency.value=5800;deEss.Q.value=2.2;deEss.gain.value=-4.5;
          const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.round(6200-warmth*2400);
          const comp=ctx.createDynamicsCompressor();
          comp.threshold.value=-18;comp.knee.value=16;comp.ratio.value=2.6;comp.attack.value=0.012;comp.release.value=0.18;
          const dry=ctx.createGain();dry.gain.value=0.92;
          const wet=ctx.createGain();wet.gain.value=0.11;
          const reverb=ctx.createConvolver();reverb.buffer=buildRoomImpulse(ctx,0.42);
          const master=ctx.createGain();
          master.gain.setValueAtTime(0.001,ctx.currentTime);
          master.gain.exponentialRampToValueAtTime(1.0,ctx.currentTime+0.16);
          src.connect(hp);hp.connect(body);body.connect(soften);soften.connect(deEss);deEss.connect(lp);lp.connect(comp);
          comp.connect(dry);dry.connect(master);
          comp.connect(reverb);reverb.connect(wet);wet.connect(master);
          master.connect(ctx.destination);
        } catch { if(voiceCtx){voiceCtx.close().catch(()=>{});voiceCtx=null;} }
      }
      const failed=()=>{if(voiceAudio!==file)return;voiceAudio=null;file.onended=file.onerror=null;if(voiceCtx){voiceCtx.close().catch(()=>{});voiceCtx=null;}speakBrowser(fallbackVoice);};
      file.onended=()=>{if(voiceAudio===file){voiceAudio=null;if(voiceCtx){voiceCtx.close().catch(()=>{});voiceCtx=null;}resetVoice();}};file.onerror=failed;
      Promise.resolve(voiceCtx?.resume?.()).then(()=>file.play()).catch(failed);
    };
    const voices=await loadBrowserVoices();
    if(!live || seq!==voiceSequence)return;
    const neural=pickRussianVoice(voices,preferMale,true);
    const anyRu=pickRussianVoice(voices,preferMale,false);
    if(neural){
      speakBrowser(neural,()=>playMasteredFile(anyRu));
    } else {
      playMasteredFile(anyRu);
    }
  }
  function refreshSound() {
    spotifyPlayer?.destroy(); spotifyPlayer=null;
    find('[data-sound]').innerHTML=trackBody(day,readOnly,recipe,Boolean(comparison));
    mountDayMusic();
    find('[data-act=clip] span').textContent=clipLabel();
    musicState();
  }
  function applyTrack(track) {
    stopTrack();
    if(speaking)stopVoice();
    day.track=track;
    recipe=buildVisualRecipe(day);
    applyBackdrop(recipe); art.setRecipe(recipe);
    find('[data-placard]').textContent=placardIndex();
    find('[data-print-palette]').innerHTML=paletteHTML(recipe.palette);
    find('[data-print-space]').textContent=percent(recipe.whitespace);
    weather.setSpeed(recipe.particleSpeed);
    refreshSound();
  }
  function revealComparison(open) {
    find('#dt-comparison').hidden=!open;
    find('[data-act=compare]').setAttribute('aria-expanded',String(open));
    if(!open)find('[data-act=compare]').focus({preventScroll:true});
  }
  async function audition(track) {
    if(!comparison || savingTrack || capturing)return;
    const position=playingDay()===day.id ? elapsedSeconds() : comparison.position;
    comparison.position=position;
    applyTrack(track);
    for(const option of root.querySelectorAll('[data-study]'))option.setAttribute('aria-pressed',String(option.dataset.study===track.studyId));
    const other=track.studyId && studies.find(study=>study.studyId!==track.studyId);
    const reference=other ? buildVisualRecipe({...day,track:other}) : comparison.baseline;
    const lineDelta=recipe.geometry-reference.geometry;
    const soundEffect=Math.abs(lineDelta)<.025 ? 'Плотность линий близка к исходной.'
      : lineDelta>0 ? 'Выраженный бит делает линии плотнее.' : 'Более мягкий бит оставляет линии свободнее.';
    const timing=day.photos.length>1 ? 'Смена фокуса' : 'Музыкальная фраза';
    find('[data-comparison-result]').textContent=`${soundEffect} ${timing} · ${secondsLabel(recipe)} с. Поля · ${percent(recipe.whitespace)}.`;
    if(clipHasSound()){
      await playTrack(day,musicState,{offsetSeconds:position});
      if(live)musicState();
    }
  }
  async function openComparison(autoPick=false) {
    if(readOnly||rerolling||comparison||capturing)return;
    rerolling=true;
    find('[data-act=compare]').disabled=true;
    const reroll=find('[data-act=reroll]');
    if(reroll)reroll.disabled=true;
    try {
      studies ??= await api('/api/music/studies',{signal:signals.signal});
      if(!studies.length && !autoPick)throw Error('Этюды недоступны.');
      const track=autoPick ? await pickTrack(day,day.track,signals.signal) : studies[0];
      if(!live||capturing)return;
      const position=elapsedSeconds();
      comparison={baseline:recipe, originalPosition:position, position, wasPlaying:playingDay()===day.id};
      find('[data-studies]').innerHTML=studies.map(study=>`<button type="button" data-study="${esc(study.studyId)}" aria-pressed="false"><strong>${esc(study.title)}</strong><small>${esc(study.bpm)} BPM · ${study.mode==='major'?'мажор':'минор'}</small></button>`).join('');
      revealComparison(true);
      const firstOption=find('[data-study]');
      if(firstOption)firstOption.focus({preventScroll:!autoPick});
      await audition(track);
    } finally {
      rerolling=false;
      if(live){find('[data-act=compare]').disabled=false;if(reroll?.isConnected)reroll.disabled=false;}
    }
  }
  async function cancelComparison() {
    if(!comparison||savingTrack||capturing)return;
    const {wasPlaying,originalPosition}=comparison;
    comparison=null;
    revealComparison(false);
    applyTrack(savedDay.track);
    if(wasPlaying && clipHasSound())await playTrack(day,musicState,{offsetSeconds:originalPosition});
    if(live)musicState();
  }
  async function saveComparison() {
    if(!comparison||savingTrack||capturing||readOnly)return;
    savingTrack=true;
    const controls=find('#dt-comparison');
    const saveButton=find('[data-act=save-track]');
    saveButton.textContent='Сохраняем…';
    controls.setAttribute('aria-busy','true');
    controls.inert=true;
    try {
      const track=day.track.studyId ? {studyId:day.track.studyId} : day.track;
      const updated=await api(`/api/days/${encodeURIComponent(day.id)}/track`,{method:'PUT',body:{track}});
      savedDay.track=updated.track;
      if(!live)return;
      day.track=updated.track;
      comparison=null;
      revealComparison(false);
      // The preview and saved local file have identical audio. Keep its playhead.
      find('[data-act=reroll]').hidden=false;
      if(find('[data-tab=files]').getAttribute('aria-selected')==='true')setTab('files');
      toast('Трек сохранён в папке дня.');
    } finally {
      savingTrack=false;
      controls.inert=false;
      controls.removeAttribute('aria-busy');
      saveButton.textContent='Сохранить этот трек';
      if(live && comparison)saveButton.focus({preventScroll:true});
    }
  }
  const recordStatus=find('[data-record-status]');
  const recordLock = '[data-act=clip],[data-act=play],[data-act=reroll],[data-act=compare],[data-act=audition],[data-act=cancel-track],[data-act=save-track],[data-study],[data-act=motion],.dt-photo-index [data-step]';
  function endRecordingUI(){
    capturing=false;deckHost.inert=false;art.setRecording(false);clearTimeout(clipTimer);clipDeadline=0;
    recordStream?.getTracks().forEach(t=>t.stop());recordStream=null;
    if(live){for(const btn of root.querySelectorAll(recordLock))btn.disabled=false;
      if(recordStatus)recordStatus.hidden=true;}
  }
  async function clip(){
    if(capturing||readOnly||savingTrack||rerolling)return;
    if(!art.ready){toast('Дождитесь загрузки фотографии.');return;}
    if(typeof MediaRecorder==='undefined'||!canvas.captureStream){toast('Запись видео недоступна в этом браузере. Можно сохранить PNG.');return;}
    capturing=true;deckHost.inert=true;preferSilent=!clipHasSound();
    for(const btn of root.querySelectorAll(recordLock))btn.disabled=true;
    try {
      if(speaking)stopVoice();
      spotifyPlayer?.pause();
      stopTrack(); if(!preferSilent){const ok=await playTrack(day,musicState,{reveal:true});if(!ok||!live){endRecordingUI();return;}musicState();}
      if(!live){endRecordingUI();return;}
      recordStream=canvas.captureStream(24);
      const sound=!preferSilent && recordingAudio();if(sound)recordStream.addTrack(sound.clone());
      const types=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
      const format=types.find(t=>MediaRecorder.isTypeSupported(t));
      recorder=new MediaRecorder(recordStream,format?{mimeType:format}:undefined);const current=recorder, chunks=[];
      current.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      current.onerror=()=>{if(live)toast('Не удалось записать клип.');current.onstop=null;recorder=null;endRecordingUI();stopTrack();};
      current.onstop=()=>{recorder=null;endRecordingUI();stopTrack();if(live && chunks.length){const type=current.mimeType||'video/webm';download(new Blob(chunks,{type}),`${filename(day)}.${type.includes('mp4')?'mp4':'webm'}`);toast('Клип готов.');}};
      art.setRecording(true);current.start();clipDeadline=performance.now()+15000;recordStatus.hidden=false;recordStatus.textContent='Идёт запись…';clipTimer=setTimeout(()=>{if(current.state==='recording')current.stop();},15000);
    }catch(err){recorder=null;endRecordingUI();stopTrack();if(live)toast(err.message || 'Запись видео недоступна.');}
  }
  let lastClock=0;
  function tick(ms){
    if(!live)return;
    if(ms-lastClock>120){
      const active=playingDay()===day.id, p=active?progress():0;
      const time=find('[data-time]');if(time)time.value=clockValue(active?elapsedSeconds():0);
      const wave=find('.dt-wave');
      if(wave){wave.style.setProperty('--progress',`${p*100}%`);wave.setAttribute('aria-valuenow',String(Math.round(p*100)));}
      if(clipDeadline&&recordStatus)recordStatus.textContent=`Записываем ${preferSilent?'без звука ':''}· ${Math.max(0,Math.ceil((clipDeadline-ms)/1000))} с`;
      lastClock=ms;
    }
    clockFrame=requestAnimationFrame(tick);
  }
  root.addEventListener('keydown',event=>{
    if(!event.target.dataset?.tab)return;
    const tabs=[...root.querySelectorAll('[data-tab]')];const from=tabs.indexOf(event.target);
    const next={ArrowRight:(from+1)%tabs.length,ArrowLeft:(from+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
    if(next!==undefined){event.preventDefault();setTab(tabs[next].dataset.tab);tabs[next].focus();}
  },{signal:signals.signal});
  root.addEventListener('click',async event=>{
    const waveEl = event.target.closest('[data-wave]');
    if (waveEl && root.contains(waveEl)) {
      const rect = waveEl.getBoundingClientRect();
      await scrubTo(clamp((event.clientX - rect.left) / Math.max(1, rect.width)));
      return;
    }
    const button=event.target.closest('button');if(!button||!root.contains(button)||deckHost.contains(button))return;
    if(button.dataset.step){await showPhoto(index+Number(button.dataset.step));return;}
    if(button.dataset.photo!==undefined){openLoupe(day,Number(button.dataset.photo),recipe);return;}
    if(button.dataset.tab){setTab(button.dataset.tab);return;}
    try {
      switch(button.dataset.act){
        case 'back':navigate(back);break;
        case 'share':if(!readOnly)await shareDialog(day.id);break;
        case 'xray':xray(day,recipe);break;
        case 'weather':weather.destroy();weather=mountDayWeather(weatherHost,day,recipe);break;
        case 'reveal':await startRevealRitual({ forceReplay: true });break;
        case 'motion':setMotion(!art.playing);break;
        case 'loupe':openLoupe(day,index,recipe);break;
        case 'voice':await say();break;
        case 'audition':
          if(playingDay()===day.id){comparison.position=elapsedSeconds();stopTrack();}
          else await playTrack(day,musicState,{offsetSeconds:comparison.position});
          musicState();break;
        case 'play':
          if(playingDay()===day.id)stopTrack();
          else {
            const firstReveal = !hasRevealedAudio && !reduce.matches;
            if (firstReveal) art.replayReveal();
            await playTrack(day,musicState,{reveal:firstReveal});
            hasRevealedAudio=true;
          }
          musicState();break;
        case 'compare':if(comparison)await cancelComparison();else await openComparison();break;
        case 'cancel-track':await cancelComparison();break;
        case 'save-track':await saveComparison();break;
        case 'reroll':await openComparison(true);break;
        case 'png':if(!art.ready){toast('Дождитесь загрузки фотографии.');break;}art.exportPng(blob=>{if(blob)download(blob,`${filename(day)}.png`);else toast('Не удалось сохранить открытку.');});break;
        case 'clip':await clip();break;
      }
      if(button.dataset.study && comparison)await audition(studies.find(study=>study.studyId===button.dataset.study));
    }catch(err){if(live)toast(err.message||'Не удалось выполнить действие.');}
  },{signal:signals.signal});
  clean=()=>{live=false;signals.abort();colorReveal.forEach(animation=>animation.cancel());spotifyPlayer?.destroy();weather.destroy();deck.destroy();cancelAnimationFrame(clockFrame);art.stop();clearTimeout(clipTimer);
    if(recorder?.state==='recording'){recorder.onstop=null;recorder.stop();}endRecordingUI();stopVoice();stopTrack();};
  clockFrame=requestAnimationFrame(tick);
  const ok = await art.loaded;
  if (live && !ok) { find('.dt-image-error').hidden = false; revealPostcard(); }
  if (live && !comparison && !reduce.matches) startRevealRitual();
}
