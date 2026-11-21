import {icon,esc,api,navigate,modal,closeModal,shareDialog,toast,dateLabel,moods} from './ui.js';
import {playTrack,stopTrack,playingDay,spotifyLinks} from './media.js';
import {showSpotifyPlayer} from './spotify.js';
import {archivePatina} from './patina.js';
import {buildVisualRecipe} from './visual-recipe.js';
import {contactSheetLayout} from './postcard.js';
import {renderRoadmap,renderTopoBackdrop} from './roadmap.js';

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
  const quote = day.coverText || day.quote || '';
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
function scheduleRoadmap(){
  if(roadmapRaf) cancelAnimationFrame(roadmapRaf);
  roadmapRaf=requestAnimationFrame(()=>{
    roadmapRaf=0;
    if(!main.classList.contains('archive-page'))return;
    const stage=main.querySelector('#roadmap-stage');
    const grid=main.querySelector('#day-grid');
    renderTopoBackdrop(main);
    if(stage && grid) renderRoadmap(stage,grid,roadmapList);
  });
}
function updateGrid(){
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
  const lead=favorites
    ?'Отложенные пластинки, к которым хочется возвращаться и переслушивать.'
    :pluralAlbums(allDays.length)+'. Каждый день — конверт с контактным листом, палитрой и ритмом.';
  const actions=!shared
    ?'<div class="crate-actions"><a class="button primary" data-nav href="/create">Записать новый день</a>'+(favorites?'<a class="button secondary" data-nav href="/">Весь ящик</a>':'<button type="button" class="button secondary" data-share>Дать послушать</button>')+'</div>'
    :'';
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
        `<div class="roadmap-stage" id="roadmap-stage"><svg class="roadmap-svg" id="roadmap-svg" aria-hidden="true"></svg><div class="days-grid" id="day-grid"></div></div>`
      : '<div class="empty-grid">'+icon('image',40)+'<h3>Запишите свою первую пластинку</h3><p>Начните с фотографии или видео и пары строк о том, что запомнилось.</p>'+(!shared?'<a class="button primary" data-nav href="/create">Записать новый день</a>':'')+'</div>')+
    '<footer class="archive-footer"><span><img src="/mark.svg" width="18" alt="">DAYTRACE</span><span>'+icon(shared?'link':'lock',13)+(shared?'Ящик по ссылке':'Личный ящик пластинок')+'</span></footer>';
  main.querySelector('#patina-range')?.addEventListener('input',updateAge);
  const onResize=()=>scheduleRoadmap();
  window.addEventListener('resize',onResize,{passive:true});
  let ro=null;
  const gridEl=main.querySelector('#day-grid');
  if(gridEl && typeof ResizeObserver!=='undefined'){
    ro=new ResizeObserver(()=>scheduleRoadmap());
    ro.observe(gridEl);
  }
  dispose=()=>{
    window.removeEventListener('resize',onResize);
    ro?.disconnect();
    if(roadmapRaf){cancelAnimationFrame(roadmapRaf);roadmapRaf=0}
  };
  document.fonts?.ready?.then(()=>scheduleRoadmap());
  updateGrid();
}
function updateAge(event){
  prefs.age=365-Number(event.currentTarget.value);
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
      await module.renderDay(main,day,{
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
