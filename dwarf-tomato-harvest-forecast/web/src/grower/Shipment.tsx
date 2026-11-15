import { useState, type FormEvent, type ReactNode } from 'react';
import { pct,share } from '../data/format';
import type {Truck} from '../data/types';
import {bestDay,defaults,fmt,shipment,type Room,type Plan} from './model';

export function Facts({items}:{items:[string,ReactNode][]}){
  return <dl className="facts">{items.map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}
function Journey({harvest,arrival}:{harvest?:string;arrival?:string}){
  return <div className="journey">{[['Harvest',harvest],['Dispatch',harvest],['Arrive',arrival]].map(([label,date])=><div className="step" key={label}><span className="micro">{label}</span><strong>{fmt(date)}</strong></div>)}</div>;
}
export function Shipment({room,truck,plan,onPlan}:{room:Room;truck:Truck;plan?:Plan;onPlan:(p?:Plan)=>void}){
  const initial=plan?.order??defaults(room,truck);
  const [edited,setEdited]=useState(false);
  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget);
    onPlan(shipment(room,{deadline:String(f.get('deadline')),miles:Number(f.get('miles')),temp:Number(f.get('temp')),shop:Number(f.get('shop')),daysNeeded:Number(f.get('daysNeeded'))},truck));
    setEdited(false);
  }
  const best=plan?.best,late=plan?.rows.find(r=>r.reasons.length===1&&r.reasons[0]==='Arrives late');
  return <div className="split plans"><section className="panel"><div className="bar"><h2>Order &amp; transport</h2></div>
    <form className="pad stack" onSubmit={submit} onChange={()=>{onPlan();setEdited(true);}}>
      <label>Deliver by<input type="date" name="deadline" defaultValue={initial.deadline} required/></label>
      <label>Road distance (miles)<input type="number" name="miles" min="0" max="20000" step="any" defaultValue={initial.miles} required/></label>
      <div className="fields"><label>Truck (°C)<input type="number" name="temp" min="0" max="40" step="any" defaultValue={initial.temp} required/></label>
      <label>Display days needed<input type="number" name="daysNeeded" min="1" max="60" defaultValue={initial.daysNeeded} required/></label></div>
      <details><summary>Shop temperature</summary><label>Shop (°C)<input type="number" name="shop" min="11" max="40" step="any" defaultValue={initial.shop} required/></label></details>
      <p className="hint">Assumes one driver and dispatch on harvest day.</p><button className="button primary">Calculate harvest date →</button>
    </form></section><div className="stack"><section className="panel pad result" aria-live="polite">
      <div className="micro">Shipping recommendation</div><h2 className="compact">{plan?(best?'Harvest '+fmt(best.date):'No date meets this order'):edited?'Trip inputs changed':'When should I harvest?'}</h2>
      {(!plan||best)&&<Journey harvest={best?.date} arrival={best?.arrival}/>}
      {!plan?<p className="soft">Calculate with the buyer’s deadline and trip details to see the earliest harvest that fits.</p>:<>
      {best?<><p className="quiet">Earliest harvest that meets crop weight, arrival quality, display life, and the buyer’s deadline.</p>
        <Facts items={ [['Red fruit at arrival',pct(best.red)],['Estimated saleable pots',share(best.share)],['Days in best display condition',best.display],['Last feasible harvest',fmt(plan.last?.date)]] }/></>:
        <p className="quiet hspace">{plan.days>truck.max_transit_days?'This route exceeds the '+truck.max_transit_days+'-day transit limit.':late?'The earliest crop-ready shipment would arrive '+fmt(late.arrival)+', after the '+fmt(plan.order.deadline)+' deadline.':'The order checks below show which requirements rule out each harvest day.'}</p>}
      {plan.order.temp<10&&<p className="quiet hspace">Chilling risk below 10 °C. Check the truck setting before dispatch.</p>}
      <details className="hspace" key={String(!!best)} open={!best||undefined}><summary>Compare candidate harvest days</summary><div className="sheet"><table><thead><tr>{['Harvest','Arrival','Saleable','Order checks'].map(t=><th key={t}>{t}</th>)}</tr></thead>
        <tbody>{plan.rows.map(r=><tr key={r.date} className={r===best?'active-row':''}><td>{fmt(r.date)}</td><td>{fmt(r.arrival)}</td><td>{share(r.share)}</td><td>{r.reasons.join(' · ')||(r===best?'Earliest fit':'Fits')}</td></tr>)}</tbody></table></div></details>
      <p className="hspace"><a className="link" href={'#how/'+room.id}>See how this was calculated →</a></p></>}
    </section><section className="panel pad"><h3>Crop outlook · {room.name}</h3><Facts items={[
      ['Current red fruit by weight',pct(room.series[0].pct_red)],['Expected full-weight date',fmt(room.card.weight_complete_day)],
      ...(!room.custom?[['Ripeness scenario range',pct(room.card.pct_red_low)+' – '+pct(room.card.pct_red_high)] as [string,string]]:[])]}/>
    <p className="hint">Transport and display quality are scenario estimates.</p></section></div></div>;
}

export function How({room,truck,plan}:{room:Room;truck:Truck;plan?:Plan}){
  const p=plan??shipment(room,defaults(room,truck),truck),b=p.best??p.rows[0],harvest=bestDay(room,truck);
  const steps=[
    ['Forecast ripeness',room.custom?'The crop sample sets starting ripeness. The average warmth in the latest week of readings drives a 21-day scenario.':'Heat above 10 °C drives a fitted growth curve. Available camera signals and weighed samples adjust its starting point.',fmt(b.date)+' · '+pct(b.pct_red)+' red fruit by weight'],
    ['Choose the greenhouse harvest day',room.custom?(room.business?'Compare pot sales less additional growing costs for each full-weight date.':'Choose the first full-weight day with at least 95% saleable pots.'):'Compare net profit per square metre per growing day across the forecast.',harvest?'Recommended harvest · '+fmt(harvest.date):'No eligible date within the outlook'],
    ['Estimate the trip','Road distance determines transit days assuming one driver. Routes up to '+truck.same_day_km+' km use same-day delivery.',p.order.miles+' mi × 1.609344 = '+p.km.toFixed(1)+' km. '+(p.days?'Round up distance ÷ ('+truck.avg_speed_kmh+' km/h × '+truck.driving_hours_per_day+' h/day) = '+p.days+' days.':'Same-day route.')],
    ['Check arrival quality','Truck temperature and trip duration set additional warmth. The model estimates the share of pots meeting the sale threshold and their display life.',p.days+' days × max('+p.order.temp+' − '+truck.base_temp_c+', 0) = '+p.warmth.toFixed(1)+' degree-days · '+pct(b.red)+' red on arrival'],
    ['Choose the earliest shipment','Keep full-weight days that meet the saleable share, display-life, transit and delivery requirements.',fmt(b.date)+' harvest → '+fmt(b.arrival)+' arrival · '+(b.reasons.join(' · ')||'all checks passed')]
  ];
  return <div className="two"><section className="panel"><div className="bar"><h2>From crop to customer</h2></div><div className="pad flow">{steps.map(([name,desc,calc])=><article key={name}><div><h3>{name}</h3><p className="soft">{desc}</p><code className="formula">{calc}</code></div></article>)}</div></section>
    <aside className="stack"><section className="panel pad"><div className="micro">{plan?'Your calculation':'Worked example'}</div><h2>{room.name}</h2><Facts items={[
      ['Delivery deadline',fmt(p.order.deadline)],['Truck temperature',p.order.temp+' °C'],['Display days needed',p.order.daysNeeded],['Estimated display days',b.display??'Unknown']
    ]}/><a className="button wide" href={'#ship/'+room.id}>Adjust trip inputs →</a></section>
    <details className="panel pad"><summary>Ripening calculation &amp; assumptions</summary><code className="formula">log odds at arrival = ln(p / (1 − p)) + k × transit degree-days<br/>k = {Number(room.card.k_x1000)/1000}<br/>red share = 1 / (1 + exp(−log odds))</code><p className="hint hspace">Here p is the red share at harvest. A pot qualifies at one-third red fruit by weight. The trial measured greenhouse crops. Shipment outcomes are simulated.</p></details></aside></div>;
}
