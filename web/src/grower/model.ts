import { addDays } from '../data/format';
import type { DayCard, EvidenceRow, Truck } from '../data/types';
import { loadData } from '../data/load';
import { ripen, sellableShare, shelf, transitDays } from '../lib/trip';
import { isoDate, parseCsv, toNumber } from '../lib/validate';

export interface Point { date: string; pct_red: number; sellable_share?: number; profit_m2_day?: number; margin?: number }
export interface Pot { id: string; red: number; total: number }
export interface Room {
  id: string; name: string; custom?: boolean; demo?: boolean; demoEvidence?: boolean;
  card: GrowerCard;
  series: Point[]; samples?: Pot[]; photos?: EvidenceRow[];
  measurement?: {red:number;total:number}; business?: {pots:number;price:number;cost:number};
}
type GrowerCard = Pick<DayCard,'today'|'weight_complete_day'|'k_x1000'|'pot_spread_sd'> &
  Partial<Pick<DayCard,'best_day'|'optimal_from'|'optimal_to'|'pct_red_low'|'pct_red_high'>>;
export type Reading = {date:string;temp:number};
const roomNames:Record<string,string>={mugrow:'MuGrow',trigger:'Trigger',ideas:'IDEAS',agrifusion:'Agrifusion',reference:'Reference',tomatonuts:'Tomatonuts'};
export async function loadTrial() {
  const today='2024-11-05';
  const [data, response]=await Promise.all([loadData(),fetch('data/plants.csv')]);
  if(!response.ok)throw Error('Could not load the recorded pot samples.');
  if(!data.shipping.meta.truck)throw Error('Shipping settings are missing.');
  const csv=parseCsv(await response.text());
  const pots=csv.rows.map(row=>Object.fromEntries(csv.header.map((key,i)=>[key,row[i]])));
  const rooms:Room[]=Object.entries(roomNames).map(([id,name])=>{
    const card=data.days.rows.find(r=>r.room===id&&r.today===today);
    const series=data.forecast.rows.filter(r=>r.room===id&&r.today===today).sort((a,b)=>a.date.localeCompare(b.date));
    if(!card||!series.length)throw Error('Missing '+name+' forecast.');
    const images=data.evidence.rows.filter(r=>r.room===id&&r.date<=today&&r.photo).sort((a,b)=>b.date.localeCompare(a.date));
    const photos=[images[0],images.find(r=>r.date<=addDays(today,-7))].filter((r,i,a): r is EvidenceRow => !!r&&a.indexOf(r)===i);
    const samples=pots.filter(p=>p.team===id&&p.date===today).map(p=>({id:p.plant,red:Number(p.fw_red),total:Number(p.fw_total)}));
    return {id,name,card,series,photos,samples};
  });
  return {rooms,truck:data.shipping.meta.truck};
}
const key='harvest-window-wireframe-rooms-v1';
export function savedRooms(): Room[]{
  try {const saved=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(saved)?saved.filter(r=>r?.custom&&r.id&&r.name&&r.card?.today&&Array.isArray(r.series)&&r.series.length):[];}
  catch {return [];}
}
export function saveRoom(room:Room){
  const rooms=savedRooms().filter(r=>r.id!==room.id);
  if(rooms.some(r=>r.name.toLowerCase()===room.name.toLowerCase()))throw Error('A room with this name already exists.');
  const next=[...rooms,room];
  localStorage.setItem(key,JSON.stringify(next));
  return next;
}
export function bestDay(room:Room,truck:Truck) {
  if(!room.custom)return room.series.find(r=>r.date===room.card.best_day);
  const eligible=room.series.filter(r=>room.card.weight_complete_day&&r.date>=room.card.weight_complete_day);
  if(!room.business)return eligible.find(r=>saleable(room,r,truck)>=truck.earliest_sellable_share);
  let best: Point | undefined;
  for (const row of eligible) {
    if (row.margin !== undefined && (!best || row.margin > Number(best.margin))) best = row;
  }
  return best;
}
export function saleable(room:Room,row:Point,truck:Truck){
  return row.sellable_share??sellableShare(row.pct_red,truck,room.card.pot_spread_sd??truck.pot_spread_sd);
}
export function readTemps(text:string):Reading[] {
  const {header,rows,delimiter}=parseCsv(text);
  const d=header.indexOf('date'),t=header.indexOf('mean_temp_c');
  if(d<0||t<0)throw Error('Include the columns date and mean_temp_c.');
  if(!rows.length)throw Error('Include at least one daily temperature.');
  const seen=new Set<string>();
  return rows.map((row,i)=>{
    const date=row[d]?.trim(),temp=toNumber(row[t],delimiter);
    if(!date||isoDate(date)!==date)throw Error('Row '+(i+2)+' needs a YYYY-MM-DD date.');
    if(temp===null||temp<0||temp>50)throw Error('Row '+(i+2)+' needs a temperature between 0 and 50 °C.');
    if(seen.has(date))throw Error('Duplicate date '+date+'. Use one mean per day.');
    seen.add(date);return {date,temp};
  }).sort((a,b)=>a.date.localeCompare(b.date));
}
export function projectRoom(readings:Reading[], room:Omit<Room,'series'>, truck:Truck):Room {
  const recent=readings.filter(r=>r.date>=addDays(room.card.today,-6));
  const warmth=recent.reduce((sum,r)=>sum+Math.max(0,r.temp-truck.base_temp_c),0)/recent.length;
  const {red,total}=room.measurement!,{price,pots,cost}=room.business!;
  const start=100*red/total;
  const series=Array.from({length:22},(_,i)=>{
    const pct_red=i?ripen(start,Number(room.card.k_x1000)/1000,warmth*i):start;
    const sellable_share=sellableShare(pct_red,truck);
    return {date:addDays(room.card.today,i),pct_red,sellable_share,margin:sellable_share*pots*price-i*cost};
  });
  return {...room,series};
}
export interface Order {deadline:string;miles:number;temp:number;shop:number;daysNeeded:number}
export const defaults=(r:Room,truck:Truck):Order=>({deadline:addDays(r.card.today,10),miles:350,temp:truck.temp_c,shop:truck.shop_temp_c,daysNeeded:truck.min_best_shelf_days});
export function shipment(room:Room,order:Order,truck:Truck) {
  const km=order.miles*1.609344,days=transitDays(km,truck),k=Number(room.card.k_x1000)/1000;
  const warmth=days*Math.max(0,order.temp-truck.base_temp_c);
  const rows=room.series.map(row=>{
    const arrival=addDays(row.date,days),red=ripen(row.pct_red,k,warmth);
    const share=sellableShare(red,truck,room.card.pot_spread_sd??truck.pot_spread_sd);
    const display=shelf(red,k,Math.max(0,order.shop-truck.base_temp_c),truck).best_days;
    const reasons:string[]=[];
    if(days>truck.max_transit_days)reasons.push('Trip too long');
    if(!room.card.weight_complete_day||row.date<room.card.weight_complete_day)reasons.push('Still gaining weight');
    if(share<truck.earliest_sellable_share)reasons.push('Too few saleable pots');
    if(display===null||display<order.daysNeeded)reasons.push('Short display life');
    if(arrival>order.deadline)reasons.push('Arrives late');
    return {...row,arrival,red,share,display,reasons};
  });
  const fits=rows.filter(row=>!row.reasons.length);
  return {order,days,km,warmth,rows,best:fits[0],last:fits.at(-1)};
}
export type Plan=ReturnType<typeof shipment>;
export const fmt=(s?:string|null,year=false)=>s?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',...(year?{year:'numeric'}:{}),timeZone:'UTC'}).format(new Date(s+'T00:00:00Z')):'—';
