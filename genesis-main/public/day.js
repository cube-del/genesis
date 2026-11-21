import { frameComposition } from './composition.js';
import { api, dateLabel, esc, icon, modal, moods, navigate, shareDialog, toast } from './ui.js';
import { audioLevel, elapsedSeconds, playingDay, playTrack, progress, recordingAudio, setDucking, spotifyLinks, stopTrack } from './media.js';
import { mountSpotifyPlayer } from './spotify.js';
import { pickTrack } from './analysis.js';
import { mountDeck } from './deck.js';
import { mountDayWeather, skyFor } from './weather.js';
import { archivePatina } from './patina.js';
import { drawPostcardDesign } from './postcard.js';
import { photoInterval, rhythmDescription, tempoLabel } from './rhythm.js';

const looks = {
  calm: { index: 0, name: 'Тихий минимализм', filter: 'saturate(.80) contrast(.96)' },
  joy: { index: 1, name: 'Световой этюд', filter: 'saturate(1.10) contrast(.96) brightness(1.04)' },
  dream: { index: 2, name: 'Плёночная лирика', filter: 'sepia(.16) saturate(.84) contrast(1.08)' },
  energy: { index: 3, name: 'Цветовая геометрия', filter: 'saturate(1.13) contrast(1.10)' }
};
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const lookFor = day => looks[day.mood] || looks.calm;
const weatherLabel = day => (typeof day.weather === 'string' ? day.weather : day.weather?.label) || 'Ясный свет';
const cssColor = color => /^#[0-9a-f]{6}$/i.test(color) ? color : '#767667';
const percent = value => `${Math.round(clamp(Number(value) || 0, 0, 1) * 100)}%`;
const stamp = date => new Intl.DateTimeFormat('ru', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
const paletteHTML = colors => (colors || []).map(color => `<span title="${cssColor(color)}" style="--swatch:${cssColor(color)}"></span>`).join('');
let clean = null;
export function cleanupDay() { clean?.(); clean = null; }

function weatherIndex(day) {
  return ['warm_haze','mist','rain_glass','wind_sparks','clear_light'].indexOf(skyFor(day));
}

// All styles process the original photograph. The same surface drives playback and exports.
const vertex = `attribute vec2 pos; varying vec2 uv;
void main(){uv=pos*.5+.5;gl_Position=vec4(pos,0.,1.);}`;
const fragment = `precision mediump float;
varying vec2 uv; uniform sampler2D photo; uniform vec2 crop, offset, texel;
uniform vec3 tint; uniform float art, weather, t, loud;
float noise(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*4375.5453);}
void main(){
 vec2 p=vec2(uv.x,1.-uv.y);
 vec2 q=(p-.5)*crop+.5+offset;
 vec3 c=texture2D(photo,q).rgb;
 float y=dot(c,vec3(.299,.587,.114));
 if(art<.5){c=mix(vec3(y),c,.78)*.97+.023;c=mix(c,tint,.035);}
 else if(art<1.5){vec2 d=texel*(1.5+.8*loud);vec3 b=(texture2D(photo,q+d).rgb+texture2D(photo,q-d).rgb)*.5;c=mix(c,b,.33);c=mix(vec3(y),c,1.09);c+=vec3(.016,.012,0.);}
 else if(art<2.5){c=mix(vec3(y),c,.82);c=(c-.45)*1.1+.45;c.r+=.027;c.b-=.012;c+=.018*(noise(floor(p*340.)+mod(floor(t*6.),5.))-.5);}
 else{float block=step(.65,p.x+sin(floor(p.y*5.)*.8)*.22);c.r=mix(c.r,texture2D(photo,q+vec2(.0015+.003*loud,0.)).r,.65);c=mix(vec3(y),c,1.12);c=(c-.5)*1.06+.5;c=mix(c,tint,block*.065);}
 if(weather<.5){float glow=pow(max(0.,1.-distance(p,vec2(.08+.13*sin(t*.2),.2))*.94),2.);c+=vec3(.085,.051,.012)*glow;}
 else if(weather<1.5){
   float bank=.50+.08*sin(p.x*4.-t*.35)+.05*sin(p.x*11.-t*.63);
   float low=.74+.055*sin(p.x*7.-t*.29);
   float fog=(1.-smoothstep(.02,.23,abs(p.y-bank)))*(.54+.38*sin(p.x*4.+p.y*5.-t*.41));
   fog+=.36*(1.-smoothstep(.02,.16,abs(p.y-low)))*(.65+.35*cos(p.x*5.-t*.77));
   c=mix(c,vec3(.83,.88,.87),fog*.26);
 }
 else if(weather<2.5){vec2 v=vec2(p.x*106.+p.y*10.,p.y*5.-t*(.8+.5*loud));float drop=smoothstep(.98,1.,fract(v.x))*smoothstep(.72,1.,fract(v.y+noise(vec2(floor(v.x),0.))));c+=vec3(.13)*drop;}
 else if(weather<3.5){float line=pow(max(0.,sin(p.y*250.+t*2.)),18.)*max(0.,sin(p.x*9.+p.y*24.+t*1.4));c+=vec3(.03)*line;}
 else{float light=pow(max(0.,1.-distance(p,vec2(.8+.1*sin(t*.2),.07))*.98),3.);c+=vec3(.05,.044,.032)*light;}
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
  const loc = Object.fromEntries(['crop','offset','texel','tint','art','weather','t','loud'].map(key => [key,gl.getUniformLocation(program,key)]));
  const textures = new Map();
  function useTexture(img) {
    const cached = textures.get(img);
    if (cached) {
      textures.delete(img);
      textures.set(img,cached);
      gl.bindTexture(gl.TEXTURE_2D,cached.tex);
      return cached;
    }
    if (textures.size === 2) {
      const oldest = textures.keys().next().value;
      gl.deleteTexture(textures.get(oldest).tex);
      textures.delete(oldest);
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,tex);
    for (const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
    for (const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
    const limit = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),1920);
    let source = img;
    if (Math.max(img.naturalWidth,img.naturalHeight)>limit) {
      const scale = limit/Math.max(img.naturalWidth,img.naturalHeight);
      source=document.createElement('canvas');
      source.width=Math.max(1,Math.round(img.naturalWidth*scale));
      source.height=Math.max(1,Math.round(img.naturalHeight*scale));
      source.getContext('2d').drawImage(img,0,0,source.width,source.height);
    }
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,source);
    const uploaded={tex,width:source.width,height:source.height};
    textures.set(img,uploaded);
    return uploaded;
  }
  return {
    draw(img, w, h, time, level, day, camera={zoom:1,x:0,y:0}) {
      if (gl.isContextLost()) return null;
      if (surface.width !== w || surface.height !== h) { surface.width = w; surface.height = h; gl.viewport(0, 0, w, h); }
      const texture = useTexture(img);
      gl.uniform2f(loc.texel,1/texture.width,1/texture.height);
      const ratio = (w/h)/(img.naturalWidth/img.naturalHeight);
      const x = Math.min(1,ratio)/camera.zoom, y = Math.min(1,1/ratio)/camera.zoom;
      gl.uniform2f(loc.crop,x,y);
      gl.uniform2f(loc.offset,clamp(((camera.anchorX ?? .5)-.5)*(1-x)+camera.x*x,(x-1)/2,(1-x)/2),clamp(((camera.anchorY ?? .5)-.5)*(1-y)+camera.y*y,(y-1)/2,(1-y)/2));
      const c = cssColor(day.palette?.[0]); gl.uniform3f(loc.tint,parseInt(c.slice(1,3),16)/255,parseInt(c.slice(3,5),16)/255,parseInt(c.slice(5,7),16)/255);
      gl.uniform1f(loc.art,lookFor(day).index); gl.uniform1f(loc.weather,weatherIndex(day)); gl.uniform1f(loc.t,time%400); gl.uniform1f(loc.loud,level);
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

function cameraAt(seconds, photoIndex, energy, sound) {
  const cycle = seconds * (.095 + energy * .023) + photoIndex * 2.3 - .8;
  return {
    zoom: 1.04 + .018 * (1 - Math.cos(cycle)) / 2 + sound * .0015,
    x: .017 * Math.sin(cycle),
    y: .008 * Math.sin(cycle + .7)
  };
}

function scene(canvas, day, {onPhoto, onProgress, reducedMotion}) {
  canvas.width = 880; canvas.height = 1100;
  const ctx = canvas.getContext('2d',{alpha:false});
  let shader = shaderSurface(), frame = 0, running = true, visible = true, recording = false;
  let playing = !reducedMotion.matches, time = 0, lastFrame = null, current = null, outgoing = null;
  let nextPhotoAt = Infinity, nextIndex = 0, selection = 0, pending = false;
  const decoded = new Map();
  const photos = day.photos;
  const energy = clamp(Number(day.energy) || 0,0,1);
  const withSequence = photos.length > 1;
  const shotLength = () => photoInterval(day.track);
  const fadeLength = () => Math.min(1700,shotLength() * .37);
  const visibility = 'IntersectionObserver' in window ? new IntersectionObserver(([entry])=>{
    visible=entry.isIntersecting;
    if (!visible) lastFrame=null;
  }) : null;
  visibility?.observe(canvas);
  const W=canvas.width, H=canvas.height, margin=54;
  const ornament = document.createElement('canvas');
  ornament.width = W; ornament.height = H;
  drawPostcardDesign(ornament.getContext('2d'), W, H, day.mood);
  const colors=day.palette || []; const ink = cssColor(colors[0]);
  const shade = ctx.createLinearGradient(0,H*.32,0,H); shade.addColorStop(0,'rgba(0,0,0,0)'); shade.addColorStop(.42,'rgba(0,0,0,.15)'); shade.addColorStop(1,'rgba(0,0,0,.76)');
  const topShade = ctx.createLinearGradient(0,0,0,H*.23); topShade.addColorStop(0,'rgba(0,0,0,.38)'); topShade.addColorStop(1,'rgba(0,0,0,0)');
  const layouts = photos.map(photo => frameComposition(photo, day.mood));
  const captionWidth = W * (photos.some(photo=>photo.focus) ? .80 : 1) - margin*2;
  const upperShade = ctx.createLinearGradient(0,0,0,H*.69);
  upperShade.addColorStop(0,'rgba(0,0,0,.62)'); upperShade.addColorStop(.5,'rgba(0,0,0,.42)'); upperShade.addColorStop(1,'transparent');
  const caption = day.coverText || String(day.quote || day.title).slice(0,260).trim();
  const isSans=day.mood==='energy'; let fontSize=isSans?62:68, captionLines, captionFont;
  do {
    captionFont=`${isSans?'600':'italic'} ${fontSize}px ${isSans?'Arial, sans-serif':'Georgia, serif'}`;
    ctx.font=captionFont;captionLines=linesFor(ctx,caption,captionWidth);
    if(captionLines.length<=5 || fontSize<=38)break;
    fontSize-=4;
  } while(true);
  const lineHeight=fontSize*1.09, captionBottom=H-138, shortDate=stamp(day.date);
  function drawShot(shot, sound) {
    const {image,index,started} = shot;
    const pace = withSequence ? 1 : 8000 / shotLength();
    const camera = cameraAt((time-started)/1000*pace,index,energy,sound);
    camera.anchorX=layouts[index].x; camera.anchorY=layouts[index].y;
    const seconds = time/1000;
    let art;
    try { art = shader?.draw(image,W,H,seconds,sound,day,camera); }
    catch { shader?.dispose(); shader=null; }
    if (art) { ctx.drawImage(art,0,0); return; }

    const scale = Math.max(W/image.naturalWidth,H/image.naturalHeight)*camera.zoom;
    const width = image.naturalWidth*scale, height = image.naturalHeight*scale;
    const x = clamp((W-width)*camera.anchorX-camera.x*W,W-width,0);
    const y = clamp((H-height)*camera.anchorY-camera.y*H,H-height,0);
    ctx.save();
    ctx.filter=lookFor(day).filter;
    ctx.drawImage(image,x,y,width,height);
    ctx.filter='none';
    drawWeather(ctx,W,H,weatherIndex(day),seconds,sound);
    ctx.restore();
  }
  function paint() {
    const sound = (playing || recording) && playingDay()===day.id ? audioLevel() : 0;
    if (current) {
      const fade = outgoing ? clamp((time-current.started)/fadeLength(),0,1) : 1;
      if (fade<1) {
        drawShot(outgoing,sound);
        ctx.globalAlpha=fade*fade*(3-2*fade);
      } else { outgoing=null; }
      drawShot(current,sound);
      ctx.globalAlpha=1;
    } else {
      ctx.fillStyle=ink;
      ctx.fillRect(0,0,W,H);
    }
    const layout = layouts[current?.index || 0];
    ctx.fillStyle=layout.top ? upperShade : shade; ctx.fillRect(0,0,W,H); ctx.fillStyle=topShade; ctx.fillRect(0,0,W,H);
    ctx.drawImage(ornament, 0, 0);
    ctx.fillStyle='#fffaf4'; ctx.textBaseline='alphabetic'; ctx.textAlign='left';
    ctx.font='600 28px Arial, sans-serif'; ctx.fillText('DayTrace',margin,78);
    ctx.font='22px Arial, sans-serif'; ctx.fillText(shortDate,margin,112);
    ctx.font=captionFont;
    ctx.textAlign=layout.align;
    const textX = layout.align==='right' ? W-margin : layout.align==='center' ? W/2 : margin;
    captionLines.forEach((line,i,array)=>ctx.fillText(line,textX,layout.top ? 205+i*lineHeight : captionBottom-(array.length-i-1)*lineHeight,captionWidth));
    ctx.textAlign='left';
    ctx.fillStyle='rgba(255,255,255,.54)'; ctx.fillRect(margin,H-91,W-margin*2,1);
    ctx.fillStyle='#fffcf7'; ctx.font='25px Arial, sans-serif'; ctx.fillText(weatherLabel(day),margin,H-48,W*.6);
    colors.slice(0,5).forEach((color,i,array)=>{ctx.beginPath();ctx.arc(W-margin-10-(array.length-i-1)*25,H-57,9,0,Math.PI*2);ctx.fillStyle=cssColor(color);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.68)';ctx.lineWidth=1.4;ctx.stroke();});
  }
  function load(index) {
    if (!decoded.has(index)) {
      decoded.set(index,new Promise(resolve=>{
        const image=new Image();
        image.decoding='async';
        image.crossOrigin='anonymous';
        image.onload=()=>resolve(image);
        image.onerror=()=>resolve(null);
        image.src=photos[index].src;
      }));
    }
    return decoded.get(index);
  }
  async function select(index) {
    const call=++selection;
    pending=true;
    const image=await load(index);
    if (!running || call!==selection) return null;
    pending=false;
    nextIndex=(index+1)%photos.length;
    nextPhotoAt=time+shotLength();
    if (withSequence) load(nextIndex);
    if (!image) return false;
    outgoing=current?.image!==image && (playing || recording) ? current : null;
    current={image,index,started:time};
    paint();
    onPhoto(index);
    onProgress(0);
    return true;
  }
  function loop(ms) {
    if (!running) return;
    if (!document.hidden && (recording || (visible && playing))) {
      if (lastFrame===null) lastFrame=ms;
      if (ms-lastFrame>=32) {
        if(playing || recording)time+=Math.min(ms-lastFrame,120);
        lastFrame=ms;
        if (withSequence && time>=nextPhotoAt && !pending) select(nextIndex);
        paint();
        if (current) onProgress(clamp((time-current.started)/shotLength(),0,1));
      }
    } else {
      lastFrame=null;
    }
    frame=requestAnimationFrame(loop);
  }
  frame=requestAnimationFrame(loop);
  return {
    get ready() { return Boolean(current); },
    get playing() { return playing; },
    setPlaying(on) { playing=on; lastFrame=null; },
    resetRhythm() { nextPhotoAt=time+shotLength(); if (current) current.started=time; },
    setRecording(on) {
      recording=on;
      lastFrame=null;
      nextPhotoAt=time+shotLength();
      if (on && current) {
        outgoing=null;
        current.started=time;
        paint();
      }
    },
    select,
    stop(){ running=false; ++selection;visibility?.disconnect();cancelAnimationFrame(frame);shader?.dispose();decoded.clear();current=null;outgoing=null; }
  };
}

function openLoupe(day, initial) {
  let index=initial, zoom=1, dx=0, dy=0, original=false, request=0, drag;
  const box=modal('Лупа воспоминания',`<div class="dt-loupe">
    <div class="dt-loupe-stage" tabindex="0" aria-label="Фотография. Для перемещения увеличьте масштаб и перетащите снимок."><div class="dt-loupe-plane"><img alt="" draggable="false"><canvas aria-hidden="true"></canvas></div></div>
    <div class="dt-loupe-tools"><button type="button" class="button secondary" data-lens-original aria-pressed="false">${icon('layers',17)} Арт-слой</button>
      <label>${icon('zoom-in',18)} <input type="range" min="1" max="4" step="0.1" value="1" aria-label="Масштаб фотографии"><output>1×</output></label></div>
    <div class="dt-loupe-footer"><div><strong data-lens-file></strong><div class="dt-swatches">${paletteHTML(day.palette)}</div></div>
    ${day.photos.length>1?`<div class="dt-photo-index"><button class="icon-button" type="button" data-lens-step="-1" aria-label="Предыдущее фото">${icon('chevron-left',18)}</button><span data-lens-count></span><button class="icon-button" type="button" data-lens-step="1" aria-label="Следующее фото">${icon('chevron-right',18)}</button></div>`:''}</div></div>`,{wide:true});
  const stage=box.querySelector('.dt-loupe-stage'), plane=box.querySelector('.dt-loupe-plane'), photo=plane.querySelector('img'), layer=plane.querySelector('canvas');
  const range=box.querySelector('input[type=range]'), output=box.querySelector('output'), toggle=box.querySelector('[data-lens-original]');
  function position() {
    const ratio=photo.naturalHeight ? photo.naturalWidth/photo.naturalHeight : 1;
    const iw=Math.min(stage.clientWidth,stage.clientHeight*ratio), ih=iw/ratio;
    const maxX=Math.max(0,(iw*zoom-stage.clientWidth)/2), maxY=Math.max(0,(ih*zoom-stage.clientHeight)/2);
    dx=clamp(dx,-maxX,maxX);dy=clamp(dy,-maxY,maxY);
    plane.style.width=`${iw}px`;plane.style.height=`${ih}px`;
    plane.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(${zoom})`;
    stage.classList.toggle('can-pan',zoom>1); output.value=`${Number(zoom.toFixed(1))}×`;
  }
  const compare=()=>{layer.hidden=original;photo.style.visibility=original?'visible':'hidden';toggle.innerHTML=`${icon(original?'image':'layers',17)} ${original?'Оригинал':'Арт-слой'}`;toggle.setAttribute('aria-pressed',String(original));toggle.title=original?'Показать обработку':'Показать оригинал';};
  function load() {
    const seq=++request, item=day.photos[index];zoom=1;dx=dy=0;range.value=1;original=false;
    box.querySelector('[data-lens-file]').textContent=item.name;
    if(box.querySelector('[data-lens-count]')) box.querySelector('[data-lens-count]').textContent=`${index+1} / ${day.photos.length}`;
    photo.onload=()=>{
      if(seq!==request || !box.isConnected) return;
      const k=Math.min(1,2000/Math.max(photo.naturalWidth,photo.naturalHeight));layer.width=Math.max(1,Math.round(photo.naturalWidth*k));layer.height=Math.max(1,Math.round(photo.naturalHeight*k));
      const ctx=layer.getContext('2d');const shader=shaderSurface();let art;
      try { art=shader?.draw(photo,layer.width,layer.height,0,0,day); if(art) ctx.drawImage(art,0,0); } catch {} finally { shader?.dispose(); }
      if(!art){ctx.filter=lookFor(day).filter;ctx.drawImage(photo,0,0,layer.width,layer.height);ctx.filter='none';drawWeather(ctx,layer.width,layer.height,weatherIndex(day),0,0);}
      position();compare();
    };
    photo.onerror=()=>toast('Не удалось загрузить фотографию.');photo.crossOrigin='anonymous';photo.src=item.src;photo.alt=item.name;
    layer.hidden=true;photo.style.visibility='visible';
  }
  toggle.onclick=()=>{original=!original;compare();};range.oninput=()=>{zoom=Number(range.value);position();};
  stage.onwheel=e=>{e.preventDefault();zoom=clamp(zoom+(e.deltaY<0?.2:-.2),1,4);range.value=zoom;position();};
  stage.onpointerdown=e=>{if(zoom<=1)return;drag={x:e.clientX,y:e.clientY,dx,dy};stage.setPointerCapture(e.pointerId);};
  stage.onpointermove=e=>{if(!drag)return;dx=drag.dx+e.clientX-drag.x;dy=drag.dy+e.clientY-drag.y;position();};
  stage.onpointerup=stage.onpointercancel=()=>{drag=null;};
  stage.onkeydown=e=>{const delta={ArrowLeft:[35,0],ArrowRight:[-35,0],ArrowUp:[0,35],ArrowDown:[0,-35]}[e.key];if(delta){e.preventDefault();dx+=delta[0];dy+=delta[1];position();}};
  box.querySelectorAll('[data-lens-step]').forEach(button=>button.onclick=()=>{index=(index+Number(button.dataset.lensStep)+day.photos.length)%day.photos.length;load();});
  // The fitted photograph follows the modal when a phone switches orientation.
  const observer=new ResizeObserver(()=>{ if(box.isConnected)position();else observer.disconnect(); });observer.observe(stage);
  load();
}

function xray(day) {
  const explanations = Array.isArray(day.explanation) ? day.explanation : [];
  const track=day.track || {};
  const spotify=spotifyLinks(track);
  let music=track.reason || explanations[3] || '';
  if(spotify) {
    music=spotify.automatic
      ? (track.reason || 'Трек Spotify подобран по настроению и энергии записи.')
      : 'Вы прикрепили песню из Spotify. Она открывается во встроенном плеере.';
  } else if(track.kind==='link') music='Вы прикрепили ссылку на песню в музыкальном сервисе.';
  else if (track.kind==='file' || track.kind==='ambient') music=(music+' Во время воспроизведения кадр слегка откликается на низкие частоты.').trim();
  music = [music, tempoLabel(track) + '.', rhythmDescription(day)].filter(Boolean).join(' ');
  const entries = [
    ['file-text','Текст',explanations[0] || `Интонация записи определила настроение «${moods[day.mood]?.label || day.mood}». В центре сцены — фраза из вашего рассказа.`],
    ['image','Фотографии',explanations[1] || `Палитра собрана из ${day.photos.length===1?'оттенков фотографии':'оттенков фотографий'} дня. Их цвет сохраняется в художественной обработке.`],
    ['sun','Эмоциональная погода',explanations[2] || `Поверх снимка появляется эффект «${weatherLabel(day)}». Его характер связан с освещением и текстом дня.`],
    ['headphones','Музыка',music]
  ];
  modal('Почему день выглядит так?',`<div class="dt-xray"><div class="dt-xray-mood"><div><span>Интонация дня</span><strong>${esc(moods[day.mood]?.label || day.mood)}</strong></div><div class="dt-axes"><label>Теплота <b>${percent(day.warmth)}</b></label><i style="--amount:${percent(day.warmth)}"></i><label>Энергия <b>${percent(day.energy)}</b></label><i style="--amount:${percent(day.energy)}"></i></div></div>
    ${entries.map(([name,label,detail])=>`<section class="dt-xray-row"><div class="dt-xray-icon">${icon(name,19)}</div><div><h3>${label}</h3><p>${esc(detail)}</p>${label==='Фотографии'?`<div class="dt-swatches">${paletteHTML(day.palette)}</div>`:''}</div></section>`).join('')}
    <div class="dt-xray-style"><span>Художественный режим</span><strong>${esc(lookFor(day).name)}</strong></div></div>`);
}

function download(blob,filename) {
  const url=URL.createObjectURL(blob), anchor=document.createElement('a');
  anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
const filename = day => `${day.date} ${day.title.replace(/[<>:"/\\|?*\x00-\x1F]/g,'').slice(0,75)}`;
function external(url) {try {const resolved=new URL(url);return ['https:','http:'].includes(resolved.protocol)?resolved.href:'';}catch{return '';}}
function clockValue(seconds) {return `0:${String(Math.max(0,Math.floor(seconds))).padStart(2,'0')}`;}

function trackBody(day,readOnly) {
  const track=day.track || {}, spotify=spotifyLinks(track), url=spotify?.url || external(track.url), metadata=[];
  if(spotify) metadata.push(spotify.automatic?'Автоподбор из Spotify':'Ваша ссылка на Spotify');
  else if(track.kind==='ambient') metadata.push('Генеративная композиция');
  else if(track.kind==='preview') metadata.push('Фрагмент из каталога');
  else if(track.kind==='file') metadata.push('Ваш аудиофайл');
  else if(track.kind==='link') metadata.push('Ваша ссылка');
  metadata.push(tempoLabel(track));
  if(track.mode==='major'||track.mode==='minor')metadata.push(track.mode==='major'?'Мажор':'Минор');
  const waves=Array.from({length:44},(_,i)=>`<i style="--height:${22+Math.round(59*Math.abs(Math.sin(i*1.43)*Math.sin(.38*i+.45)))+8*Math.sin(.2*i)}%"></i>`).join('');
  const playable=!spotify && (track.kind==='ambient'||Boolean(track.src));
  return `<section class="dt-sound"><div class="dt-section-title">${icon('headphones',17)}<h2>Звук дня</h2></div>
  <div class="dt-track"><div class="dt-sleeve" style="--cover-one:${cssColor(day.palette?.[0])};--cover-two:${cssColor(day.palette?.[2])}"><div></div></div><div><h3>${esc(track.title||'Музыка дня')}</h3><p>${esc(track.artist||'DayTrace')}</p></div></div>
  ${playable?`<div class="dt-player"><button class="dt-play" type="button" data-act="play" aria-label="Воспроизвести фрагмент">${icon('play',18)}</button><div class="dt-wave" aria-hidden="true">${waves}</div><output data-time>0:00</output></div>`:''}
  ${spotify?`<div data-spotify-player><div data-spotify-frame></div><p class="dt-spotify-status" role="status">Запускаем Spotify…</p></div>`:''}
  <p class="dt-track-meta">${metadata.map(esc).join(' · ')}</p>${track.reason?`<p class="dt-reason">${esc(track.reason)}</p>`:''}
  ${url||!readOnly?`<div class="dt-track-links">${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${spotify?'Открыть в Spotify':'Открыть трек'} ${icon('external-link',14)}</a>`:''}${readOnly?'':`<button type="button" data-act="reroll">${icon('refresh-cw',14)} Другой трек</button>`}</div>`:''}</section>`;
}

function tabPanel(day, name) {
  if(name==='photos') return `<div class="dt-thumbs">${day.photos.map((photo,i)=>`<button type="button" data-photo="${i}" aria-label="Рассмотреть фото ${i+1}"><img src="${esc(photo.src)}" alt="${esc(photo.name)}" loading="lazy"><span>${icon('zoom-in',16)}</span></button>`).join('')}</div>`;
  if(name==='files') {
    const path=src=>String(src).split('/').slice(-2).map(segment=>{try{return decodeURIComponent(segment);}catch{return segment;}}).join('/');
    const list=[['file-text','entry.txt'],['file-text','memory.json'],['file-text','memory.html'],...day.photos.map(photo=>['image',path(photo.src)]),...(day.track?.kind==='file'?[['music',path(day.track.src)]]:[]),...(day.voiceSrc?[['volume-2','voiceover.wav']]:[])];
    return `<ul class="dt-file-list">${list.map(([name,text])=>`<li>${icon(name,16)}${esc(text)}</li>`).join('')}</ul>`;
  }
  return `<div class="dt-entry-text">${esc(day.text)}</div>`;
}

export async function renderDay(root, day, {readOnly=false, back='/', days=[day], extraDays=0, onPickDay}={}) {
  cleanupDay();stopTrack();
  let index=0, speaking=false, voiceAudio=null, voiceSequence=0, live=true, rerolling=false, recorder=null, recordStream=null, clipTimer, clockFrame=0, capturing=false, clipDeadline=0, preferSilent=false;
  const signals=new AbortController();
  const initialFade=archivePatina(day.date,extraDays).toFixed(4);
  const clipHasSound=()=>!spotifyLinks(day.track) && ['ambient','file'].includes(day.track?.kind);
  const clipLabel=()=>clipHasSound()?'Видео · 15 с':'Видео · 15 с без звука';
  root.innerHTML=`<article class="dt-page"><div data-weather-layer aria-hidden="true"></div><div class="dt-day-nav">${back?`<button class="dt-back" type="button" data-act="back">${icon('arrow-left',17)} ${readOnly && back==='/'?'На главную':'В архив'}</button>`:''}
  ${readOnly?'':`<div class="dt-day-actions"><button class="button secondary" type="button" data-act="share">${icon('share',16)} Поделиться</button><a class="button secondary" href="/api/days/${encodeURIComponent(day.id)}/zip" download>${icon('download',16)} Скачать ZIP</a></div>`}</div>
  <header class="dt-heading"><p>${esc(dateLabel(day.date))}<span></span>${esc(moods[day.mood]?.label || day.mood)}</p><h1>${esc(day.title)}</h1></header>
  <div class="dt-layout"><section class="dt-art-column patina-card" style="--fade:${initialFade}" aria-label="Живая открытка дня"><div data-deck></div><div class="dt-stage"><canvas role="img" aria-label="${esc(day.coverText || day.quote || day.title)}"></canvas><button class="dt-motion" type="button" data-act="motion" disabled></button>${day.photos.length>1?'<div class="dt-shot-progress" aria-hidden="true"></div>':''}<div class="dt-image-error" hidden>Фотография недоступна</div></div>
  <div class="dt-under-stage"><button class="dt-text-action" type="button" data-act="loupe">${icon('zoom-in',17)} Рассмотреть фото</button>${day.photos.length>1?`<div class="dt-photo-index"><button class="icon-button" type="button" data-step="-1" aria-label="Предыдущее фото">${icon('chevron-left',16)}</button><span data-index>1 / ${day.photos.length}</span><button class="icon-button" type="button" data-step="1" aria-label="Следующее фото">${icon('chevron-right',16)}</button></div>`:''}</div>
  </section><aside class="dt-sidebar"><div class="dt-meta-panel"><div class="dt-section-title">${icon('layers',17)}<h2>Атмосфера дня</h2></div>
  <div class="dt-meta-line"><span>Погода</span><button class="dt-weather-replay" data-act="weather" type="button" title="Повторить погоду дня" aria-label="Повторить погоду дня · ${esc(weatherLabel(day))}">${esc(weatherLabel(day))} ${icon('refresh-cw',13)}</button></div><div class="dt-meta-line"><span>Стиль</span><strong>${esc(lookFor(day).name)}</strong></div>
  <div class="dt-meta-line"><span>Палитра</span><div class="dt-swatches">${paletteHTML(day.palette)}</div></div>
  <button type="button" class="dt-xray-button" data-act="xray">${icon('scan',17)} Почему день выглядит так?</button></div>
  <div data-sound>${trackBody(day,readOnly)}</div>
  ${day.voice && (day.voiceSrc || 'speechSynthesis' in window)?`<button type="button" class="dt-voice" data-act="voice">${icon('volume-2',18)} <span>Послушать цитату</span></button>`:''}
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
  const weatherHost=find('[data-weather-layer]');
  let weather=mountDayWeather(weatherHost,day);
  const deck=mountDeck(deckHost,{day,days,readOnly,onPickDay,onPickPhoto:showPhoto});
  const postcard=find('.dt-art-column');
  const canvas=find('.dt-stage canvas');
  const motionButton=find('[data-act=motion]');
  const shotProgress=find('.dt-shot-progress');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let colorReveal;
  function revealPostcard(){
    if(!postcard.classList.contains('patina-card'))return;
    const archived=getComputedStyle(postcard).filter;
    postcard.classList.remove('patina-card');
    if(!reduce.matches && postcard.animate){
      colorReveal=postcard.animate([{filter:archived},{filter:'none'}],{
        duration:2400, delay:150, fill:'backwards', easing:'ease-in-out'
      });
    }
  }
  const art=scene(canvas,day,{
    reducedMotion:reduce,
    onPhoto(selected){
      revealPostcard();
      index=selected;
      deck.selectPhoto(index);
      const counter=find('.dt-photo-index [data-index]');
      if(counter)counter.textContent=`${index+1} / ${day.photos.length}`;
      find('.dt-image-error').hidden=true;
      motionButton.disabled=capturing;
    },
    onProgress(progress){shotProgress?.style.setProperty('--shot-progress',String(progress));}
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
    if(event.matches)colorReveal?.cancel();
    setMotion(!event.matches);
  },{signal:signals.signal});
  function musicState(){
    if(!live)return;
    const active=playingDay()===day.id, button=find('[data-act=play]');
    if(button){button.innerHTML=icon(active?'pause':'play',18);button.setAttribute('aria-label',active?'Остановить фрагмент':'Воспроизвести фрагмент');}
    find('.dt-player')?.classList.toggle('is-playing',active);
  }
  async function showPhoto(i){
    const ok=await art.select((i+day.photos.length)%day.photos.length);
    if(live && ok===false){
      if(art.ready)toast('Фотография недоступна.');
      else {
        find('.dt-image-error').hidden=false;
        revealPostcard();
      }
    }
  }
  function setTab(key){
    root.querySelectorAll('[data-tab]').forEach(btn=>{const active=btn.dataset.tab===key;btn.setAttribute('aria-selected',String(active));btn.tabIndex=active?0:-1;});
    const panel=find('[role=tabpanel]');panel.innerHTML=tabPanel(day,key);panel.setAttribute('aria-labelledby',`dt-tab-${key}`);
  }
  function resetVoice(){
    speaking=false;setDucking(false);const btn=live&&find('[data-act=voice] span');if(btn)btn.textContent='Послушать цитату';
  }
  function stopVoice(){
    ++voiceSequence;
    if(voiceAudio){voiceAudio.onended=voiceAudio.onerror=null;voiceAudio.pause();voiceAudio.removeAttribute('src');voiceAudio.load();voiceAudio=null;}
    if(speaking)window.speechSynthesis?.cancel();resetVoice();
  }
  async function say(){
    if(speaking){stopVoice();return;}
    spotifyPlayer?.pause();
    const seq=++voiceSequence;
    speaking=true;setDucking(true);find('[data-act=voice] span').textContent='Остановить голос';
    function synthesized(){
      if(!live || seq!==voiceSequence)return;
      if(!window.speechSynthesis){resetVoice();toast('Голос недоступен в этом браузере.');return;}
      const utterance=new SpeechSynthesisUtterance(day.quote || day.text);utterance.lang='ru-RU';utterance.rate=0.87+day.energy*.19;
      const ru=speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith('ru'));if(ru)utterance.voice=ru;
      utterance.onend=()=>{if(seq===voiceSequence)resetVoice();};
      utterance.onerror=e=>{if(seq!==voiceSequence)return;resetVoice();if(live && !['canceled','interrupted'].includes(e.error))toast('Голос недоступен в этом браузере.');};speechSynthesis.speak(utterance);
    }
    if(!day.voiceSrc){synthesized();return;}
    const file=new Audio(day.voiceSrc);voiceAudio=file;
    const failed=()=>{if(voiceAudio!==file)return;voiceAudio=null;file.onended=file.onerror=null;synthesized();};
    file.onended=()=>{if(voiceAudio===file){voiceAudio=null;resetVoice();}};file.onerror=failed;
    try{await file.play();}catch{failed();}
  }
  async function replaceTrack(button){
    if(readOnly||rerolling||capturing)return;rerolling=true;button.disabled=true;button.textContent='Подбираем…';
    try {
      const candidate=await pickTrack(day,day.track);if(!live)return;
      const updated=await api(`/api/days/${encodeURIComponent(day.id)}/track`,{method:'PUT',body:{track:candidate}});
      const next=updated?.track||candidate;day.track=next;if(!live)return;
      art.resetRhythm();
      stopTrack(); spotifyPlayer?.destroy(); spotifyPlayer=null;
      if(speaking)stopVoice();
      find('[data-sound]').innerHTML=trackBody(day,readOnly);mountDayMusic();
      find('[data-act=clip] span').textContent=clipLabel();
      if(find('[data-tab=files]').getAttribute('aria-selected')==='true')setTab('files');toast('Музыка дня обновлена.');
    } catch(err){if(live)toast(err.message || 'Не удалось заменить трек.');}
    finally{rerolling=false;if(button.isConnected){button.disabled=false;button.innerHTML=`${icon('refresh-cw',14)} Другой трек`;}}
  }
  const recordStatus=find('[data-record-status]');
  const recordLock = '[data-act=clip],[data-act=play],[data-act=reroll],[data-act=motion],.dt-photo-index [data-step]';
  function endRecordingUI(){
    capturing=false;deckHost.inert=false;art.setRecording(false);clearTimeout(clipTimer);clipDeadline=0;
    recordStream?.getTracks().forEach(t=>t.stop());recordStream=null;
    if(live){for(const btn of root.querySelectorAll(recordLock))btn.disabled=false;
      if(recordStatus)recordStatus.hidden=true;}
  }
  async function clip(){
    if(capturing||readOnly)return;
    if(!art.ready){toast('Дождитесь загрузки фотографии.');return;}
    if(typeof MediaRecorder==='undefined'||!canvas.captureStream){toast('Запись видео недоступна в этом браузере. Можно сохранить PNG.');return;}
    capturing=true;deckHost.inert=true;preferSilent=!clipHasSound();
    for(const btn of root.querySelectorAll(recordLock))btn.disabled=true;
    try {
      if(speaking)stopVoice();
      spotifyPlayer?.pause();
      stopTrack(); if(!preferSilent){const ok=await playTrack(day,musicState);if(!ok||!live){endRecordingUI();return;}musicState();}
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
    if(ms-lastClock>140){
      const active=playingDay()===day.id, p=active?progress():0;
      const time=find('[data-time]');if(time)time.value=clockValue(active?elapsedSeconds():0);
      const wave=find('.dt-wave');if(wave)wave.style.setProperty('--progress',`${p*100}%`);
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
    const button=event.target.closest('button');if(!button||!root.contains(button)||deckHost.contains(button))return;
    if(button.dataset.step){await showPhoto(index+Number(button.dataset.step));return;}
    if(button.dataset.photo!==undefined){openLoupe(day,Number(button.dataset.photo));return;}
    if(button.dataset.tab){setTab(button.dataset.tab);return;}
    try {
      switch(button.dataset.act){
        case 'back':navigate(back);break;
        case 'share':if(!readOnly)await shareDialog(day.id);break;
        case 'xray':xray(day);break;
        case 'weather':weather.destroy();weather=mountDayWeather(weatherHost,day);break;
        case 'motion':setMotion(!art.playing);break;
        case 'loupe':openLoupe(day,index);break;
        case 'voice':await say();break;
        case 'play':if(playingDay()===day.id)stopTrack();else await playTrack(day,musicState);musicState();break;
        case 'reroll':await replaceTrack(button);break;
        case 'png':if(!art.ready){toast('Дождитесь загрузки фотографии.');break;}canvas.toBlob(blob=>{if(blob)download(blob,`${filename(day)}.png`);else toast('Не удалось сохранить открытку.');},'image/png');break;
        case 'clip':await clip();break;
      }
    }catch(err){if(live)toast(err.message||'Не удалось выполнить действие.');}
  },{signal:signals.signal});
  clean=()=>{live=false;signals.abort();colorReveal?.cancel();spotifyPlayer?.destroy();weather.destroy();deck.destroy();cancelAnimationFrame(clockFrame);art.stop();clearTimeout(clipTimer);
    if(recorder?.state==='recording'){recorder.onstop=null;recorder.stop();}endRecordingUI();stopVoice();stopTrack();};
  clockFrame=requestAnimationFrame(tick);await showPhoto(0);
}
