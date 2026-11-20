import {icon,esc,api,navigate,modal,closeModal,shareDialog,toast,dateLabel,moods} from './ui.js';
import {playTrack,stopTrack,playingDay} from './media.js';

import {photoPatina} from './patina.js';

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
  return 'data-age-date="'+esc(day.date)+'" style="--fade:'+photoPatina(day.date,prefs.age).toFixed(4)+'"';
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
function weatherIcon(day){
  return ({warm_haze:'sunrise',mist:'cloud',rain_glass:'rain',wind_sparks:'wind',clear_light:'sun'}[day.weatherType]||'sun');
}
function palette(day) {
  return '<span class="palette" aria-label="Палитра фотографий">'+day.palette.map(c=>'<i style="background:'+esc(c)+'"></i>').join('')+'</span>';
}
function dayUrl(id){return shared?basePath+'?day='+encodeURIComponent(id):'/day/'+encodeURIComponent(id)}
function heroMarkup() {
  const day=heroOrder[heroIndex];if(!day)return '';
  const label=heroOrder.length>1?'<div class="reel-nav"><span aria-live="polite">'+num(heroIndex+1)+' <em>/</em> '+num(heroOrder.length)+'</span><button class="reel-button" data-hero-step="-1" aria-label="Предыдущее воспоминание">'+icon('chevron-left',19)+'</button><button class="reel-button" data-hero-step="1" aria-label="Следующее воспоминание">'+icon('chevron-right',19)+'</button></div>':'';
  return '<article class="hero" data-frame="'+esc(day.id)+'" aria-label="Воспоминание в фокусе"><div class="hero-film patina-photo" '+ageAttributes(day)+'><img class="hero-photo" fetchpriority="high" src="'+esc(day.photos[0].src)+'" alt=""></div><div class="hero-shade"></div><div class="hero-grain" aria-hidden="true"></div><div class="focus-tag">'+icon('scan',14)+'В фокусе</div><div class="hero-details"><div class="hero-date">'+dateLabel(day.date)+'<b></b>'+icon(weatherIcon(day),15)+' '+esc(day.weather)+'</div><h2>'+esc(day.title)+'</h2><p class="hero-quote">«'+esc(day.quote.replace(/[.!?…]$/,''))+'»</p><div class="hero-actions"><a data-nav href="'+dayUrl(day.id)+'" class="button hero-open">Открыть день '+icon('arrow-up-right',16)+'</a><button type="button" class="hero-audio" data-sound="'+esc(day.id)+'" aria-label="Послушать '+esc(day.track.title)+'"><span class="audio-ring">'+icon('play',13)+'</span><span class="hero-track-name">'+esc(day.track.title)+'</span></button></div></div>'+label+'</article>';
}
function card(day){
  const state=moods[day.mood]||moods.calm;
  return '<article class="memory-tile" data-card="'+esc(day.id)+'" '+ageAttributes(day)+'><div class="tile-frame"><a class="image-link" data-nav href="'+dayUrl(day.id)+'" aria-label="Открыть '+esc(day.title)+'"><img class="patina-photo" loading="lazy" src="'+esc(day.photos[0].src)+'" alt="'+esc(day.title)+'"></a>'+
  '<span class="weather-chip">'+icon(weatherIcon(day),14)+esc(day.weather)+'</span>'+
  (!shared?'<button class="save-day '+(day.favorite?'saved':'')+'" data-save="'+esc(day.id)+'" aria-pressed="'+!!day.favorite+'" aria-label="'+(day.favorite?'Убрать из избранного':'В избранное')+'">'+icon('bookmark',17)+'</button>':'')+
  '<span class="tile-palette">'+palette(day)+'</span></div><div class="tile-meta"><time datetime="'+day.date+'">'+dateLabel(day.date)+'</time><span style="--mood-color:'+state.color+'">'+esc(state.label)+'</span></div><h3><a data-nav href="'+dayUrl(day.id)+'">'+esc(day.title)+'</a></h3><div class="tile-audio"><button data-sound="'+esc(day.id)+'" title="Послушать фрагмент" aria-label="Послушать '+esc(day.track.title)+'"><span class="tile-play">'+icon('play',11)+'</span><span>'+esc(day.track.title)+'</span></button><span>'+icon('waveform',15)+' '+(day.track.bpm?Math.round(day.track.bpm)+' BPM':'Аудио')+'</span></div></article>';
}
function updateGrid(){
  let list=currentSet.filter(d=>prefs.filter==='all'||prefs.filter===d.mood);
  list=[...list].sort((a,b)=>prefs.sort==='old'?a.date.localeCompare(b.date):prefs.sort==='warmth'?b.warmth-a.warmth:prefs.sort==='tempo'?(b.track.bpm||0)-(a.track.bpm||0):b.date.localeCompare(a.date));
  const grid=main.querySelector('#day-grid');if(!grid)return;
  grid.innerHTML=list.length?list.map(card).join(''):'<div class="empty-grid">'+icon(favorites?'bookmark':'folder',28)+'<h3>'+(favorites && !currentSet.length?'Здесь будут любимые дни':'Дней с таким настроением пока нет')+'</h3><p>'+(favorites && !currentSet.length?'Нажмите на закладку в углу фотографии, чтобы сохранить день в избранном.':'Выберите другое настроение или откройте весь архив.')+'</p><button class="button secondary" data-reset-filter>'+(favorites && !currentSet.length?'В архив':'Показать все дни')+'</button></div>';
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
  '<div id="archive-time-controls" class="archive-time-controls" hidden><label for="patina-range">Выцветание снимков</label><div class="age-slider"><span>Сейчас</span><input id="patina-range" type="range" min="0" max="365" value="'+prefs.age+'"><span>Через год</span></div><output for="patina-range">'+ageLabel()+'</output></div>'+
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
    el.style.setProperty('--fade',photoPatina(el.dataset.ageDate,prefs.age).toFixed(4));
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
    b.setAttribute('aria-pressed',String(on));
    const track=allDays.find(day=>day.id===b.dataset.sound)?.track;
    b.setAttribute('aria-label',(on?'Пауза':'Послушать')+' '+(track?.title||''));
  });
  const hero=main.querySelector('[data-frame]');
  if(hero)hero.classList.toggle('is-playing',hero.dataset.frame===id);
  main.querySelectorAll('[data-card]').forEach(el=>el.classList.toggle('is-playing',el.dataset.card===id));
}
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
