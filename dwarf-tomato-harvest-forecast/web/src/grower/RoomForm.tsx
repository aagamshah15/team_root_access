import { useRef, useState, type FormEvent } from 'react';
import type { Truck } from '../data/types';
import { pct } from '../data/format';
import example from './example-temperatures.csv?raw';
import exampleUrl from './example-temperatures.csv?url';
import { fmt, projectRoom, readTemps, type Reading, type Room } from './model';
import { Facts } from './Shipment';

const blank={name:'',red:'',total:'',weight:'',pots:'',price:'',cost:''};
type Fields=typeof blank;
export function RoomForm({ideas,rooms,truck,onSave}:{ideas:Room;rooms:Room[];truck:Truck;onSave:(room:Room)=>void}){
  const [values,setValues]=useState<Fields>(blank);
  const [readings,setReadings]=useState<Reading[]>([]);
  const [filename,setFilename]=useState('');
  const [demo,setDemo]=useState(false);
  const [candidate,setCandidate]=useState<Room|null>(null);
  const [error,setError]=useState('');
  const file=useRef<HTMLInputElement>(null),readId=useRef(0);
  const sample=ideas.samples??[];
  const weightSum=(key:'red'|'total')=>Number(sample.reduce((sum,p)=>sum+p[key],0).toFixed(2));
  function loadDemo(){
    readId.current++;if(file.current)file.current.value='';
    setReadings(readTemps(example));setFilename('example-temperatures.csv');setError('');setDemo(true);setCandidate(null);
    setValues({name:'East Glasshouse',red:String(weightSum('red')),total:String(weightSum('total')),weight:ideas.card.weight_complete_day??ideas.card.today,pots:'600',price:'2.4',cost:'24'});
  }
  async function readFile(selected?:File){
    const version=++readId.current;
    setReadings([]);setError('');setFilename('');setDemo(false);
    if(!selected)return;
    try{
      if(selected.size>2_000_000)throw Error('Use a daily summary under 2 MB.');
      const next=readTemps(await selected.text());
      if(readId.current!==version)return;
      setReadings(next);setFilename(selected.name);
      setValues(prev=>({...prev,weight:prev.weight||next.at(-1)!.date}));
    }catch(e){if(readId.current===version)setError((e as Error).message);}
  }
  function review(e:FormEvent){
    e.preventDefault();setError('');
    const today=readings.at(-1)?.date;
    if(!today){setError('Upload a valid temperature file or load the demo data.');return;}
    const red=Number(values.red),total=Number(values.total),name=values.name.trim();
    const id=demo?'demo-east-glasshouse':'local-'+crypto.randomUUID();
    if(!name||rooms.some(r=>r.id!==id&&r.name.toLowerCase()===name.toLowerCase())){setError('Enter a distinct compartment name.');return;}
    if(red>total){setError('Red fruit weight cannot exceed total fruit weight.');return;}
    setCandidate(projectRoom(readings,{id,name,custom:true,demo,demoEvidence:demo&&red===weightSum('red')&&total===weightSum('total'),
      card:{today,weight_complete_day:values.weight,k_x1000:18,pot_spread_sd:truck.pot_spread_sd},
      measurement:{red,total},business:{pots:Number(values.pots),price:Number(values.price),cost:Number(values.cost)}},truck));
    window.scrollTo(0,0);
  }
  function save(){
    if(!candidate)return;
    try{onSave(candidate);}catch(e){setError(e instanceof DOMException?'Browser storage is unavailable. Enable it to save this room.':(e as Error).message);}
  }
  function field(name:keyof Fields,label:string,type='number',min?:number,max?:number,step='any'){
    return <label>{label}<input name={name} type={type} value={values[name]} min={min} max={max} step={type==='number'?step:undefined} maxLength={type==='text'?50:undefined}
      onChange={e=>{setValues({...values,[name]:e.target.value});setError('');}} required/></label>;
  }
  return <><section className="demo-launch"><div><h3>Try the East Glasshouse demo</h3><p>Use seven days of IDEAS temperatures and a six-pot crop check. Prices, costs and room size are editable examples.</p></div>
    <button type="button" className="button" onClick={loadDemo}>{demo?'Reload demo data':'Load demo data'}</button></section>
    {candidate?<section className="panel"><div className="bar"><h2>Review your room</h2></div><div className="pad"><h2>{candidate.name}</h2>
      <Facts items={ [['Temperature file',readings.length+' days ending '+fmt(candidate.card.today,true)],['Red fruit in sample',values.red+' / '+values.total+' g · '+pct(candidate.series[0].pct_red)],
        ['Full-weight date',fmt(values.weight,true)],['Room economics',values.pots+' pots × €'+values.price+' · €'+values.cost+'/day']] }/>
      <p className="hint">Expected sales less waiting costs excludes costs incurred before the crop check. This room will be saved in this browser.</p>
      {error&&<p role="alert" className="error">{error}</p>}
      <div className="review-actions hspace"><button className="button primary" onClick={save}>Create room &amp; view outlook →</button><button className="button" onClick={()=>setCandidate(null)}>Edit inputs</button></div></div></section>:
      <div className="two"><form className="panel" onSubmit={review}><div className="bar"><h2>Room and crop check</h2></div><div className="pad stack">
      {field('name','Compartment name','text')}
      <div className="drop"><label htmlFor="csv">Daily temperature file</label><p className="hint">CSV · dates and mean air temperature in °C · up to 2 MB</p>
        <input type="file" accept=".csv,text/csv" id="csv" ref={file} onChange={e=>void readFile(e.target.files?.[0])}/><a className="link" href={exampleUrl} download="example-temperatures.csv">Download example CSV</a></div>
      <div role="status" className="hint">{readings.length?filename+' · '+readings.length+' daily readings · crop check '+fmt(readings.at(-1)?.date,true):'Choose a file to preview its readings.'}</div>
      <div><h3>Latest crop check</h3><p className="hint">Weigh red and total fruit from the same sample on the last date in your file.</p></div>
      <div className="fields">{field('red','Red fruit weight (g)','number',0,1e7)}{field('total','Total fruit weight (g)','number',0.01,1e7)}</div>
      {field('weight','Expected full-weight date','date')}<h3>Harvest economics</h3><div className="fields">{field('pots','Pots in the room','number',1,1e6,'1')}{field('price','Sale price per pot (€)','number',0.01,10000)}</div>
      {field('cost','Daily room cost (€)','number',0,1e6)}{error&&<p className="error" role="alert">{error}</p>}<button className="button primary">Review room →</button></div></form>
      <aside className="panel"><div className="bar"><h2>Upload preview</h2></div><div className="pad stack"><h3>{readings.length?'Temperature readings':'Example file format'}</h3>
      <table><thead><tr><th>Date</th><th>mean_temp_c</th></tr></thead><tbody>{(readings.length?readings.slice(-7):readTemps(example).slice(0,2)).map(r=><tr key={r.date}><td>{r.date}</td><td>{r.temp.toFixed(2)}</td></tr>)}</tbody></table>
      <p className="quiet">Your crop check sets starting ripeness. Recent temperatures drive a 21-day scenario with an illustrative growth rate.</p><p className="hint">Rooms are saved in this browser.</p></div></aside></div>}</>;
}
