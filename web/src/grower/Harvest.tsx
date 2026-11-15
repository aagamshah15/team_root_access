import { useState } from 'react';
import { area, line, scaleLinear } from 'd3';
import { euro, pct, share } from '../data/format';
import type { Truck } from '../data/types';
import { bestDay, fmt, saleable, type Room } from './model';

function Trend({room,index,best,profit}:{room:Room;index:number;best:number;profit?:boolean}){
  const title=profit?(room.custom?'Room contribution':'Harvest profitability'):'Fruit ripeness';
  const values=room.series.map(r=>profit?(room.custom?r.margin:r.profit_m2_day):r.pct_red);
  if(values.some(v=>v==null))return <article><h3>{title}</h3><p className="hint">No commercial inputs were saved for this room.</p></article>;
  const points=values as number[],color=profit?'#38745d':'#ab593e';
  const x=scaleLinear().domain([0,Math.max(1,points.length-1)]).range([52,498]);
  const low=Math.min(0,...points),high=Math.max(0,...points);
  const y=scaleLinear().domain(profit?[low,high===low?low+1:high]:[0,100]).range([135,20]).nice(4);
  const path=line<number>().x((_,i)=>x(i)).y(v=>y(v));
  const fill=area<number>().x((_,i)=>x(i)).y0(y(0)).y1(v=>y(v));
  const value=profit?euro(points[index],room.custom?0:3):pct(points[index]);
  return <article><div className="trend-title"><h3>{title}</h3><strong style={{color}}>{value}</strong></div>
    <div className="chart-unit">{profit?(room.custom?'€ per room':'€ / m² / growing day'):'Red fruit by weight (%)'}</div>
    <svg className="trend" viewBox="0 0 520 168" role="img" aria-label={title+' on '+fmt(room.series[index].date)+': '+value}>
      {y.ticks(4).map(t=><g key={t}><line x1="52" x2="498" y1={y(t)} y2={y(t)} className={t===0?'zero':'gridline'}/><text x="44" y={y(t)+4} textAnchor="end">{t}</text></g>)}
      <path d={fill(points)??''} fill={color} opacity=".075"/>
      {best>=0&&<line x1={x(best)} x2={x(best)} y1="20" y2="135" className="peakline"/>}
      <path d={path(points)??''} stroke={color} strokeWidth="3" fill="none" strokeLinejoin="round"/>
      <circle cx={x(index)} cy={y(points[index])} r="5" fill={color} stroke="white" strokeWidth="2"/>
      {points.map((_,i)=>(i%7===0||i===points.length-1)&&<text key={i} x={x(i)} y="159" textAnchor={i===points.length-1?'end':'middle'}>{fmt(room.series[i].date)}</text>)}
    </svg><p className="hint">{profit?(room.custom?'Expected pot sales less the cost of waiting from the crop check.':'Forecast net profit per square metre per growing day.'):'Share of fruit weight expected to be red on each harvest date.'}</p></article>;
}

function Evidence({room,source,truck}:{room:Room;source:Room;truck:Truck}){
  const [index,setIndex]=useState(0);
  const photos=source.photos??[],photo=photos[index],pots=source.samples??[];
  const ready=pots.filter(p=>p.red/p.total>=truck.sellable_red_share).length;
  return <section className="panel evidence"><div className="bar"><h2>Crop evidence</h2><span className="tag">{fmt(room.card.today,true)}</span></div>
    <div className="evidence-layout"><div className="camera"><div className="topline"><h3>{room.demoEvidence?'IDEAS reference photos':'Canopy camera'}</h3>
    <div className="photo-tabs">{photos.map((p,i)=><button key={p.date} aria-pressed={index===i} onClick={()=>setIndex(i)}>{fmt(p.date)}</button>)}</div></div>
    {photo?.photo?<figure><a href={photo.photo} target="_blank" rel="noreferrer"><img src={photo.photo} alt={source.name+' canopy on '+fmt(photo.date,true)}/></a>
      <figcaption>{fmt(photo.date,true)} · {photo.photo_usable?'Image passed the camera quality check.':(photo.lamps_on?'Lamps on. ':'')+'Image flagged for unreliable color.'}</figcaption></figure>:<p className="soft hspace">No photo was supplied for this room.</p>}</div>
    <div className="sample"><h3>{room.demoEvidence?'IDEAS example sample':'Crop sample'}</h3>
    {pots.length>0?<><div className="sample-summary"><strong>{ready} / {pots.length}</strong><span>sampled pots met the sale threshold</span></div>
      <ul className="pot-list" aria-label="Measured red fruit weight by pot">{pots.map(p=>{const ratio=p.red/p.total;return <li key={p.id}><span>{p.id}</span><span className="pot-meter"><i style={{width:100*ratio+'%',background:ratio>=truck.sellable_red_share?'#39765d':'#a5aea4'}}/></span><strong>{share(ratio)}</strong></li>;})}</ul>
      <p className="hint">Each bar is one weighed pot. The marker shows the one-third red fruit threshold.</p></>:<p className="soft hspace">{room.measurement?room.measurement.red+' g red fruit out of '+room.measurement.total+' g total. ':''}Individual pot counts are unavailable.</p>}</div></div></section>;
}
export function Harvest({room,ideas,truck}:{room:Room;ideas:Room;truck:Truck}){
  const best=bestDay(room,truck),bestIndex=best?room.series.indexOf(best):-1;
  const [index,setIndex]=useState(Math.max(0,bestIndex));
  const amount=room.custom?best?.margin:best?.profit_m2_day;
  const stats=[
    [room.custom?'Room contribution':'Forecast profit',euro(amount,room.custom?0:3),room.custom?'Sales less waiting costs':'per m² per growing day'],
    ['Red fruit at harvest',pct(best?.pct_red),'by fruit weight'],
    ['Saleable pots at harvest',best?share(saleable(room,best,truck)):'—',best&&room.business?'About '+Math.round(room.business.pots*saleable(room,best,truck))+' of '+room.business.pots+' pots':'estimated share of the room']
  ];
  return <><section className="harvest-band"><div className="best-block"><div className="micro">{room.name} / {room.custom&&!room.business?'Earliest ready day':'Best harvest day'}</div><h2>{best?fmt(best.date):'Beyond outlook'}</h2>
    <p>{!best?'No eligible harvest date in the next 21 days.':!room.custom?'Highest forecast profit per square metre per growing day.':room.business?'Highest estimated room contribution after plants reach full weight.':'First full-weight day with at least 95% of pots estimated saleable.'}</p>
    {room.card.optimal_from&&<p className="range">Near-peak window &nbsp; <b>{fmt(room.card.optimal_from)} – {fmt(room.card.optimal_to)}</b></p>}</div>
    <div className="harvest-stats">{stats.map(([label,val,note])=><div key={label} className="harvest-stat"><span>{label}</span><strong>{val}</strong><small>{note}</small></div>)}</div></section>
    <section className="panel forecast-panel"><div className="bar"><h2>Compare harvest dates</h2>{best&&<span className="plot-key">Recommended day</span>}</div>
      <div className="charts"><Trend room={room} index={index} best={bestIndex} profit/><Trend room={room} index={index} best={bestIndex}/></div>
      <div className="scrub"><label htmlFor="inspect">Inspect a day <output>{fmt(room.series[index].date)}</output></label><input id="inspect" type="range" min="0" max={room.series.length-1} value={index} aria-valuetext={fmt(room.series[index].date)} onChange={e=>setIndex(Number(e.target.value))}/>
        <button className="button" onClick={()=>setIndex(Math.max(0,bestIndex))}>Back to {best?'best day':'first day'}</button></div></section>
    <Evidence room={room} source={room.demoEvidence?ideas:room} truck={truck}/>
    <p className="source">{room.custom?'Projection based on your sample and a growth scenario.':'Wageningen Autonomous Greenhouse Challenge, 2024 (CC BY 4.0). Profit is a model estimate.'} <a href={'#how/'+room.id}>How it works</a></p></>;
}
