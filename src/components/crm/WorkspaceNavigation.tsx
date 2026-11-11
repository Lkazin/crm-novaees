"use client";

import { useId, useRef, useState } from "react";
import { ArrowRight, Search, X, type LucideIcon } from "lucide-react";
import styles from "./WorkspaceNavigation.module.css";

export type WorkspaceNavItem<T extends string> = {
  id:T; label:string; group:string; icon:LucideIcon; keywords?:string;
  badge?:{text:string;tone?:"success"|"attention"|"neutral"};
};
function searchable(value:string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").trim(); }

export default function WorkspaceNavigation<T extends string>({items,active,onSelect,embedded=false}: {
  items:WorkspaceNavItem<T>[];active:T;onSelect:(id:T)=>void;embedded?:boolean;
}) {
  const [query,setQuery]=useState("");
  const searchRef=useRef<HTMLInputElement>(null);
  const searchId=useId();
  const resultId=useId();
  const visible=items.filter(item=>searchable(`${item.label} ${item.keywords??""}`).includes(searchable(query)));
  const groups=[...new Set(items.map(item=>item.group))];
  const choose=(id:T)=>{onSelect(id);setQuery("");};
  return <nav className={`${styles.navigation} ${embedded?styles.embedded:""}`} aria-label={embedded?"Seções do CRM NovaesWeb":"Seções do painel do cliente"}>
    <div className={styles.search}>
      <Search size={16} aria-hidden="true"/>
      <label htmlFor={searchId} className={styles.srOnly}>Buscar seção do painel</label>
      <input ref={searchRef} id={searchId} type="search" placeholder="Encontrar uma seção" autoComplete="off" maxLength={80} value={query} aria-describedby={query?resultId:undefined} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();setQuery("");}if(event.key==="Enter"&&visible.length===1){event.preventDefault();choose(visible[0].id);}}}/>
      {query&&<button type="button" aria-label="Limpar busca de seções" onClick={()=>{setQuery("");searchRef.current?.focus();}}><X size={15}/></button>}
    </div>
    {query&&<p id={resultId} className={styles.searchStatus} role="status">{visible.length?`${visible.length} seção(ões) encontrada(s)`:"Nenhuma seção encontrada. Tente outro nome."}</p>}
    <div className={styles.groups}>
      {groups.map(group=>{
        const groupItems=visible.filter(item=>item.group===group);
        if(!groupItems.length)return null;
        return <div key={group} className={styles.group}>
          {!embedded&&<p className={styles.groupLabel}>{group}</p>}
          <div className={styles.items}>{groupItems.map(item=>{
            const Icon=item.icon;
            return <button key={item.id} type="button" className={`${styles.item} ${active===item.id?styles.active:""}`} aria-label={item.label} aria-current={active===item.id?"page":undefined} onClick={()=>choose(item.id)}>
              <span className={styles.icon}><Icon size={17} aria-hidden="true"/></span><span className={styles.label}>{item.label}</span>
              {item.badge&&<span className={`${styles.badge} ${item.badge.tone==="success"?styles.success:item.badge.tone==="attention"?styles.attention:""}`}>{item.badge.text}</span>}
              {active===item.id&&<ArrowRight size={14} className={styles.activeArrow} aria-hidden="true"/>}
            </button>;
          })}</div>
        </div>;
      })}
    </div>
  </nav>;
}
