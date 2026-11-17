"use client";
import { useState } from "react";

export function annualPricing(price: string) {
  const cents = Math.round(Number(price.replace(/\./g, "").replace(",", ".")) * 100);
  const monthly = Math.round(cents * 0.8);
  return { monthly, total: monthly * 12, savings: cents * 12 - monthly * 12 };
}
const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PlanPricing({price, trial = false}: {price:string; trial?:boolean}) {
  const [annual, setAnnual] = useState(false);
  const values = annualPricing(price);
  if (trial) return <div style={{padding:"12px 0",marginBottom:12}}><strong style={{fontSize:30,color:"white"}}>Grátis</strong><span style={{color:"#b9b4cd"}}> por 7 dias</span><p style={{fontSize:12,color:"#b9b4cd"}}>Sem cobrança anual e sem cartão de crédito.</p></div>;
  return <div style={{marginBottom:16}}>
    <div role="group" aria-label="Comparar valores mensal e anual" style={{display:"flex",gap:4,padding:4,border:"1px solid #49415f",borderRadius:10,marginBottom:16}}>
      {[false,true].map(value=><button key={String(value)} type="button" aria-pressed={annual===value} onClick={()=>setAnnual(value)} style={{flex:1,padding:"9px 6px",border:0,borderRadius:7,cursor:"pointer",fontWeight:700,color:annual===value?"#fff":"#b9b4cd",background:annual===value?"linear-gradient(110deg,#7c3aed,#2563eb)":"transparent"}}>{value?"Anual −20%":"Mensal"}</button>)}
    </div>
    <div><strong style={{fontSize:30,color:"white"}}>{annual ? money(values.monthly) : `R$ ${price}`}</strong><span style={{fontSize:13,color:"#b9b4cd"}}>/mês</span></div>
    {annual ? <>
      <p style={{fontSize:13,color:"#e5e0f2",margin:"10px 0 6px"}}>Pagamento único de <strong>{money(values.total)}</strong> por 12 meses.</p>
      <p style={{fontSize:12,color:"#86efac",margin:"6px 0"}}>Economia de {money(values.savings)} por ano.</p>
      <p style={{fontSize:12,color:"#b9b4cd",lineHeight:1.5}}>A franquia de respostas da IA renova mensalmente. O valor por mês é equivalente; a cobrança é anual.</p>
    </> : <p style={{fontSize:12,color:"#b9b4cd",margin:"10px 0"}}>Cobrança mensal. Compare com o pagamento anual acima.</p>}
  </div>;
}
