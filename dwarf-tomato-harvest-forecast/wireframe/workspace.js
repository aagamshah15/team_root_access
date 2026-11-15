'use strict';
const main = document.querySelector('main');
const truck = REPLAY.truck;
const storageKey = 'harvest-window-wireframe-rooms-v1';
const exampleFile = '../web/src/grower/example-temperatures.csv';
const safe = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayMs = 86400000;
const shift = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * dayMs).toISOString().slice(0,10);
const fmt = (date, year = false) => new Date(date + 'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',...(year ? {year:'numeric'} : {}),timeZone:'UTC'});
const percent = n => Math.round(n) + '%';
const number = n => Number(n.toFixed(2)).toString();
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && shift(s,0) === s;
let saved = [];
try { saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch {}
const rooms = [...REPLAY.rooms,...(Array.isArray(saved) ? saved.filter(r => r?.custom && r?.card?.today && r?.series?.length) : [])];
const plans = new Map();
let chosen = rooms[0];
let uploadSession = 0;
const title = (over, heading, sub, action='') => '<section class="hero"><div><div class="eyebrow">'+over+'</div><h1>'+heading+'</h1><p class="sub">'+sub+'</p></div>'+action+'</section>';
const heading = (a,b='') => '<div class="bar"><h2>'+a+'</h2>'+b+'</div>';
const fact = (k,v) => '<div><dt>'+k+'</dt><dd>'+v+'</dd></div>';
const dates = (harvest, arrival) => '<div class="journey">'+[['Harvest',harvest],['Dispatch',harvest],['Arrive',arrival]].map(([k,v])=>'<div class="step"><span class="micro">'+k+'</span><strong>'+(v ? fmt(v) : '—')+'</strong></div>').join('')+'</div>';
const roomUrl = r => '#ship/'+encodeURIComponent(r.id);
const howUrl = r => '#how/'+encodeURIComponent(r.id);
const source = r => r.demo ? 'Demo room' : r.custom ? 'Uploaded room' : '2024 trial replay';
function defaults(r){return {miles:350,deadline:shift(r.card.today,10),temp:13,shop:20,shelf:5};}
function calculate(r, t){
  const km=t.miles*1.609344, days=Trip.transitDays(km,truck);
  const rows=r.series.map(f=>{
    const arrival=shift(f.date,days);
    const ripeness=Trip.ripen(f.pct_red,r.card.k_x1000/1000,days*Math.max(t.temp-truck.base_temp_c,0));
    const sellable=Trip.sellableShare(ripeness,truck,r.card.pot_spread_sd);
    const shelf=Trip.shelf(ripeness,r.card.k_x1000/1000,Math.max(t.shop-truck.base_temp_c,0),truck).best_days;
    const failures=[];
    if(days>truck.max_transit_days) failures.push('Trip too long');
    if(f.date<r.card.weight_complete_day) failures.push('Still gaining weight');
    if(sellable<truck.earliest_sellable_share) failures.push('Too few saleable pots');
    if(shelf===null||shelf<t.shelf) failures.push('Short display life');
    if(arrival>t.deadline) failures.push('Arrives late');
    return {...f,arrival,ripeness,sellable,shelf,failures};
  });
  return {t,km,days,rows,best:rows.find(x=>!x.failures.length)};
}
function result(r,p){
  if(!p)return '<div class="empty"><h2>When should I harvest?</h2>'+dates()+'<p class="soft">Enter the buyer’s deadline and trip details, then calculate to see the earliest harvest that fits.</p></div>';
  const b=p.best, fit=p.rows.filter(x=>!x.failures.length);
  const boundary=p.rows.find(x=>x.failures.length===1&&x.failures[0]==='Arrives late');
  let reason=boundary ? 'The earliest crop-ready shipment would arrive '+fmt(boundary.arrival)+', after the '+fmt(p.t.deadline)+' deadline.' : 'Review the checks below to see which requirements rule out each day.';
  if(p.days>truck.max_transit_days)reason='This trip takes '+p.days+' days. The shipping scenario supports up to '+truck.max_transit_days+' days.';
  return '<div class="micro">Shipping recommendation</div><h2 class="compact">'+(b ? 'Harvest '+fmt(b.date) : 'No date meets this order')+'</h2>'+ (b ? dates(b.date,b.arrival)+'<p class="quiet">Earliest harvest that meets crop weight, arrival quality, display life, and the buyer’s deadline.</p><dl class="facts">'+fact('Red fruit at arrival',percent(b.ripeness))+fact('Estimated saleable pots',percent(b.sellable*100))+fact('Days in best display condition',b.shelf)+fact('Last feasible harvest',fmt(fit.at(-1).date))+'</dl>' : '<p class="quiet hspace">'+reason+'</p>')+
  (p.t.temp<10?'<p class="quiet hspace">Chilling risk below 10 °C. Check the truck setting before dispatch.</p>':'')+
  '<details class="hspace" '+(b?'':'open')+'><summary>Compare candidate harvest days</summary><div class="sheet"><table><thead><tr><th>Harvest</th><th>Arrival</th><th>Saleable</th><th>Order checks</th></tr></thead><tbody>'+p.rows.map(x=>'<tr class="'+(x===b?'active-row':'')+'"><td>'+fmt(x.date)+'</td><td>'+fmt(x.arrival)+'</td><td>'+percent(x.sellable*100)+'</td><td>'+(x.failures.join(' · ')||(x===b?'Earliest fit':'Fits'))+'</td></tr>').join('')+'</tbody></table></div></details><p class="hspace"><a class="link" href="'+howUrl(r)+'">See how this was calculated →</a></p>';
}
const field=(label,name,type,value,attrs='')=>'<label>'+label+'<input name="'+name+'" type="'+type+'" value="'+safe(value)+'" '+attrs+' required></label>';
function room(r){
  const p=plans.get(r.id), t=p?.t||defaults(r);
  main.innerHTML=title('Order & transport','Shipment planner',safe(r.name)+' · '+source(r)+' · '+fmt(r.card.today,true),roomPicker(r,'ship'))+
  '<div class="split plans"><section class="panel">'+heading('Order & transport')+'<form id="trip" class="pad stack">'+field('Deliver by','deadline','date',t.deadline)+field('Road distance (miles)','miles','number',t.miles,'min="0" max="20000" step="any"')+
  '<div class="fields">'+field('Truck (°C)','temp','number',t.temp,'min="0" max="40" step="any"')+field('Display days needed','shelf','number',t.shelf,'min="1" max="60" step="1"')+'</div><details><summary>Shop temperature</summary>'+field('Shop (°C)','shop','number',t.shop,'min="11" max="40" step="any"')+'</details><p class="hint">Assumes one driver and dispatch on harvest day. Edit the example inputs for your order.</p><button class="button primary">Calculate harvest date →</button></form></section><section class="stack"><div class="panel pad result" id="result" aria-live="polite">'+result(r,p)+'</div><div class="panel pad"><div class="topline"><h3>Crop outlook</h3><span class="tag">'+fmt(r.card.today)+'</span></div><dl class="facts">'+fact('Red fruit by weight',percent(r.series[0].pct_red))+fact(r.custom?'Grower’s full-weight date':'Estimated full-weight date',fmt(r.card.weight_complete_day))+(r.custom?'':fact('Ripeness scenario range',percent(r.card.pct_red_low)+' – '+percent(r.card.pct_red_high)))+'</dl><p class="hint">'+(r.custom?'Projection from your crop check and uploaded temperatures.':'Replay estimates for the selected compartment. Transport and display quality are scenarios.')+'</p></div></section></div>';
  const form=main.querySelector('#trip'),out=main.querySelector('#result');
  form.oninput=()=>{plans.delete(r.id);out.innerHTML='<h2>Trip inputs changed</h2><p class="soft compact">Calculate again to update your harvest and arrival dates.</p>';};
  form.onsubmit=e=>{e.preventDefault();const d=new FormData(form),t={deadline:d.get('deadline')};for(const k of ['miles','temp','shelf','shop'])t[k]=Number(d.get(k));
    const plan=calculate(r,t);plans.set(r.id,plan);out.innerHTML=result(r,plan);if(matchMedia('(max-width:720px)').matches)out.scrollIntoView({block:'start'});};
}
function how(r){
  const p=plans.get(r.id)||calculate(r,defaults(r)), t=p.t,b=p.best||p.rows[0],k=r.card.k_x1000/1000;
  const routeExample=p.days===0?'Within the same-day distance limit.':'Round up '+number(p.km)+' ÷ ('+truck.avg_speed_kmh+' × '+truck.driving_hours_per_day+') = '+p.days+' days.';
  const step=(name,desc,calc)=>'<article><div><h3>'+name+'</h3><p class="soft">'+desc+'</p><code class="formula">'+calc+'</code></div></article>';
  main.innerHTML=title('Decision guide','How it works','Follow one candidate harvest day from a crop reading to a delivery decision.')+
  '<div class="two"><section class="panel">'+heading('From crop to customer')+'<div class="pad flow">'+
  step('Forecast ripeness',r.custom?'Start at the measured red share. Extend the curve using the average warmth in the uploaded week.':'The replay uses a fitted ripening curve driven by heat above 10 °C. Available canopy and crop checks help set its starting point.',(r.custom?'Projected':'Replay')+' red fruit on '+fmt(b.date)+' = '+number(b.pct_red)+'% by weight')+
  step('Choose the greenhouse harvest day',r.custom?(r.business?'For each day after plants reach full weight, multiply saleable pots by price and subtract the extra cost of waiting.':'Choose the earliest full-weight date with at least 95% of pots saleable.'):'Compare daily net profit across harvest dates. The replay subtracts plant and operating costs from sales and divides by area and growing days.',harvestSummary(r)?'Recommended greenhouse harvest: '+fmt(harvestSummary(r).date):'No eligible day within the forecast')+
  step('Estimate the trip','One driver travels at 70 km/h for up to 8 hours a day. Routes up to 300 km (186.4 miles) use same-day delivery.',number(t.miles)+' mi × 1.609344 = '+number(p.km)+' km. '+routeExample)+
  step('Check arrival quality','The shipping scenario extends the ripening curve at the truck temperature. It estimates variation across pots and time in the 70–90% red display range.',p.days+' days × max('+number(t.temp)+' − 10, 0) = '+number(p.days*Math.max(t.temp-10,0))+' degree-days<br>Arrival red share = '+number(b.ripeness)+'% · saleable pots = '+percent(b.sellable*100))+
  step('Choose the earliest fit','Keep dates after the crop reaches full weight, including that day. Require at least 95% saleable pots at arrival, enough display days and an on-time delivery.',fmt(b.date)+' + '+p.days+' transit days = '+fmt(b.arrival)+' arrival<br>Order checks: '+(b.failures.join(' · ')||'all passed'))+
  '</div></section><aside class="stack"><div class="panel">'+heading(plans.has(r.id)?'Your calculation':'Worked example')+'<div class="pad"><h2>'+safe(r.name)+'</h2><p class="soft">'+(p.best?'Earliest feasible harvest':'First candidate checked')+' · '+fmt(b.date,true)+'</p><dl class="facts">'+fact('Delivery deadline',fmt(t.deadline))+fact('Truck temperature',t.temp+' °C')+fact('Display days needed',t.shelf)+fact('Estimated display days',b.shelf??'Unknown')+'</dl><a class="button wide" href="'+roomUrl(r)+'">Adjust trip inputs →</a></div></div><details class="panel pad"><summary>Ripening calculation & assumptions</summary><p class="soft">For a red share p between 0 and 1, the model adds warmth to the log odds of ripeness.</p><code class="formula">log odds at arrival = ln(p / (1 − p)) + k × trip degree-days<br>k = '+number(k*1000)+' / 1,000<br>red share = 1 / (1 + exp(−log odds))</code><p class="hint hspace">A pot qualifies at one-third red fruit by weight. The model checks 40 representative pots. Transport and display estimates use assumed conditions. The trial measured greenhouse crops and did not track shipments.</p></details></aside></div>';
}
function parseTemps(raw){
  const lines=raw.replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(s=>s.trim());
  const split=s=>s.split(',').map(x=>x.trim().replace(/^"(.*)"$/,'$1'));
  const headers=split(lines.shift()||'').map(x=>x.toLowerCase()),di=headers.indexOf('date'),ti=headers.indexOf('mean_temp_c');
  if(di<0||ti<0)throw Error('Include the columns date and mean_temp_c. Download the example for the format.');
  if(!lines.length)throw Error('Add at least one daily temperature reading below the column names.');
  const seen=new Set();
  return lines.map((s,i)=>{
    const cells=split(s),date=cells[di],value=cells[ti],temp=Number(value);
    if(!isDate(date||''))throw Error('Row '+(i+2)+' needs a valid date in YYYY-MM-DD format.');
    if(!value||!Number.isFinite(temp)||temp<0||temp>50)throw Error('Row '+(i+2)+' needs a daily mean between 0 and 50 °C.');
    if(seen.has(date))throw Error('Row '+(i+2)+' repeats '+date+'. Use one daily mean per date.');
    seen.add(date);return {date,temp};
  }).sort((a,b)=>a.date.localeCompare(b.date));
}
const DEMO_TEMPERATURES = "date,mean_temp_c\n2024-10-30,21.0785\n2024-10-31,21.0104\n2024-11-01,20.1434\n2024-11-02,21.0965\n2024-11-03,20.6309\n2024-11-04,20.6073\n2024-11-05,20.6635\n";
function addRoom(){
  const session=++uploadSession;
  let readings=[], demo=false, fileVersion=0, candidate=null;
  main.innerHTML=title('Compartment setup','Add a room','Start with your temperature file and a weighed crop sample.')+
    '<section class="demo-launch"><div><h3>Try the East Glasshouse demo</h3><p>Walk through a new room with seven days of temperatures and a six-pot crop check from IDEAS.</p></div><button class="button" id="load-demo">Load demo data</button></section>'+
    '<div class="two" id="entry"><form id="upload" class="panel">'+heading('Room and crop check')+'<div class="pad stack">'+field('Compartment name','name','text','','maxlength="50" placeholder="e.g. East Glasshouse"')+
    '<div class="drop"><label for="csv">Daily temperature file</label><p class="hint">CSV · dates and mean air temperature in °C · up to 2 MB</p><input id="csv" type="file" accept=".csv,text/csv"><a class="link" href="'+exampleFile+'" download="temperature-example.csv">Download example CSV</a></div><div id="file-feedback" class="hint filelabel" role="status">Choose a file to preview its readings.</div>'+
    '<div><h3>Latest crop check</h3><p class="hint">Weigh red and total fruit from the same sample on the last date in your file.</p></div><div class="fields">'+field('Red fruit weight (g)','red','number','','min="0" max="10000000" step="any"')+field('Total fruit weight (g)','total','number','','min="0.01" max="10000000" step="any"')+'</div>'+
    field('Expected full-weight date','weight','date','')+'<h3>Harvest economics</h3><div class="fields">'+field('Pots in the room','pots','number','','min="1" max="1000000"')+field('Sale price per pot (€)','price','number','','min="0.01" max="10000" step="any"')+'</div>'+field('Daily room cost (€)','cost','number','','min="0" max="1000000" step="any"')+
    '<div id="room-error" class="error" role="alert"></div><button class="button primary">Review room →</button></div></form>'+
    '<aside class="panel">'+heading('Upload preview')+'<div class="pad stack"><div id="preview"><h3>Example file format</h3>'+tempTable([{date:'2024-11-03',temp:20.63},{date:'2024-11-04',temp:20.61}])+'</div><p class="quiet">Your crop check sets starting ripeness. The past week’s available temperatures drive a 21-day growth scenario.</p><p class="hint">Rooms are saved in this browser.</p></div></aside></div><section id="review" class="panel" hidden></section>';
  const form=main.querySelector('#upload'),file=form.querySelector('#csv'),feedback=main.querySelector('#file-feedback'),preview=main.querySelector('#preview'),err=main.querySelector('#room-error');
  const sampleRoom=REPLAY.rooms.find(x=>x.id==='ideas');
  const sumG=key=>Number(sampleRoom.samples.reduce((sum,p)=>sum+p[key],0).toFixed(2));
  function showReadings(values,label){
    readings=values;
    feedback.className='hint filelabel';
    feedback.textContent=label+' · '+values.length+' readings · sample date '+fmt(values.at(-1).date,true);
    preview.innerHTML='<h3>Temperature readings</h3>'+tempTable(values.slice(-7));
  }
  file.onchange=async()=>{
    const version=++fileVersion;readings=[];err.textContent='';preview.textContent='Waiting for valid readings.';
    const f=file.files[0];if(!f){feedback.textContent='Choose a CSV file.';return;}
    try{
      if(f.size>2000000)throw Error('Use a daily summary under 2 MB.');
      const values=parseTemps(await f.text());
      if(session!==uploadSession||version!==fileVersion)return;
      showReadings(values,f.name);
      if(!form.elements.weight.value)form.elements.weight.value=values.at(-1).date;
    }catch(e){if(version===fileVersion){feedback.className='error filelabel';feedback.textContent=e.message;}}
  };
  main.querySelector('#load-demo').onclick=()=>{
    demo=true;fileVersion++;file.value='';err.textContent='';
    main.querySelector('#entry').hidden=false;main.querySelector('#review').hidden=true;
    showReadings(parseTemps(DEMO_TEMPERATURES),'example-temperatures.csv');
    const fields={name:'East Glasshouse',red:sumG('red'),total:sumG('total'),weight:sampleRoom.card.weight_complete_day,pots:600,price:2.4,cost:24};
    for(const [key,val] of Object.entries(fields))form.elements[key].value=val;
    main.querySelector('#load-demo').textContent='Reload demo data';
    feedback.textContent+=' · IDEAS trial readings. Prices, costs and room size are example inputs.';
  };
  form.onsubmit=e=>{
    e.preventDefault();err.textContent='';
    const d=new FormData(form),name=d.get('name').trim(),red=Number(d.get('red')),total=Number(d.get('total')),weight=d.get('weight');
    const id=demo?'demo-east-glasshouse':'local-'+crypto.randomUUID();
    if(!name||rooms.some(r=>r.id!==id&&r.name.toLowerCase()===name.toLowerCase())){err.textContent='Enter a distinct compartment name.';return;}
    if(!readings.length){err.textContent='Upload a valid temperature file or load the demo data.';return;}
    if(red>total){err.textContent='Red fruit weight cannot exceed total fruit weight.';return;}
    const today=readings.at(-1).date,recent=readings.filter(v=>v.date>=shift(today,-6));
    const warmth=recent.reduce((sum,v)=>sum+Math.max(0,v.temp-truck.base_temp_c),0)/recent.length;
    const p=red/total*100,k=0.018,business={pots:Number(d.get('pots')),price:Number(d.get('price')),cost:Number(d.get('cost'))};
    const demoEvidence=demo&&!file.files.length&&red===sumG('red')&&total===sumG('total')&&today===sampleRoom.card.today;
    const series=Array.from({length:22},(_,i)=>{
      const pct_red=i?Trip.ripen(p,k,warmth*i):p;
      const sellable_share=Trip.sellableShare(pct_red,truck,truck.pot_spread_sd);
      return {date:shift(today,i),pct_red,sellable_share,margin:sellable_share*business.pots*business.price-i*business.cost};
    });
    candidate={id,name,custom:true,demo,demoEvidence,business,measurement:{red,total},card:{today,weight_complete_day:weight,k_x1000:k*1000,pot_spread_sd:truck.pot_spread_sd},series};
    main.querySelector('#entry').hidden=true;
    const review=main.querySelector('#review');review.hidden=false;
    review.innerHTML=heading('Review your room')+'<div class="pad"><h2>'+safe(name)+'</h2><dl class="facts">'+fact('Temperature file',readings.length+' days ending '+fmt(today,true))+fact('Red fruit in sample',number(red)+' / '+number(total)+' g · '+percent(p))+fact('Full-weight date',fmt(weight,true))+fact('Room economics',business.pots+' pots × €'+number(business.price)+' · €'+number(business.cost)+'/day')+'</dl><p class="hint">The outlook compares eligible harvest dates by expected sales less the cost of waiting. It excludes costs incurred before the crop check.</p><div class="error" id="save-error" role="alert"></div><div class="review-actions hspace"><button class="button primary" id="save">Create room & view outlook →</button><button class="button" id="back-edit">Edit inputs</button></div></div>';
    review.scrollIntoView({block:'start'});review.querySelector('#save').focus({preventScroll:true});
    review.querySelector('#back-edit').onclick=()=>{review.hidden=true;main.querySelector('#entry').hidden=false;form.elements.name.focus();};
    review.querySelector('#save').onclick=()=>{
      const others=rooms.filter(r=>r.custom&&r.id!==candidate.id);
      try{localStorage.setItem(storageKey,JSON.stringify([...others,candidate]));}
      catch{review.querySelector('#save-error').textContent='Browser storage is unavailable. Enable local storage to save this room.';return;}
      const old=rooms.findIndex(r=>r.id===candidate.id);
      if(old===-1)rooms.push(candidate);else rooms[old]=candidate;
      plans.delete(candidate.id);chosen=candidate;location.hash='#home/'+candidate.id;
    };
  };
}
function tempTable(arr){return '<table><thead><tr><th>date</th><th>mean_temp_c</th></tr></thead><tbody>'+arr.map(x=>'<tr><td>'+x.date+'</td><td>'+x.temp.toFixed(1)+'</td></tr>').join('')+'</tbody></table>';}
function render(){
  const [page,id]=location.hash.slice(1).split('/');const r=rooms.find(x=>x.id===id)||chosen;
  chosen=r;
  const view=page==='room'?'ship':['ship','new','how'].includes(page)?page:'home';
  document.querySelectorAll('nav a').forEach(a=>{
    const navPage=a.hash.slice(1).split('/')[0];
    a.href='#'+navPage+(navPage==='new'?'':'/'+encodeURIComponent(r.id));
    if(navPage===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  if(view==='ship')room(r);else if(view==='new')addRoom();else if(view==='how')how(r);else dashboard(r);
  const picker=main.querySelector('#room-picker');
  if(picker)picker.onchange=()=>{location.hash='#'+picker.dataset.page+'/'+encodeURIComponent(picker.value);};
  document.title=main.querySelector('h1').textContent+' · Harvest Window';
  window.scrollTo(0,0);
}
document.querySelector('.skip').onclick=e=>{e.preventDefault();main.focus();};
addEventListener('hashchange',()=>{render();main.focus({preventScroll:true});});render();
