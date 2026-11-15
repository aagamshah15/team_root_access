'use strict';

function roomPicker(room, page) {
  return '<label class="room-picker">Compartment<select id="room-picker" data-page="'+page+'">'+
    rooms.map(r=>'<option value="'+safe(r.id)+'" '+(r.id===room.id?'selected':'')+'>'+safe(r.name)+'</option>').join('')+'</select></label>';
}

function harvestSummary(r) {
  if (!r.custom) return r.series.find(row=>row.date===r.card.best_day);
  const eligible=r.series.filter(row=>row.date>=r.card.weight_complete_day);
  if (!r.business) return eligible.find(row=>Trip.sellableShare(row.pct_red,truck,r.card.pot_spread_sd)>=truck.earliest_sellable_share);
  return eligible.reduce((best,row)=>!best||row.margin>best.margin?row:best,null);
}

function potShare(r,row) {
  return row.sellable_share ?? Trip.sellableShare(row.pct_red,truck,r.card.pot_spread_sd);
}

function harvestMetrics(r) {
  const currency = r.custom ? v=>'€'+v.toFixed(0) : v=>'€'+v.toFixed(3);
  return {
    money: { title:r.custom?'Room contribution':'Harvest profitability',unit:r.custom?'€ per room':'€ / m² / growing day',
      value:row=>r.custom?row.margin:row.profit_m2_day,format:currency,ink:'#38745d',
      caption:r.custom?'Expected pot sales less the cost of waiting from the crop check.':'Forecast net profit per square metre per growing day.'},
    ripe: {title:'Fruit ripeness',unit:'Red fruit by weight (%)',value:row=>row.pct_red,
      format:percent,ink:'#ab593e',caption:'Share of the fruit weight expected to be red on each harvest date.'}
  };
}

function trend(r,metric,best,day) {
  const series=r.series,values=series.map(metric.value);
  if(values.some(v=>!Number.isFinite(v)))return '<p class="quiet">This room has no price or cost inputs. Create a room with commercial inputs to compare harvest returns.</p>';
  const chartWidth=520, left=52,right=499,top=21,bottom=136;
  const rawMin=Math.min(0,...values),rawMax=Math.max(0,...values);
  const range=(rawMax-rawMin)||1;
  const stepSize=10**Math.floor(Math.log10(range/3));
  const unit=[1,2,2.5,5,10].map(s=>s*stepSize).find(s=>s>=range/3);
  const low=metric.unit.includes('(%)')?0:Math.floor(rawMin/unit)*unit;
  const high=metric.unit.includes('(%)')?100:Math.max(low+unit,Math.ceil(rawMax/unit)*unit);
  const x=i=>left+(right-left)*i/(series.length-1);
  const y=v=>bottom-(bottom-top)*(v-low)/(high-low);
  const line=values.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  const peak=best?series.indexOf(best):-1,i=day,v=values[i];
  const ticks=metric.unit.includes('(%)')?[0,25,50,75,100]:Array.from({length:Math.round((high-low)/unit)+1},(_,j)=>low+j*unit);
  const tickNum=n=>Number(n.toFixed(3)).toString();
  const grid=ticks.map(n=>'<line x1="'+left+'" x2="'+right+'" y1="'+y(n)+'" y2="'+y(n)+'" class="'+(Math.abs(n)<1e-9?'zero':'gridline')+'"/><text x="'+(left-8)+'" y="'+(y(n)+4)+'" text-anchor="end">'+tickNum(n)+'</text>').join('');
  const axis=[0,7,14,series.length-1].map(j=>'<text x="'+x(j)+'" y="159" text-anchor="'+(j===series.length-1?'end':'middle')+'">'+fmt(series[j].date)+'</text>').join('');
  return '<div class="trend-title"><h3>'+metric.title+'</h3><strong style="color:'+metric.ink+'">'+metric.format(v)+'</strong></div><div class="chart-unit">'+metric.unit+'</div>'+
    '<svg class="trend" viewBox="0 0 '+chartWidth+' 168" role="img" aria-label="'+metric.title+' from '+fmt(series[0].date)+' to '+fmt(series.at(-1).date)+'. '+fmt(series[i].date)+': '+metric.format(v)+'">'+grid+
    '<path d="'+line+' L'+right+' '+y(0)+' L'+left+' '+y(0)+' Z" fill="'+metric.ink+'" opacity=".075"/>'+
    (peak<0?'':'<line x1="'+x(peak)+'" x2="'+x(peak)+'" y1="'+top+'" y2="'+bottom+'" class="peakline"/>')+
    '<path d="'+line+'" fill="none" stroke="'+metric.ink+'" stroke-width="3" stroke-linejoin="round"/>'+
    '<circle cx="'+x(i)+'" cy="'+y(v)+'" r="5" fill="'+metric.ink+'" stroke="white" stroke-width="2"/>'+axis+'</svg><p class="hint">'+metric.caption+'</p>';
}

function harvestEvidence(r) {
  const original=r.demoEvidence?REPLAY.rooms.find(x=>x.id==='ideas'):r;
  const photos=original.photos||[],samples=original.samples||[];
  const sampleLabel=r.demoEvidence?'IDEAS example sample':'Crop sample';
  const measured=samples.filter(p=>p.red/p.total>=truck.sellable_red_share).length;
  const breakdown=samples.map(p=>{
    const ratio=p.red/p.total;
    return '<li><span class="pot-id">'+safe(p.id)+'</span><span class="pot-meter"><i style="width:'+ratio*100+'%;background:'+(ratio>=truck.sellable_red_share?'#39765d':'#a5aea4')+'"></i></span><strong>'+percent(ratio*100)+'</strong></li>';
  }).join('');
  const measuredView=samples.length?'<div class="sample-summary"><strong>'+measured+' / '+samples.length+'</strong><span>sampled pots met the sale threshold</span></div>'+
    '<ul class="pot-list" aria-label="Red fruit weight by sampled pot">'+breakdown+'</ul><p class="hint">Each bar is one weighed pot. The marker is the one-third red fruit threshold.</p>':
    (r.measurement?'<div class="sample-summary"><strong>'+percent(100*r.measurement.red/r.measurement.total)+'</strong><span>red fruit by sample weight</span></div><p class="hint">'+number(r.measurement.red)+' g red fruit out of '+number(r.measurement.total)+' g total. Individual pot counts were not recorded.</p>':'<p class="soft">The saved room includes a ripeness estimate. Individual pot weights are unavailable.</p>');
  return '<section class="panel evidence">'+heading('Crop evidence','<span class="tag">'+fmt(r.card.today,true)+'</span>')+
    '<div class="evidence-layout"><div class="camera">'+(photos.length?
    '<div class="topline"><h3>'+(r.demoEvidence?'IDEAS reference photos':'Canopy camera')+'</h3><div class="photo-tabs">'+photos.map((p,i)=>'<button type="button" data-photo="'+i+'" aria-pressed="'+(!i)+'">'+fmt(p.date)+'</button>').join('')+'</div></div><div id="photo-view"></div>':'<h3>Canopy camera</h3><p class="soft hspace">No photo was supplied for this room.</p>')+
    '</div><div class="sample"><h3>'+sampleLabel+'</h3>'+measuredView+'</div></div></section>';
}

function dashboard(r) {
  const best=harvestSummary(r),metrics=harvestMetrics(r);
  const hasMoney=!r.custom||!!r.business;
  const bestIndex=best?r.series.indexOf(best):0;
  const date=best?fmt(best.date):'Beyond outlook';
  const titleText=r.custom?(hasMoney?'Best harvest day':'Earliest ready day'):'Best harvest day';
  const reason=best?(r.custom?(hasMoney?'Highest estimated room contribution after plants reach full weight.':'First full-weight day with at least 95% of pots estimated saleable.'):'Highest forecast profit per square metre per growing day.'):'No eligible harvest date in the next 21 days.';
  const range=r.card.optimal_from?'<p class="range">Near-peak window &nbsp; <b>'+fmt(r.card.optimal_from)+' – '+fmt(r.card.optimal_to)+'</b></p>':'';
  const stat=(label,val,detail)=>'<div class="harvest-stat"><span>'+label+'</span><strong>'+val+'</strong><small>'+detail+'</small></div>';
  main.innerHTML=title('Grower workspace','Harvest outlook',source(r)+' · Forecast as of '+fmt(r.card.today,true),roomPicker(r,'home'))+
    '<section class="harvest-band" aria-label="Harvest recommendation for '+safe(r.name)+'"><div class="best-block"><div class="micro">'+safe(r.name)+' / '+titleText+'</div><h2>'+date+'</h2><p>'+reason+'</p>'+range+'</div><div class="harvest-stats">'+
    stat(r.custom?'Room contribution':'Forecast profit',best&&hasMoney?metrics.money.format(metrics.money.value(best)):'—',r.custom?'Expected sales less waiting costs':'per m² per growing day')+
    stat('Red fruit at harvest',best?percent(best.pct_red):'—','by fruit weight')+
    stat('Saleable pots at harvest',best?percent(potShare(r,best)*100):'—',best&&r.business?'About '+Math.round(r.business.pots*potShare(r,best))+' of '+r.business.pots+' pots':'estimated share of the room')+'</div></section>'+
    '<section class="panel forecast-panel"><div class="bar"><h2>Compare harvest dates</h2><span class="plot-key">Recommended day</span></div><div class="charts"><article id="profit-chart"></article><article id="ripe-chart"></article></div><div class="scrub"><label for="inspect">Inspect a day <output id="inspect-label"></output></label><input type="range" id="inspect" min="0" max="'+(r.series.length-1)+'" value="'+bestIndex+'"><button id="reset-day" class="button" type="button">Back to '+(best?'best day':'first day')+'</button></div></section>'+
    harvestEvidence(r)+'<p class="source">'+(r.custom?'Uploaded room · Projections use a sample-anchored growth scenario.':'Trial observations and forecasts · Wageningen Autonomous Greenhouse Challenge, 2024. Profit is a model estimate.')+' <a href="'+howUrl(r)+'">How it works</a></p>';
  function inspect(i) {
    main.querySelector('#profit-chart').innerHTML=trend(r,metrics.money,best,i);
    main.querySelector('#ripe-chart').innerHTML=trend(r,metrics.ripe,best,i);
    main.querySelector('#inspect-label').textContent=fmt(r.series[i].date);
    main.querySelector('#inspect').setAttribute('aria-valuetext',fmt(r.series[i].date));
  }
  inspect(bestIndex);
  main.querySelector('#inspect').oninput=e=>inspect(Number(e.target.value));
  main.querySelector('#reset-day').onclick=()=>{main.querySelector('#inspect').value=bestIndex;inspect(bestIndex);};
  const evidence=r.demoEvidence?REPLAY.rooms.find(x=>x.id==='ideas'):r;
  function photo(i){
    const p=evidence.photos[i],desc=safe(evidence.name)+' canopy on '+fmt(p.date,true);
    main.querySelector('#photo-view').innerHTML='<figure><a href="../app/'+p.photo+'" target="_blank" rel="noopener" aria-label="Open full '+desc+' photo"><img src="../app/'+p.photo+'" alt="'+desc+'"></a><figcaption>'+fmt(p.date,true)+' · '+(p.photo_usable?'Image passed the camera quality check.':(p.lamps_on?'Lamps on. ':'')+'Image flagged for unreliable color.')+'</figcaption></figure>';
    main.querySelectorAll('[data-photo]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.photo)===i)));
  }
  if(evidence.photos?.length){photo(0);main.querySelectorAll('[data-photo]').forEach(b=>b.onclick=()=>photo(Number(b.dataset.photo)));}
}
