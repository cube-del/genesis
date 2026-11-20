export const moods = {
  calm: {label:'Спокойствие', icon:'waves', color:'#7c9480'},
  joy: {label:'Радость', icon:'sun', color:'#c78c3f'},
  dream: {label:'Мечтательность', icon:'moon', color:'#9484ad'},
  energy: {label:'Энергия', icon:'zap', color:'#d57150'}
};

const shapes = {
  archive:'<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
  grid:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  bookmark:'<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  share:'<path d="M12 15V3m-4 4 4-4 4 4M6 11H5a1 1 0 0 0-1 1v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a1 1 0 0 0-1-1h-1"/>',
  'arrow-up-right':'<path d="M6 18 18 6M7 6h11v11"/>',
  'arrow-left':'<path d="M20 12H4m7-7-7 7 7 7"/>',
  'arrow-right':'<path d="M4 12h16m-7-7 7 7-7 7"/>',
  'chevron-left':'<path d="m14.5 5-7 7 7 7"/>',
  'chevron-right':'<path d="m9.5 5 7 7-7 7"/>',
  'chevron-down':'<path d="m6 9 6 6 6-6"/>',
  'chevron-up':'<path d="m6 15 6-6 6 6"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  sunrise:'<path d="M3 17h18M5 21h14M7 17a5 5 0 0 1 10 0M12 3v5m-3-2 3-3 3 3M3 10l2 2m16-2-2 2"/>',
  sparkles:'<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>',
  moon:'<path d="M20.3 14.2A8.7 8.7 0 0 1 9.8 3.7 8.6 8.6 0 1 0 20.3 14.2Z"/>',
  waves:'<path d="M2 8c4-5 6 4 10 0s6 4 10 0M2 15c4-5 6 4 10 0s6 4 10 0"/>',
  wind:'<path d="M3 8h11a3 3 0 1 0-3-3M2 12h16a3 3 0 1 1-3 3M4 16h4a3 3 0 1 1-3 3"/>',
  cloud:'<path d="M7 18a5 5 0 0 1-1-10 6 6 0 0 1 11.5 1A4.5 4.5 0 0 1 18 18z"/>',
  rain:'<path d="M6 14a4.5 4.5 0 0 1-1-8A6 6 0 0 1 16 7a4 4 0 0 1 2 7M8 16l-1 3m6-3-1 4m6-4-1 3"/>',
  zap:'<path d="M13 2 4 14h7l-1 8 10-13h-7z"/>',
  time:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  sort:'<path d="M4 6h16M4 12h11M4 18h6"/>',
  sliders:'<path d="M3 7h7m4 0h7M3 17h2m4 0h12"/><circle cx="12" cy="7" r="2"/><circle cx="7" cy="17" r="2"/>',
  play:'<path fill="currentColor" stroke="none" d="M7 4.6a1 1 0 0 1 1.5-.9l12 7.4a1 1 0 0 1 0 1.8l-12 7.4a1 1 0 0 1-1.5-.9z"/>',
  pause:'<path stroke-width="3.8" d="M8 5v14M16 5v14"/>',
  music:'<path d="M9 17V6l11-3v12M9 9l11-3"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>',
  headphones:'<path d="M4 16v-4a8 8 0 0 1 16 0v4"/><rect x="3" y="12" width="5" height="8" rx="2"/><rect x="16" y="12" width="5" height="8" rx="2"/>',
  waveform:'<path d="M3 10v4m4-8v12m5-15v18m5-15v12m4-8v4"/>',
  'volume-2':'<path d="M3 9h4l5-4v14l-5-4H3zM16 8q4 4 0 8m3-11q7 7 0 14"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  folder:'<path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  scan:'<path d="M3 9V4h5m8 0h5v5m0 6v5h-5m-8 0H3v-5m0-3h18"/>',
  layers:'<path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  'zoom-in':'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M7.5 10.5h6m-3-3v6"/>',
  'refresh-cw':'<path d="M20 10a8 8 0 0 0-14-4l-3 3m0-5v5h5m-4 5a8 8 0 0 0 14 4l3-3m0 5v-5h-5"/>',
  'external-link':'<path d="M13 3h8v8m0-8L10 14M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  'file-text':'<path d="M5 3h9l5 5v13H5zm8 0v6h6M8 13h8m-8 4h6"/>',
  film:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18m10-18v18M3 8h4m-4 8h4M17 8h4m-4 8h4"/>',
  copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  x:'<path d="m6 6 12 12M18 6 6 18"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  link:'<path d="m10 13 4-4m-5 6-2 2a3.5 3.5 0 0 1-5-5l5-5a3.5 3.5 0 0 1 5 0m0 10a3.5 3.5 0 0 0 5 0l5-5a3.5 3.5 0 0 0-5-5l-2 2"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  heart:'<path d="M12 21 3.5 12.2A5 5 0 0 1 12 5a5 5 0 0 1 8.5 7.2z"/>'
};
const aliases = {clock:'time', close:'x', 'volume':'volume-2',shuffle:'refresh-cw',sparkle:'sparkles',camera:'image','upload-cloud':'upload','cloud-upload':'upload', photo:'image', 'music-2':'music', loader:'refresh-cw', 'circle-check':'check', 'list-music':'music', 'message-circle':'file-text', 'mic':'volume-2', 'headphone':'headphones', 'trash-2':'x'};
export function icon(name,size=20) {
  return '<svg class="ico" width="'+Number(size)+'" height="'+Number(size)+'" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+(shapes[name]||shapes[aliases[name]]||shapes.sparkles)+'</svg>';
}
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function dateLabel(iso) {
  return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date(iso+'T12:00:00')).replace(/\s*г\.$/,'');
}
export async function api(path,options={}) {
  const request={...options,headers:{...options.headers}};
  if(request.body && typeof request.body==='object' && !(request.body instanceof FormData)){
    request.headers['Content-Type']='application/json';
    request.body=JSON.stringify(request.body);
  }
  const response=await fetch(path,request);
  const data=await response.json().catch(()=>null);
  if(!response.ok) throw Object.assign(new Error(data?.error||'Не удалось выполнить запрос.'),{status:response.status});
  return data;
}
export function navigate(path) {
  if(location.pathname+location.search+location.hash!==path) history.pushState({},'',path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
let toastTimer, returnFocus, modalKey, modalClosed;
export function toast(message) {
  const box=document.querySelector('#notifications');
  clearTimeout(toastTimer); box.textContent=message; box.classList.add('visible');
  toastTimer=setTimeout(()=>box.classList.remove('visible'),3600);
}
export function closeModal() {
  const host=document.querySelector('#modal-root');
  if(!host.firstChild) return;
  document.removeEventListener('keydown',modalKey);
  host.replaceChildren(); document.body.classList.remove('modal-open');
  const closed=modalClosed;
  modalClosed=null;
  closed?.();
  if(returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
  returnFocus=null;
}
export function modal(title,html,{wide=false,onClose}={}) {
  closeModal(); returnFocus=document.activeElement; modalClosed=onClose;
  const host=document.querySelector('#modal-root');
  host.innerHTML='<div class="overlay"><section class="modal '+(wide?'wide':'')+'" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="modal-top"><h2 id="dialog-title">'+esc(title)+'</h2><button class="icon-button close-dialog" aria-label="Закрыть">'+icon('x')+'</button></div><div class="modal-body">'+html+'</div></section></div>';
  const overlay=host.firstElementChild;
  const close=overlay.querySelector('.close-dialog');
  close.onclick=closeModal;
  overlay.onpointerdown=e=>{if(e.target===overlay)closeModal()};
  modalKey=e=>{
    if(e.key==='Escape'){closeModal();return}
    if(e.key!=='Tab')return;
    const nodes=[...overlay.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex="0"]')].filter(n=>n.getClientRects().length);
    if(!nodes.length) return;
    if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus()}
    else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus()}
  };
  document.addEventListener('keydown',modalKey);
  document.body.classList.add('modal-open'); close.focus({preventScroll:true});
  return overlay.querySelector('.modal-body');
}
export async function shareDialog(dayId=null) {
  const path='/api/share/'+(dayId?'day/'+encodeURIComponent(dayId):'archive');
  const body=modal(dayId?'Поделиться днём':'Поделиться архивом','<p>Загружаем настройки доступа…</p>');
  function show(state) {
    body.innerHTML='<p class="dialog-lead">'+(dayId?'По ссылке можно посмотреть этот день, его фотографии и послушать музыку.':'По ссылке можно посмотреть все дни архива, в том числе записи, которые появятся позже.')+'</p><div class="share-setting"><div><strong>Доступ по ссылке</strong><small>'+(state.enabled?'Открыт для просмотра':'Выключен')+'</small></div><button class="switch-control" type="button" role="switch" aria-label="Доступ по ссылке" aria-checked="'+state.enabled+'"><span></span></button></div>'+(state.enabled?'<div class="share-copy"><input readonly aria-label="Ссылка для просмотра" value="'+esc(state.url)+'"><button class="button secondary" data-copy>'+icon('copy',17)+'Копировать</button></div>':'');
    body.querySelector('[role=switch]').onclick=async e=>{
      e.currentTarget.disabled=true;
      try{show(await api(path,{method:'PUT',body:{enabled:!state.enabled}}))}catch(err){toast(err.message);show(state)}
    };
    const copy=body.querySelector('[data-copy]');
    if(copy)copy.onclick=async()=>{
      const input=body.querySelector('input');input.select();
      try{if(navigator.clipboard)await navigator.clipboard.writeText(input.value);else if(!document.execCommand('copy'))throw Error();
        copy.innerHTML=icon('check',16)+'Скопировано';
      }catch{toast('Ссылка выделена. Скопируйте её вручную.')}
    };
  }
  try{show(await api(path))}catch(err){body.textContent=err.message}
}
