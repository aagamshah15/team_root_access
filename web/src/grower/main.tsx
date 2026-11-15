import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fmt, loadTrial, savedRooms, saveRoom, type Plan, type Room } from './model';
import { Harvest } from './Harvest';
import { Shipment, How } from './Shipment';
import { RoomForm } from './RoomForm';
import './style.css';

const screens={home:'Harvest',ship:'Shipment',new:'Add a room',how:'How it works'} as const;
type Page=keyof typeof screens;
const headings={home:'Harvest outlook',ship:'Shipment planner',new:'Add a room',how:'How it works'};
function route(){
  const [section,id]=location.hash.slice(1).split('/');
  const page:Page=section==='room'?'ship':Object.hasOwn(screens,section)?section as Page:'home';
  return {page,id};
}
function Workspace({trial}:{trial:Awaited<ReturnType<typeof loadTrial>>}){
  const [locationState,setLocationState]=useState(route);
  const [custom,setCustom]=useState(savedRooms);
  const [plans,setPlans]=useState<Record<string,Plan|undefined>>({});
  useEffect(()=>{
    const navigate=()=>{setLocationState(route());window.scrollTo(0,0);document.getElementById('main')?.focus({preventScroll:true});};
    const sync=(e:StorageEvent)=>{if(!e.key||e.key==='harvest-window-wireframe-rooms-v1'){setCustom(savedRooms());setPlans({});}};
    window.addEventListener('hashchange',navigate);window.addEventListener('storage',sync);
    return ()=>{window.removeEventListener('hashchange',navigate);window.removeEventListener('storage',sync);};
  },[]);
  const rooms=[...trial.rooms,...custom],{page,id}=locationState;
  const room=rooms.find(r=>r.id===id)??trial.rooms[0],ideas=trial.rooms.find(r=>r.id==='ideas')!;
  const href=(page:Page,id=room.id)=>'#'+page+'/'+id;
  function save(r:Room){setCustom(saveRoom(r));setPlans(prev=>({...prev,[r.id]:undefined}));location.hash=href('home',r.id);}
  useEffect(()=>{document.title=headings[page]+' · Harvest Window';},[page]);
  const source=room.custom?(room.demo?'Demo room':'Uploaded room'):'2024 trial replay';
  return <><a className="skip" href="#main" onClick={e=>{e.preventDefault();document.getElementById('main')?.focus();}}>Skip to content</a>
    <header><div className="top"><a className="brand" href={href('home')}><span className="mark" aria-hidden="true"/>Harvest Window</a>
    <nav aria-label="Workspace">{(Object.keys(screens) as Page[]).map(p=><a key={p} href={href(p)} aria-current={page===p?'page':undefined}>{screens[p]}</a>)}</nav></div></header>
    <main id="main" tabIndex={-1}><section className="hero"><div><div className="eyebrow">{{home:'Grower workspace',ship:'Order & transport',new:'Compartment setup',how:'Decision guide'}[page]}</div>
      <h1>{headings[page]}</h1><p className="sub">{page==='new'?'Start with your temperature file and a weighed crop sample.':page==='how'?'Follow one candidate harvest day from a crop check to delivery.':source+' · Forecast as of '+fmt(room.card.today,true)}</p></div>
      {page!=='new'&&<label className="room-picker">Compartment<select value={room.id} onChange={e=>{location.hash=href(page,e.target.value);}}>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}</section>
      {page==='home'&&<Harvest key={room.id} room={room} ideas={ideas} truck={trial.truck}/>}
      {page==='ship'&&<Shipment key={room.id} room={room} truck={trial.truck} plan={plans[room.id]} onPlan={p=>setPlans(prev=>({...prev,[room.id]:p}))}/>}
      {page==='how'&&<How room={room} truck={trial.truck} plan={plans[room.id]}/>}
      {page==='new'&&<RoomForm ideas={ideas} rooms={rooms} truck={trial.truck} onSave={save}/>}
    </main><footer><span>Harvest Window</span><span>Grower workspace</span></footer></>;
}
function App(){
  const [trial,setTrial]=useState<Awaited<ReturnType<typeof loadTrial>>>();
  const [error,setError]=useState('');
  useEffect(()=>{let active=true;loadTrial().then(v=>{if(active)setTrial(v);}).catch(e=>{if(active)setError(e.message);});return ()=>{active=false;};},[]);
  if(!trial)return <main className="pad" role="status">{error?'Could not open the grower workspace. '+error:'Loading greenhouse forecasts…'}</main>;
  return <Workspace trial={trial}/>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
