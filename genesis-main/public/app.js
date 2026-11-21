import {icon,esc,api,navigate,modal,closeModal,shareDialog,toast,dateLabel,moods} from './ui.js';
import {playTrack,stopTrack,playingDay,spotifyLinks} from './media.js';
import {showSpotifyPlayer} from './spotify.js';

import {archivePatina} from './patina.js';
import {buildVisualRecipe} from './visual-recipe.js';
import {contactSheetLayout} from './postcard.js';

const main=document.querySelector('#main');
const header=document.querySelector('#site-header');
const num=n=>String(n).padStart(2,'0');
const sortNames={date:'Сначала новые',old:'Сначала ранние',warmth:'По теплоте',tempo:'По темпу'};
function savedAge(){
  try {
    const days=Number(sessionStorage.getItem('daytrace-time-offset'));
    return Number.isFinite(days)?Math.max(0,Math.min(365,days)):0;
  }catch{return 0}
}
const prefs={filter:'all',sort:'date',age:savedAge()};
const ageLabel=()=>prefs.age?'+'+prefs.age+' дн.':'Сейчас';
function ageAttributes(day){
  return 'data-age-date="'+esc(day.date)+'" style="--fade:'+archivePatina(day.date,prefs.age).toFixed(4)+'"';
}
let allDays=[], currentSet=[], heroOrder=[], heroIndex=0, routeVersion=0, dispose=null, shared=false, favorites=false, basePath='/';
const brand='<img src="/mark.svg" alt="" width="37" height="37"><span>DayTrace</span>';
function renderHeader() {
  const inArchive=location.pathname==='/' && !favorites;
  const home=shared?basePath:'/';
  header.innerHTML='<div class="header-wrap"><a class="brand" data-nav href="'+esc(home)+'" aria-label="DayTrace, на главную">'+brand+'</a>'+
    (shared?'<span class="read-only">'+icon('lock',14)+'Только просмотр</span>':'<nav class="main-nav" aria-label="Навигация"><a data-nav class="'+(inArchive?'active':'')+'" href="/" '+(inArchive?'aria-current="page"':'')+'>'+icon('archive',17)+'Мой архив</a><a data-nav class="'+(favorites?'active':'')+'" href="/?view=favorites" '+(favorites?'aria-current="page"':'')+'>'+icon('bookmark',16)+'Избранное</a></nav>'+
    '<a class="button primary new-day" data-nav href="/create">'+icon('plus',18)+'Новый день</a>')+'</div>';
}
document.addEventListener('click',event=>{
  const link=event.target.closest('a[data-nav]');
  if(link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button===0){event.preventDefault();navigate(link.getAttribute('href'))}
});
function shortStamp(iso){
  return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(new Date(iso+'T12:00:00'));
}
function weatherIcon(type){
  return ({warm_haze:'sunrise',mist:'cloud',rain_glass:'rain',wind_sparks:'wind',clear_light:'sun'}[type]||'sun');
}
function palette(colors) {
  return '<span class="palette" aria-label="Палитра открытки">'+colors.map(c=>'<i style="background:'+esc(c)+'"></i>').join('')+'</span>';
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
function heroMarkup() {
  const day=heroOrder[heroIndex];if(!day)return '';
  const recipe=buildVisualRecipe(day);
  const coverText = day.coverText || '«' + day.quote.replace(/[.!?…]$/,'') + '»';
  const indexLine = ['№ ' + num(heroIndex + 1), shortStamp(day.date), recipe.bpm ? Math.round(recipe.bpm) + ' BPM' : null, recipe.weatherLabel.toUpperCase()].filter(Boolean).join(' · ');
  const label=heroOrder.length>1?'<div class="reel-nav"><span aria-live="polite">'+num(heroIndex+1)+' <em>/</em> '+num(heroOrder.length)+'</span><button class="reel-button" data-hero-step="-1" aria-label="Предыдущее воспоминание">'+icon('chevron-left',19)+'</button><button class="reel-button" data-hero-step="1" aria-label="Следующее воспоминание">'+icon('chevron-right',19)+'</button></div>':'';
  const first = day.photos[0];
  const heroMedia = isVideo(first)
    ? '<video class="hero-photo" autoplay muted loop playsinline'+archivePosition(first)+(first.poster?' poster="'+esc(first.poster)+'"':'')+' src="'+esc(first.src)+'"></video>'
    : '<img class="hero-photo" fetchpriority="high"'+archivePosition(first)+' src="'+esc(first.src)+'" alt="">';
  return '<article class="hero patina-card" '+ageAttributes(day)+' data-frame="'+esc(day.id)+'" aria-label="Воспоминание в фокусе">'+heroMedia+'<div class="hero-shade"></div><div class="hero-grain" aria-hidden="true"></div><div class="focus-tag">'+icon('scan',14)+'ЭКСПОНАТ В ФОКУСЕ</div><div class="hero-details"><div class="hero-date">'+esc(indexLine)+'</div><h2>'+esc(day.title)+'</h2><p class="hero-quote">'+esc(coverText)+'</p><div class="hero-actions"><a data-nav href="'+dayUrl(day.id)+'" class="button hero-open">Открыть день '+icon('arrow-up-right',16)+'</a><button type="button" class="hero-audio" data-sound="'+esc(day.id)+'" aria-label="Послушать '+esc(day.track.title)+'"><span class="audio-ring">'+icon('play',13)+'</span><span class="hero-track-name">'+esc(day.track.title)+'</span></button></div></div>'+label+'</article>';
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
function card(day, index){
  const recipe = buildVisualRecipe(day);
  const count = day.photos.length;
  const W = 880, H = 1100;
  const layout = contactSheetLayout(W, H, recipe, count);
  const pct = (val, base) => ((val / base) * 100).toFixed(2) + '%';
  const sepia = Math.min(.26, recipe.amberShift / 28);
  const photoFilter = `saturate(${recipe.saturation.toFixed(2)}) contrast(${recipe.contrast.toFixed(2)}) brightness(${recipe.exposure.toFixed(2)})` + (sepia > .01 ? ` sepia(${sepia.toFixed(2)})` : '');
  const styleAttr = `--cs-bg:${recipe.sheetBg};--cs-ink:${recipe.sheetInk};--cs-muted:${recipe.sheetMuted};--cs-rule:${recipe.sheetRule};--cs-frame:${recipe.frameBorder};--cs-highlight:${recipe.frameHighlight};--cs-backdrop:${recipe.backdrop};--cs-accent:${recipe.palette.at(-1)};--tile-filter:${photoFilter}`;
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
  const trackMeta = [day.track?.artist || 'DayTrace', recipe.bpm ? Math.round(recipe.bpm) + ' BPM' : (spotifyLinks(day.track) ? 'Spotify' : null)].filter(Boolean).join(' · ');
  return `<article class="memory-tile contact-sheet patina-card cs-mode-${esc(layout.style)}${recipe.sheetDark ? ' is-dark' : ''}" data-card="${esc(day.id)}" ${ageAttributes(day)} style="${styleAttr}">` +
    `<header class="cs-head"><span>№${num(index + 1)} · ${shortStamp(day.date)}</span><span class="cs-weather">${esc(recipe.weatherLabel.toUpperCase())}</span><span class="cs-cal" aria-label="Палитра">${swatches}</span></header>` +
    `<div class="cs-stage"><a class="cs-stage-link" data-nav href="${dayUrl(day.id)}" aria-label="Открыть ${esc(day.title)}">${slotsHTML}${powerHTML}${opticalHTML}</a>` +
    (!shared ? `<button class="save-day ${day.favorite ? 'saved' : ''}" data-save="${esc(day.id)}" aria-pressed="${!!day.favorite}" aria-label="${day.favorite ? 'Убрать из избранного' : 'В избранное'}">${icon('bookmark', 14)}</button>` : '') +
    `</div>` +
    `<footer class="cs-foot"><h3><a data-nav href="${dayUrl(day.id)}">${esc(day.title)}</a></h3><p class="cs-quote">«${esc(quote.replace(/^[«"]|[»"]$/g, ''))}»</p>` +
    `<div class="cs-track-bar"><button class="cs-play-btn" data-sound="${esc(day.id)}" aria-label="Послушать ${esc(day.track.title)}"><span class="tile-play">${icon('play', 10)}</span>${layout.style === 'film' ? `<span class="cs-film-label">35MM · ${esc(day.track.title)}</span>` : miniSignatureSVG(recipe)}</button><span class="cs-track-meta">${esc(trackMeta)}</span></div></footer></article>`;
}
function updateGrid(){
  let list=currentSet.filter(d=>prefs.filter==='all'||prefs.filter===d.mood);
  list=[...list].sort((a,b)=>prefs.sort==='old'?a.date.localeCompare(b.date):prefs.sort==='warmth'?b.warmth-a.warmth:prefs.sort==='tempo'?(b.track.bpm||0)-(a.track.bpm||0):b.date.localeCompare(a.date));
  const grid=main.querySelector('#day-grid');if(!grid)return;
  grid.innerHTML=list.length?list.map((d,i)=>card(d,i)).join(''):'<div class="empty-grid">'+icon(favorites?'bookmark':'folder',28)+'<h3>'+(favorites && !currentSet.length?'Здесь будут любимые дни':'Дней с таким настроением пока нет')+'</h3><p>'+(favorites && !currentSet.length?'Нажмите на закладку в углу фотографии, чтобы сохранить день в избранном.':'Выберите другое настроение или откройте весь архив.')+'</p><button class="button secondary" data-reset-filter>'+(favorites && !currentSet.length?'В архив':'Показать все дни')+'</button></div>';
  const count=main.querySelector('#visible-count');if(count) count.textContent=num(list.length);
  refreshSound();
}
function renderArchive(){
  currentSet=allDays.filter(d=>!favorites||d.favorite);
  const featured=currentSet.find(d=>d.id==='meadow')||currentSet[0];
  heroOrder=featured?[featured,...currentSet.filter(d=>d.id!==featured.id)]:[];
  heroIndex=0;
  const title=favorites?'Избранное':shared?'Архив воспоминаний':'Архив воспоминаний';
  const shareButton=!shared && !favorites?'<button class="button secondary share-archive" data-share>'+icon('share',16)+'<span>Поделиться архивом</span></button>':'';
  main.className='archive-page shell';
  main.innerHTML='<div class="archive-heading"><div><h1>'+title+'</h1><p>'+(favorites?'Дни, к которым хочется вернуться.':'Личный дневник в фотографиях, цвете и звуке.')+'</p></div>'+shareButton+'</div>'+
  (!favorites && heroOrder.length?'<div id="featured">'+heroMarkup()+'</div>':'')+
  '<section class="collection"><div class="collection-head"><div class="collection-label"><span class="collection-glyph" aria-hidden="true">'+icon('grid',21)+'</span><h2>'+(favorites?'Сохранённые дни':'Коллекция дней')+'</h2><span class="count" id="visible-count"></span></div><div class="collection-tools"><button class="time-button '+(prefs.age?'time-active':'')+'" data-time aria-label="Ход времени" aria-controls="archive-time-controls" aria-expanded="false">'+icon('time',16)+'<span>'+(prefs.age?ageLabel():'Ход времени')+'</span></button><span class="tool-divider"></span><label class="sort-control">'+icon('sort',17)+'<select aria-label="Сортировка">'+Object.entries(sortNames).map(([k,v])=>'<option value="'+k+'" '+(prefs.sort===k?'selected':'')+'>'+v+'</option>').join('')+'</select>'+icon('chevron-down',13)+'</label></div></div>'+
  '<div id="archive-time-controls" class="archive-time-controls" hidden><label for="patina-range">Выцветание открыток</label><div class="age-slider"><span>Сейчас</span><input id="patina-range" type="range" min="0" max="365" value="'+prefs.age+'"><span>Через год</span></div><output for="patina-range">'+ageLabel()+'</output></div>'+
  '<div class="mood-filters" role="group" aria-label="Настроение дня">'+[['all',{label:'Все дни'}],...Object.entries(moods)].map(([key,m])=>'<button class="mood-filter '+(key===prefs.filter?'selected':'')+'" data-filter="'+key+'" aria-pressed="'+(key===prefs.filter)+'">'+(m.icon?icon(m.icon,15):'')+m.label+'</button>').join('')+'</div><div class="days-grid" id="day-grid"></div></section>'+
  '<footer class="archive-footer"><span><img src="/mark.svg" width="18" alt="">DayTrace</span><span>'+icon(shared?'link':'lock',13)+(shared?'Архив по ссылке':'Личный архив')+'</span></footer>';
  if(!allDays.length){
    main.querySelector('.collection').innerHTML='<div class="empty-grid">'+icon('image',40)+'<h2>Сохраните свой первый день</h2><p>Начните с фотографии и пары строк о том, что запомнилось.</p>'+(!shared?'<a class="button primary" data-nav href="/create">Создать день</a>':'')+'</div>';
  }
  main.querySelector('.sort-control select')?.addEventListener('change',e=>{prefs.sort=e.target.value;updateGrid()});
  main.querySelector('#patina-range')?.addEventListener('input',updateAge);
  updateGrid();
}
function updateAge(event){
  prefs.age=Number(event.currentTarget.value);
  try{sessionStorage.setItem('daytrace-time-offset',String(prefs.age))}catch{}
  const label=ageLabel();
  main.querySelector('#archive-time-controls output').value=label;
  const button=main.querySelector('[data-time]');
  button.classList.toggle('time-active',Boolean(prefs.age));
  button.querySelector('span').textContent=prefs.age?label:'Ход времени';
  main.querySelectorAll('[data-age-date]').forEach(el=>{
    el.style.setProperty('--fade',archivePatina(el.dataset.ageDate,prefs.age).toFixed(4));
  });
}
function toggleTimeControls(button){
  const panel=main.querySelector('#archive-time-controls');
  panel.hidden=!panel.hidden;
  button.setAttribute('aria-expanded',String(!panel.hidden));
  if(!panel.hidden)panel.querySelector('input').focus({preventScroll:true});
}
function refreshSound(){
  const id=playingDay();
  main.querySelectorAll('[data-sound]').forEach(b=>{
    const on=id===b.dataset.sound;
    const mark=b.querySelector('.audio-ring,.tile-play');if(mark)mark.innerHTML=icon(on?'pause':'play',b.classList.contains('hero-audio')?13:11);
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
  if(b.hasAttribute('data-time'))return toggleTimeControls(b);
  if(b.hasAttribute('data-reset-filter')){
    if(favorites&&!currentSet.length)return navigate('/');
    prefs.filter='all';renderArchive();return;
  }
  if(b.dataset.filter){
    prefs.filter=b.dataset.filter;
    main.querySelectorAll('[data-filter]').forEach(el=>{el.classList.toggle('selected',el===b);el.setAttribute('aria-pressed',String(el===b))});
    updateGrid();return;
  }
  if(b.dataset.heroStep){
    heroIndex=(heroIndex+Number(b.dataset.heroStep)+heroOrder.length)%heroOrder.length;
    main.querySelector('#featured').innerHTML=heroMarkup();refreshSound();
    main.querySelector('[data-hero-step="'+b.dataset.heroStep+'"]')?.focus({preventScroll:true});return;
  }
  if(b.dataset.save){
    const day=allDays.find(d=>d.id===b.dataset.save);if(!day)return;
    b.disabled=true;
    try{const result=await api('/api/days/'+day.id+'/favorite',{method:'PUT',body:{favorite:!day.favorite}});day.favorite=result.favorite;
      if(favorites){currentSet=allDays.filter(d=>d.favorite);updateGrid()}
      else{b.classList.toggle('saved',day.favorite);b.setAttribute('aria-pressed',String(day.favorite));b.setAttribute('aria-label',day.favorite?'Убрать из избранного':'В избранное')}
      toast(day.favorite?'День добавлен в избранное':'День убран из избранного');
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
  main.className='shell';main.innerHTML='<div class="page-loading" role="status"><img src="/mark.svg" width="32" alt="">Открываем дневник…</div>';
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
    }else{document.title=(favorites?'Избранное':'Архив воспоминаний')+' — DayTrace';renderArchive()}
  }catch(err){
    if(version!==routeVersion)return;
    main.className='shell error-page';
    main.innerHTML=icon(shared?'lock':'folder',35)+'<h1>'+(shared?'Доступ закрыт':'Не удалось открыть страницу')+'</h1><p>'+esc(shared?'Возможно, автор отключил ссылку или адрес был скопирован не полностью.':err.message)+'</p>'+(shared?'':'<a class="button secondary" data-nav href="/">Открыть архив</a>');
  }
}
window.addEventListener('popstate',route);
route();
