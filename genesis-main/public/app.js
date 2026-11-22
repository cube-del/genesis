import {icon,esc,api,navigate,modal,closeModal,shareDialog,toast,dateLabel,moods} from './ui.js';
import {playTrack,stopTrack,playingDay,spotifyLinks,setVinylAging} from './media.js';
import {showSpotifyPlayer} from './spotify.js';
import {openRecall} from './revisit.js';
import {coverCaption} from './memory.js';
import {archivePatina} from './patina.js';
import {buildVisualRecipe} from './visual-recipe.js';
import {contactSheetLayout} from './postcard.js';
import {renderRoadmap,renderTopoBackdrop,getRoadmapJourney} from './roadmap.js';
import {openVinylPosterModal} from './vinyl-poster.js';

const main=document.querySelector('#main');
const header=document.querySelector('#site-header');
const sortNames={date:'По дате',warmth:'По теплоте',tempo:'По BPM',old:'Сначала ранние'};
function savedAge(){
  try {
    const days=Number(sessionStorage.getItem('daytrace-time-offset'));
    return Number.isFinite(days)?Math.max(0,Math.min(365,days)):0;
  }catch{return 0}
}
const prefs={filter:'all',sort:'date',age:savedAge()};
const ageLabel=()=>prefs.age?'+'+prefs.age+' дн.':'';
function ageAttributes(day){
  return 'data-age-date="'+esc(day.date)+'" style="--fade:'+archivePatina(day.date,prefs.age).toFixed(4)+'"';
}
let allDays=[], currentSet=[], routeVersion=0, dispose=null, shared=false, favorites=false, basePath='/';
const brand='<img src="/mark.svg" alt="" width="28" height="28"><span>DayTrace</span>';
function renderHeader() {
  const inArchive=location.pathname==='/' && !favorites;
  const home=shared?basePath:'/';
  header.innerHTML='<div class="header-wrap"><a class="brand" data-nav href="'+esc(home)+'" aria-label="DayTrace, на главную">'+brand+'</a>'+
    (shared?'<span class="read-only">'+icon('lock',14)+'Только просмотр</span>':'<nav class="main-nav" aria-label="Навигация"><a data-nav class="'+(inArchive?'active':'')+'" href="/" '+(inArchive?'aria-current="page"':'')+'>'+icon('archive',16)+'Ящик</a><a data-nav class="'+(favorites?'active':'')+'" href="/?view=favorites" '+(favorites?'aria-current="page"':'')+'>'+icon('bookmark',15)+'Избранное</a></nav>'+
    '<a class="button primary new-day" data-nav href="/create">'+icon('plus',16)+'Новый день</a>')+'</div>';
}
document.addEventListener('click',event=>{
  const link=event.target.closest('a[data-nav]');
  if(link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button===0){event.preventDefault();navigate(link.getAttribute('href'))}
});
function shortStamp(iso){
  return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(new Date(iso+'T12:00:00'));
}
function dayUrl(id){return shared?basePath+'?day='+encodeURIComponent(id):'/day/'+encodeURIComponent(id)}
function isVideo(item){
  return Boolean(item) && (item.kind==='video' || /\.(?:mp4|webm|mov|m4v|ogv)(?:$|\?)/i.test(item.src||''));
}
function archivePosition(photo){
  const f=photo?.focus;
  return f && Number.isFinite(f.x) && Number.isFinite(f.y)
    ? ' style="object-position:'+(f.x*100).toFixed(1)+'% '+(f.y*100).toFixed(1)+'%"' : '';
}
function catalogCode(day){
  const ordered=[...allDays].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const idx=Math.max(0,ordered.findIndex(item=>item.id===day.id));
  return 'ДТ '+(4001+idx);
}
function pluralAlbums(n){
  const mod10=n%10, mod100=n%100;
  if(mod10===1 && mod100!==11)return n+' альбом дня';
  if(mod10>=2 && mod10<=4 && (mod100<12 || mod100>14))return n+' альбома дней';
  return n+' альбомов дней';
}
function miniSignatureSVG(recipe){
  const env = recipe.envelope || [];
  const style = recipe.signatureStyle || 'impressionism';
  if (style === 'film') {
    const bars = env.slice(0, 32).map((v, i) => {
      const y = (i / 31) * 100, w = 2 + v * 10;
      return `<rect x="${(7 - w / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="2.2" fill="currentColor" opacity="${(.38 + v * .55).toFixed(2)}"/>`;
    }).join('');
    return `<svg class="cs-optical-svg" viewBox="0 0 14 102" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
  }
  const pts = env.slice(0, 44).map((v, i) => {
    const x = (i / 43) * 180;
    const y = style === 'constructivism'
      ? (i % 3 === 0 ? 15 - v * 13 : 15 + v * 4)
      : style === 'ma'
        ? 11 + (v - .42) * 15 * Math.sin(i * 1.15 + .4)
        : 12 - v * 9 * Math.sin(i * .7 + .3);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="cs-sig-svg" viewBox="0 0 180 22" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="${style==='ma'?'1.7':'1.25'}" points="${pts}"/></svg>`;
}
function card(day){
  const recipe = buildVisualRecipe(day);
  const count = day.photos.length;
  const W = 880, H = 1100;
  const layout = contactSheetLayout(W, H, recipe, count);
  const pct = (val, base) => ((val / base) * 100).toFixed(2) + '%';
  const sepia = Math.min(.26, recipe.amberShift / 28);
  const photoFilter = `saturate(${recipe.saturation.toFixed(2)}) contrast(${recipe.contrast.toFixed(2)}) brightness(${recipe.exposure.toFixed(2)})` + (sepia > .01 ? ` sepia(${sepia.toFixed(2)})` : '');
  const fade = archivePatina(day.date, prefs.age).toFixed(4);
  const spinDur = (60 / Math.max(55, Math.min(180, recipe.bpm || 84)) * 6.4).toFixed(2) + 's';
  const cat = catalogCode(day);
  const styleAttr = `--fade:${fade};--cs-bg:${recipe.sheetBg};--cs-ink:${recipe.sheetInk};--cs-muted:${recipe.sheetMuted};--cs-rule:${recipe.sheetRule};--cs-frame:${recipe.frameBorder};--cs-highlight:${recipe.frameHighlight};--cs-backdrop:${recipe.backdrop};--cs-accent:${recipe.palette.at(-1)};--tile-filter:${photoFilter}`;
  const discStyle = `--disc-label:${recipe.frameHighlight || recipe.palette.at(-1)};--disc-ring:${recipe.sheetBg};--spin-dur:${spinDur}`;
  const slotsHTML = layout.slots.map(slot => {
    const photo = day.photos[slot.index] || day.photos[0];
    const pos = `left:${pct(slot.x, W)};top:${pct(slot.y - layout.stage.y, layout.stage.h)};width:${pct(slot.w, W)};height:${pct(slot.h, layout.stage.h)}`;
    const vid = isVideo(photo);
    const mediaTag = vid
      ? `<video src="${esc(photo.src)}"${archivePosition(photo)}${photo.poster ? ` poster="${esc(photo.poster)}"` : ''} muted loop playsinline preload="metadata"></video>`
      : `<img loading="lazy"${archivePosition(photo)} src="${esc(photo.src)}" alt="${esc(photo.name || day.title)}">`;
    return `<div class="cs-slot${slot.softEdge ? ' is-soft' : ''}" style="${pos}">${mediaTag}<span class="cs-idx">${slot.label}${vid ? ' ▶' : ''}</span>${slot.timecode ? `<span class="cs-tc">${slot.timecode}</span>` : ''}</div>`;
  }).join('');
  const powerHTML = layout.powerCell
    ? `<div class="cs-power" style="left:${pct(layout.powerCell.x, W)};top:${pct(layout.powerCell.y - layout.stage.y, layout.stage.h)};width:${pct(layout.powerCell.w, W)};height:${pct(layout.powerCell.h, layout.stage.h)}" aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="8" y1="86" x2="92" y2="14" stroke="currentColor" stroke-width="1.2" opacity=".45"/><line x1="52" y1="8" x2="52" y2="92" stroke="currentColor" stroke-width="1" opacity=".35"/><circle cx="52" cy="50" r="21" fill="var(--cs-accent)" opacity=".36"/><circle cx="52" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".68"/></svg></div>`
    : '';
  const opticalHTML = layout.style === 'film'
    ? `<div class="cs-optical" style="left:${pct(layout.sigBox.x, W)};top:${pct(layout.sigBox.y - layout.stage.y, layout.stage.h)};width:${pct(layout.sigBox.w, W)};height:${pct(layout.sigBox.h, layout.stage.h)}" aria-hidden="true">${miniSignatureSVG(recipe)}</div>`
    : '';
  const swatches = recipe.palette.slice(0, 4).map(c => `<i style="background:${esc(c)}"></i>`).join('');
  const quote = coverCaption(day);
  const bpmMeta = recipe.bpm ? Math.round(recipe.bpm) + ' BPM' : (spotifyLinks(day.track) ? 'Spotify' : null);
  const trackMeta = [day.track?.artist || 'DayTrace', bpmMeta].filter(Boolean).join(' · ');
  const moodLabel = moods[day.mood]?.label || day.mood;
  const subMeta = [dateLabel(day.date), moodLabel, bpmMeta].filter(Boolean).join(' · ');
  return `<article class="record-sleeve" data-card="${esc(day.id)}">` +
    `<div class="sleeve-wrap">` +
    `<div class="sleeve-vinyl" style="${discStyle}" aria-hidden="true"></div>` +
    `<div class="contact-sheet patina-card cs-mode-${esc(layout.style)}${recipe.sheetDark ? ' is-dark' : ''}" data-age-date="${esc(day.date)}" style="${styleAttr}">` +
    `<div class="ring-wear" aria-hidden="true"></div>` +
    `<header class="cs-head"><span>${esc(cat)} · ${shortStamp(day.date)}</span><span class="cs-weather">${esc(recipe.weatherLabel.toUpperCase())}</span><span class="cs-cal" aria-label="Палитра">${swatches}</span></header>` +
    `<div class="cs-stage"><a class="cs-stage-link" data-nav href="${dayUrl(day.id)}" aria-label="Открыть ${esc(day.title)}">${slotsHTML}${powerHTML}${opticalHTML}</a>` +
    (!shared ? `<button class="save-day ${day.favorite ? 'saved' : ''}" data-save="${esc(day.id)}" aria-pressed="${!!day.favorite}" aria-label="${day.favorite ? 'Убрать из избранного' : 'В избранное'}">${icon('bookmark', 13)}</button>` : '') +
    `<button class="sleeve-play-fab" data-sound="${esc(day.id)}" aria-label="Послушать ${esc(day.track.title)}"><span class="tile-play">${icon('play', 12)}</span></button>` +
    `</div>` +
    `<footer class="cs-foot"><p class="cs-quote">«${esc(quote.replace(/^[«"]|[»"]$/g, ''))}»</p>` +
    `<div class="cs-track-bar">${layout.style === 'film' ? `<span class="cs-film-label">35MM · ${esc(day.track.title)}</span>` : miniSignatureSVG(recipe)}<span class="cs-track-meta">${esc(trackMeta)}</span></div></footer>` +
    `</div></div>` +
    `<div class="sleeve-caption"><span class="sleeve-cat">${esc(cat)}</span><h3><a data-nav href="${dayUrl(day.id)}">${esc(day.title)}</a></h3><p class="sleeve-meta">${esc(subMeta)}</p></div>` +
    `</article>`;
}
let roadmapList=[], roadmapRaf=0;
const journey={active:false,paused:false,index:-1,raf:0,timer:0,progressRaf:0,len:0,dwellStart:0,dwellMs:4800,hud:null,tooltip:null};

function updateJourneyButton(){
  const btn=main.querySelector('[data-journey]');
  if(!btn)return;
  btn.classList.toggle('is-active',journey.active);
  btn.setAttribute('aria-pressed',String(journey.active));
  btn.innerHTML=icon(journey.active?'pause':'route',15)+(journey.active?'Остановить маршрут':'Проиграть маршрут');
}
function ensureJourneyHud(){
  if(journey.hud && journey.hud.isConnected)return journey.hud;
  const el=document.createElement('aside');
  el.className='journey-hud';
  el.setAttribute('aria-label','Проигрывание маршрута');
  el.innerHTML=
    `<div class="jh-progress"><i data-jh-bar></i></div>`+
    `<div class="jh-row">`+
      `<div class="jh-info"><span class="jh-step" data-jh-step></span><strong class="jh-title" data-jh-title></strong><span class="jh-delta" data-jh-delta></span></div>`+
      `<div class="jh-controls">`+
        `<button type="button" class="jh-btn" data-jh="prev" aria-label="Предыдущий день">${icon('chevron-left',16)}</button>`+
        `<button type="button" class="jh-btn jh-btn-main" data-jh="toggle" aria-label="Пауза">${icon('pause',14)}</button>`+
        `<button type="button" class="jh-btn" data-jh="next" aria-label="Следующий день">${icon('chevron-right',16)}</button>`+
        `<a class="jh-open" data-nav data-jh-open href="/">Открыть ${icon('arrow-up-right',13)}</a>`+
        `<button type="button" class="jh-btn" data-jh="stop" aria-label="Закрыть маршрут">${icon('x',15)}</button>`+
      `</div>`+
    `</div>`;
  el.addEventListener('click',e=>{
    const b=e.target.closest('[data-jh]');if(!b)return;
    const act=b.dataset.jh;
    if(act==='stop')stopJourney();
    else if(act==='prev')goToJourneyStop((journey.index-1+roadmapList.length)%roadmapList.length);
    else if(act==='next')goToJourneyStop((journey.index+1)%roadmapList.length);
    else if(act==='toggle')toggleJourneyPause();
  });
  document.body.appendChild(el);
  journey.hud=el;
  return el;
}
function stopJourney(){
  clearTimeout(journey.timer);
  cancelAnimationFrame(journey.raf);
  cancelAnimationFrame(journey.progressRaf);
  journey.timer=journey.raf=journey.progressRaf=0;
  const wasActive=journey.active;
  journey.active=false;
  journey.paused=false;
  journey.index=-1;
  main.querySelectorAll('.record-sleeve.is-journey-active').forEach(el=>el.classList.remove('is-journey-active'));
  const stage=main.querySelector('#roadmap-stage');
  getRoadmapJourney(stage)?.showBeacon(false);
  journey.hud?.remove();
  journey.hud=null;
  if(wasActive){stopTrack();refreshSound();}
  updateJourneyButton();
}
function toggleJourneyPause(){
  if(!journey.active)return;
  journey.paused=!journey.paused;
  const btn=journey.hud?.querySelector('[data-jh=toggle]');
  if(btn){
    btn.innerHTML=icon(journey.paused?'play':'pause',14);
    btn.setAttribute('aria-label',journey.paused?'Продолжить':'Пауза');
  }
  if(journey.paused){
    clearTimeout(journey.timer);
    cancelAnimationFrame(journey.progressRaf);
    stopTrack();
    refreshSound();
  }else{
    goToJourneyStop(journey.index);
  }
}
function journeyDeltaText(prevDay, currDay){
  const rCurr=buildVisualRecipe(currDay);
  if(!prevDay){
    return [dateLabel(currDay.date), rCurr.bpm?Math.round(rCurr.bpm)+' BPM':null, rCurr.weatherLabel].filter(Boolean).join(' · ');
  }
  const rPrev=buildVisualRecipe(prevDay);
  const parts=[];
  if(rPrev.bpm && rCurr.bpm) parts.push(`${Math.round(rPrev.bpm)} → ${Math.round(rCurr.bpm)} BPM`);
  else if(rCurr.bpm) parts.push(`${Math.round(rCurr.bpm)} BPM`);
  if(rPrev.weatherLabel!==rCurr.weatherLabel) parts.push(`${rPrev.weatherLabel} → ${rCurr.weatherLabel}`);
  else parts.push(rCurr.weatherLabel);
  return parts.join(' · ');
}
function goToJourneyStop(idx){
  if(!journey.active || !roadmapList.length)return;
  clearTimeout(journey.timer);
  cancelAnimationFrame(journey.raf);
  cancelAnimationFrame(journey.progressRaf);
  const safeIdx=((idx%roadmapList.length)+roadmapList.length)%roadmapList.length;
  const prevIdx=journey.index;
  journey.index=safeIdx;
  const day=roadmapList[safeIdx];
  const prevDay=prevIdx>=0 && prevIdx!==safeIdx ? roadmapList[prevIdx] : null;
  const stage=main.querySelector('#roadmap-stage');
  const ctrl=getRoadmapJourney(stage);

  main.querySelectorAll('.record-sleeve').forEach(el=>{
    const hit=el.dataset.card===day.id;
    el.classList.toggle('is-journey-active',hit);
    if(hit) el.scrollIntoView({behavior:'smooth',block:'center'});
  });

  const hud=ensureJourneyHud();
  hud.querySelector('[data-jh-step]').textContent=`${String(safeIdx+1).padStart(2,'0')} / ${String(roadmapList.length).padStart(2,'0')} · ${catalogCode(day)}`;
  hud.querySelector('[data-jh-title]').textContent=day.title;
  hud.querySelector('[data-jh-delta]').textContent=journeyDeltaText(prevDay,day);
  const openLink=hud.querySelector('[data-jh-open]');
  if(openLink) openLink.setAttribute('href',dayUrl(day.id));
  const bar=hud.querySelector('[data-jh-bar]');
  if(bar) bar.style.transform='scaleX(0)';
  const toggleBtn=hud.querySelector('[data-jh=toggle]');
  if(toggleBtn){toggleBtn.innerHTML=icon('pause',14);toggleBtn.setAttribute('aria-label','Пауза');}
  journey.paused=false;

  stopTrack();
  if(!spotifyLinks(day.track) && ['ambient','file'].includes(day.track?.kind)){
    playTrack(day,()=>refreshSound(),{reveal:true}).then(()=>refreshSound()).catch(()=>refreshSound());
  }else{
    refreshSound();
  }

  const startLen=prevIdx>=0 ? journey.len : 0;
  const targetLen=ctrl?.stopLengths?.[safeIdx] ?? 0;
  if(ctrl){
    ctrl.showBeacon(true);
    const t0=performance.now();
    const travelMs=prevIdx>=0 ? 920 : 620;
    const stepTravel=now=>{
      if(!journey.active)return;
      const p=Math.min(1,(now-t0)/travelMs);
      const ease=p<0.5 ? 4*p*p*p : 1 - Math.pow(-2*p+2,3)/2;
      journey.len=startLen+(targetLen-startLen)*ease;
      ctrl.setProgress(journey.len);
      if(p<1) journey.raf=requestAnimationFrame(stepTravel);
    };
    journey.raf=requestAnimationFrame(stepTravel);
  }

  journey.dwellStart=performance.now();
  const tickBar=now=>{
    if(!journey.active || journey.paused)return;
    const p=Math.min(1,(now-journey.dwellStart)/journey.dwellMs);
    if(bar) bar.style.transform=`scaleX(${p.toFixed(4)})`;
    if(p<1) journey.progressRaf=requestAnimationFrame(tickBar);
  };
  journey.progressRaf=requestAnimationFrame(tickBar);
  journey.timer=setTimeout(()=>{
    if(!journey.active || journey.paused)return;
    if(safeIdx+1<roadmapList.length) goToJourneyStop(safeIdx+1);
    else{
      toast('Маршрут архива завершён.');
      stopJourney();
    }
  }, journey.dwellMs);
}
function startJourney(startIdx=0){
  if(!roadmapList.length){toast('В этом жанре пока нет пластинок для маршрута.');return;}
  journey.active=true;
  journey.paused=false;
  journey.index=-1;
  journey.len=0;
  updateJourneyButton();
  goToJourneyStop(startIdx);
}
function scheduleRoadmap(){
  if(roadmapRaf) cancelAnimationFrame(roadmapRaf);
  roadmapRaf=requestAnimationFrame(()=>{
    roadmapRaf=0;
    if(!main.classList.contains('archive-page'))return;
    const stage=main.querySelector('#roadmap-stage');
    const grid=main.querySelector('#day-grid');
    renderTopoBackdrop(main);
    if(stage && grid){
      const ctrl=renderRoadmap(stage,grid,roadmapList);
      if(journey.active && ctrl && journey.index>=0){
        ctrl.showBeacon(true);
        journey.len=ctrl.stopLengths[journey.index] ?? 0;
        ctrl.setProgress(journey.len);
      }
    }
  });
}
function updateGrid(){
  if(journey.active) stopJourney();
  let list=currentSet.filter(d=>prefs.filter==='all'||prefs.filter===d.mood);
  list=[...list].sort((a,b)=>prefs.sort==='old'?a.date.localeCompare(b.date):prefs.sort==='warmth'?b.warmth-a.warmth:prefs.sort==='tempo'?(b.track.bpm||0)-(a.track.bpm||0):b.date.localeCompare(a.date));
  roadmapList=list;
  const grid=main.querySelector('#day-grid');if(!grid)return;
  grid.innerHTML=list.length?list.map(d=>card(d)).join(''):'<div class="empty-grid">'+icon(favorites?'bookmark':'folder',28)+'<h3>'+(favorites && !currentSet.length?'Здесь будут любимые пластинки':'Пластинок в этом жанре пока нет')+'</h3><p>'+(favorites && !currentSet.length?'Нажмите на закладку на конверте, чтобы отложить день в избранное.':'Выберите другой жанр или откройте весь ящик.')+'</p><button class="button secondary" data-reset-filter>'+(favorites && !currentSet.length?'Весь ящик':'Показать весь ящик')+'</button></div>';
  const count=main.querySelector('#visible-count');if(count) count.textContent=String(currentSet.length);
  refreshSound();
  scheduleRoadmap();
}
function renderArchive(){
  currentSet=allDays.filter(d=>!favorites||d.favorite);
  setVinylAging(prefs.age/365);
  const lead=favorites
    ?'Отложенные пластинки, к которым хочется возвращаться и переслушивать.'
    :pluralAlbums(allDays.length)+'. Каждый день — конверт с контактным листом, палитрой и ритмом.';
  const extraTools=currentSet.length
    ? `<button type="button" class="button secondary" data-journey aria-pressed="false">${icon('route',15)}Проиграть маршрут</button>`+
      `<button type="button" class="button secondary" data-vinyl-poster>${icon('disc',15)}Слепок архива</button>`
    : '';
  const actions=!shared
    ?'<div class="crate-actions"><a class="button primary" data-nav href="/create">Записать новый день</a>'+extraTools+(favorites?'<a class="button secondary" data-nav href="/">Весь ящик</a>':(allDays.length ? '<button type="button" class="button secondary" data-recall>' + icon('headphones',15) + ' Вспомнить по детали</button>' : '') + '<button type="button" class="button secondary" data-share>Дать послушать</button>')+'</div>'
    :(extraTools?'<div class="crate-actions">'+extraTools+'</div>':'');
  const tabs=[
    `<button class="crate-tab crate-tab-all ${prefs.filter==='all'?'selected':''}" data-filter="all" aria-pressed="${prefs.filter==='all'}"><small>${favorites?'ИЗБРАННОЕ':'ВЕСЬ ЯЩИК'}</small><strong id="visible-count">${currentSet.length}</strong></button>`,
    ...Object.entries(moods).map(([key,m])=>`<button class="crate-tab ${key===prefs.filter?'selected':''}" data-filter="${key}" aria-pressed="${key===prefs.filter}"><small>ЖАНР</small><strong>${esc(m.label)}</strong></button>`)
  ].join('');
  const sortPills=Object.entries(sortNames).map(([k,v])=>`<button type="button" class="sort-pill ${prefs.sort===k?'selected':''}" data-sort="${k}" aria-pressed="${prefs.sort===k}">${esc(v)}</button>`).join('');
  main.className='archive-page shell';
  main.innerHTML=
    `<section class="crate-head"><h1 class="crate-title"><span>${favorites?'ИЗБРАННЫЕ':'ЯЩИК'}</span><em>${favorites?'ПЛАСТИНКИ':'С ПЛАСТИНКАМИ'}</em></h1><div class="crate-side"><p class="crate-lead">${esc(lead)}</p>${actions}</div></section>`+
    (allDays.length
      ? `<nav class="crate-dividers" role="group" aria-label="Жанры и настроения">${tabs}</nav>`+
        `<div class="crate-toolbar"><div class="sort-pills" role="group" aria-label="Сортировка">${sortPills}</div>`+
        `<label class="shelf-aging"><span>На полке</span><input id="patina-range" type="range" min="0" max="365" value="${365-prefs.age}" aria-label="Состояние конвертов: от старой полки до сейчас"><span>Сейчас</span><output id="patina-out">${ageLabel()}</output></label></div>`+
        `<div class="roadmap-stage" id="roadmap-stage"><svg class="roadmap-svg" id="roadmap-svg" aria-hidden="true"></svg><div class="rm-tooltip" id="rm-tooltip" hidden></div><div class="days-grid" id="day-grid"></div></div>`
      : '<div class="empty-grid">'+icon('image',40)+'<h3>Запишите свою первую пластинку</h3><p>Начните с фотографии или видео и пары строк о том, что запомнилось.</p>'+(!shared?'<a class="button primary" data-nav href="/create">Записать новый день</a>':'')+'</div>')+
    '<footer class="archive-footer"><span><img src="/mark.svg" width="18" alt="">DAYTRACE</span><span>'+icon(shared?'link':'lock',13)+(shared?'Ящик по ссылке':'Личный ящик пластинок')+'</span></footer>';
  main.querySelector('#patina-range')?.addEventListener('input',updateAge);
  const svgEl=main.querySelector('#roadmap-svg');
  const tipEl=main.querySelector('#rm-tooltip');
  if(svgEl && tipEl){
    svgEl.addEventListener('pointerover',e=>{
      const node=e.target.closest('.rm-interactive');
      if(!node || !node.dataset.tip)return;
      const stageRect=main.querySelector('#roadmap-stage').getBoundingClientRect();
      const nr=node.getBoundingClientRect();
      tipEl.textContent=node.dataset.tip;
      tipEl.hidden=false;
      tipEl.style.left=`${(nr.left+nr.width/2-stageRect.left).toFixed(1)}px`;
      tipEl.style.top=`${(nr.top-stageRect.top-10).toFixed(1)}px`;
    });
    svgEl.addEventListener('pointerout',e=>{
      if(e.target.closest('.rm-interactive') && !e.relatedTarget?.closest?.('.rm-interactive')) tipEl.hidden=true;
    });
    svgEl.addEventListener('click',e=>{
      const node=e.target.closest('.rm-interactive');
      if(!node || node.dataset.jumpIndex===undefined)return;
      const idx=Number(node.dataset.jumpIndex);
      if(Number.isFinite(idx)) startJourney(idx);
    });
  }
  const onResize=()=>scheduleRoadmap();
  const onKey=e=>{if(e.key==='Escape' && journey.active) stopJourney();};
  window.addEventListener('resize',onResize,{passive:true});
  document.addEventListener('keydown',onKey);
  let ro=null;
  const gridEl=main.querySelector('#day-grid');
  if(gridEl && typeof ResizeObserver!=='undefined'){
    ro=new ResizeObserver(()=>scheduleRoadmap());
    ro.observe(gridEl);
  }
  dispose=()=>{
    stopJourney();
    window.removeEventListener('resize',onResize);
    document.removeEventListener('keydown',onKey);
    ro?.disconnect();
    if(roadmapRaf){cancelAnimationFrame(roadmapRaf);roadmapRaf=0}
  };
  document.fonts?.ready?.then(()=>scheduleRoadmap());
  updateGrid();
}
function updateAge(event){
  prefs.age=365-Number(event.currentTarget.value);
  setVinylAging(prefs.age/365);
  try{sessionStorage.setItem('daytrace-time-offset',String(prefs.age))}catch{}
  const out=main.querySelector('#patina-out');
  if(out)out.value=ageLabel();
  main.querySelectorAll('[data-age-date]').forEach(el=>{
    el.style.setProperty('--fade',archivePatina(el.dataset.ageDate,prefs.age).toFixed(4));
  });
}
function refreshSound(){
  const id=playingDay();
  main.querySelectorAll('.record-sleeve').forEach(el=>{
    el.classList.toggle('is-playing', id===el.dataset.card);
  });
  main.querySelectorAll('[data-sound]').forEach(b=>{
    const on=id===b.dataset.sound;
    const mark=b.querySelector('.tile-play');if(mark)mark.innerHTML=icon(on?'pause':'play',12);
    const track=allDays.find(day=>day.id===b.dataset.sound)?.track;
    if(spotifyLinks(track) || track?.kind==='link') {
      b.setAttribute('aria-haspopup','dialog'); b.removeAttribute('aria-pressed');
    } else {
      b.setAttribute('aria-pressed',String(on)); b.removeAttribute('aria-haspopup');
    }
    b.setAttribute('aria-label',(on?'Пауза':'Послушать')+' '+(track?.title||''));
  });
}
main.addEventListener('pointerover',event=>{
  const card=event.target.closest('.contact-sheet');
  if(card&&!card.contains(event.relatedTarget)) card.querySelectorAll('video').forEach(v=>v.play().catch(()=>{}));
});
main.addEventListener('pointerout',event=>{
  const card=event.target.closest('.contact-sheet');
  if(card&&!card.contains(event.relatedTarget)) card.querySelectorAll('video').forEach(v=>v.pause());
});
main.addEventListener('click',async event=>{
  if(!main.classList.contains('archive-page'))return;
  const b=event.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-share'))return shareDialog();
  if(b.hasAttribute('data-recall') && !shared) { if(journey.active) stopJourney(); openRecall(currentSet); refreshSound(); return; }
  if(b.hasAttribute('data-journey')){
    if(journey.active) stopJourney();
    else startJourney(0);
    return;
  }
  if(b.hasAttribute('data-vinyl-poster')){
    const source=roadmapList.length?roadmapList:currentSet;
    openVinylPosterModal(source,{
      title:favorites?'Избранные пластинки':'Ящик с пластинками',
      catalogCode,
      onSelectDay:day=>navigate(dayUrl(day.id))
    });
    return;
  }
  if(b.hasAttribute('data-reset-filter')){
    if(favorites&&!currentSet.length)return navigate('/');
    prefs.filter='all';renderArchive();return;
  }
  if(b.dataset.filter){
    prefs.filter=b.dataset.filter;
    main.querySelectorAll('[data-filter]').forEach(el=>{el.classList.toggle('selected',el===b);el.setAttribute('aria-pressed',String(el===b))});
    updateGrid();return;
  }
  if(b.dataset.sort){
    prefs.sort=b.dataset.sort;
    main.querySelectorAll('[data-sort]').forEach(el=>{el.classList.toggle('selected',el===b);el.setAttribute('aria-pressed',String(el===b))});
    updateGrid();return;
  }
  if(b.dataset.save){
    const day=allDays.find(d=>d.id===b.dataset.save);if(!day)return;
    b.disabled=true;
    try{const result=await api('/api/days/'+day.id+'/favorite',{method:'PUT',body:{favorite:!day.favorite}});day.favorite=result.favorite;
      if(favorites){currentSet=allDays.filter(d=>d.favorite);updateGrid()}
      else{b.classList.toggle('saved',day.favorite);b.setAttribute('aria-pressed',String(day.favorite));b.setAttribute('aria-label',day.favorite?'Убрать из избранного':'В избранное')}
      toast(day.favorite?'Пластинка отложена в избранное':'Пластинка убрана из избранного');
    }catch(error){toast(error.message)}finally{b.disabled=false}
  }
  if(b.dataset.sound){
    const day=allDays.find(d=>d.id===b.dataset.sound);if(!day)return;
    if(playingDay()===day.id){stopTrack();refreshSound();return}
    const spotify=spotifyLinks(day.track);
    if(spotify){showSpotifyPlayer(day.track,spotify);return}
    if(day.track.kind==='link'){modal('Песня дня','<p class="dialog-lead">'+esc(day.track.title)+'</p><a class="button primary" target="_blank" rel="noopener noreferrer" href="'+esc(day.track.url)+'">'+icon('external-link',16)+'Открыть песню</a>');return}
    try{await playTrack(day,refreshSound);refreshSound()}catch(err){toast(err.message);refreshSound()}
  }
});
async function route(){
  const version=++routeVersion;
  dispose?.();dispose=null;stopTrack();closeModal();
  shared=location.pathname.startsWith('/share/');basePath=shared?location.pathname:'/';
  const query=new URLSearchParams(location.search);
  favorites=!shared&&location.pathname==='/'&&query.get('view')==='favorites';
  renderHeader();window.scrollTo(0,0);
  main.className='shell';main.innerHTML='<div class="page-loading" role="status"><img src="/mark.svg" width="32" alt="">Открываем ящик…</div>';
  const here=location.pathname.replace(/\/$/,'');
  try{
    if(here==='/create'){
      const module=await import('./create.js');if(version!==routeVersion)return;
      main.className='';dispose=module.cleanupCreate||null;document.title='Новый день — DayTrace';
      await module.renderCreate(main);return;
    }
    let day=null;
    if(shared){
      const match=here.match(/^\/share\/(archive|day)\/([\w-]+)$/);if(!match)throw Error('Ссылка недоступна.');
      const data=await api('/api/public/'+match[1]+'/'+match[2]);if(version!==routeVersion)return;
      allDays=data.days;
      if(match[1]==='day')day=allDays[0];
      else if(query.has('day')){day=allDays.find(d=>d.id===query.get('day'));if(!day)throw Error('Запись недоступна.')}
    }else if(!here || here.startsWith('/day/')){
      const days=await api('/api/days');
      if(version!==routeVersion)return;
      allDays=days;
      if(here){
        day=days.find(item=>item.id===decodeURIComponent(here.slice(5)));
        if(!day)throw Error('Запись недоступна.');
      }
    }else throw Error('Страница не найдена.');
    if(version!==routeVersion)return;
    if(day){const module=await import('./day.js');if(version!==routeVersion)return;
      main.className='';dispose=module.cleanupDay;document.title=day.title+' — DayTrace';
      const recallId = shared ? null : query.get('recall');
      if (recallId) {
        query.delete('recall');
        history.replaceState(history.state, '', location.pathname + (query.size ? '?' + query : '') + location.hash);
      }
      await module.renderDay(main,day,{
        recallId,
        days:allDays, extraDays:prefs.age, readOnly:shared,
        back:shared?(here.startsWith('/share/day/')?null:basePath):'/',
        onPickDay:selected=>navigate(dayUrl(selected.id))
      });
    }else{document.title=(favorites?'Избранные пластинки':'Ящик с пластинками')+' — DayTrace';renderArchive()}
  }catch(err){
    if(version!==routeVersion)return;
    main.className='shell error-page';
    main.innerHTML=icon(shared?'lock':'folder',35)+'<h1>'+(shared?'Доступ закрыт':'Не удалось открыть страницу')+'</h1><p>'+esc(shared?'Возможно, автор отключил ссылку или адрес был скопирован не полностью.':err.message)+'</p>'+(shared?'':'<a class="button secondary" data-nav href="/">Открыть ящик</a>');
  }
}
window.addEventListener('popstate',route);
route();
