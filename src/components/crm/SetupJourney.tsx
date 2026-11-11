"use client";

import { useState } from "react";
import { ArrowRight, BookOpen, Bot, Check, ChevronDown, Clock, ClipboardCheck, LockKeyhole, QrCode, ShieldCheck, Sparkles, TestTube2 } from "lucide-react";
import type { FeatureStateItem } from "./ClientPlanModules";
import styles from "./SetupJourney.module.css";

export type SetupStepId = "whatsapp" | "business" | "instructions" | "hours" | "test" | "review";
export type SetupStep = {
  id: SetupStepId; title: string; description: string; featureId: string;
  confirmed: boolean; evidence: string; action: string;
};
const icons = { whatsapp: QrCode, business: BookOpen, instructions: Bot, hours: Clock, test: TestTube2, review: ClipboardCheck };

export default function SetupJourney({steps,featureStates,suspended,onOpen,onUpgrade,companyName,hasUnsavedChanges}: {
  steps: SetupStep[]; featureStates: Record<string,FeatureStateItem>; suspended: boolean;
  onOpen: (step: SetupStepId)=>void; onUpgrade:(plan:string,reason:string)=>void;
  companyName: string; hasUnsavedChanges: boolean;
}) {
  const [selected,setSelected] = useState<SetupStepId>("whatsapp");
  const [expanded,setExpanded] = useState(true);
  const completed = steps.filter(step=>step.confirmed && !suspended && featureStates[step.featureId]?.state === "allowed").length;
  const current = steps.find(step=>step.id===selected) ?? steps[0];
  const feature = featureStates[current.featureId];
  const allowed = !suspended && feature?.state === "allowed";
  const locked = !suspended && feature?.state === "locked_by_plan";
  const CurrentIcon = icons[current.id];
  return <section className={styles.journey} aria-labelledby="setup-journey-title" data-testid="setup-journey">
    <div className={styles.heading}>
      <div><p className={styles.eyebrow}><Sparkles size={13}/>SEU ATENDIMENTO, PASSO A PASSO</p><h2 id="setup-journey-title">Prepare a IA da sua empresa</h2><p className={styles.subtitle}>{companyName} · Conecte, organize as informações e teste antes de revisar a ativação.</p></div>
      <button className={styles.collapse} type="button" aria-expanded={expanded} aria-controls="setup-journey-content" onClick={()=>setExpanded(value=>!value)}>{completed} de {steps.length} etapas confirmadas<ChevronDown size={17} className={expanded?styles.rotated:undefined}/></button>
    </div>
    {expanded && <div id="setup-journey-content">
      <ol className={styles.steps} aria-label="Etapas de configuração">
        {steps.map((step,index)=>{
          const state = featureStates[step.featureId];
          const blocked = suspended || state?.state !== "allowed";
          return <li key={step.id}><button type="button" data-testid={`setup-step-${step.id}`} data-confirmed={step.confirmed&&!blocked} className={`${styles.step} ${selected===step.id?styles.selected:""}`} aria-current={selected===step.id?"step":undefined} onClick={()=>setSelected(step.id)}>
            <span className={`${styles.number} ${step.confirmed&&!blocked?styles.done:""}`}>{blocked?<LockKeyhole size={14}/>:step.confirmed?<Check size={15}/>:String(index+1).padStart(2,"0")}</span>
            <span className={styles.stepText}><strong>{step.title}</strong><small>{blocked ? state?.state === "locked_by_plan"?"Bloqueado pelo plano":"Indisponível" : step.confirmed ? "Confirmado" : "Revisar"}</small></span>
          </button></li>;
        })}
      </ol>
      <div className={styles.detail} data-testid="setup-step-detail">
        <div className={styles.detailIcon}><CurrentIcon size={24}/></div>
        <div className={styles.detailCopy}><h3>{current.title}</h3><p>{current.description}</p><span className={styles.evidence}>{!allowed ? feature?.reason || (locked?`Disponível no ${feature.minPlanName}.` : "Não foi possível confirmar a liberação deste recurso.") : current.evidence}</span></div>
        {allowed ? <button className={styles.action} type="button" onClick={()=>onOpen(current.id)}>{current.action}<ArrowRight size={16}/></button> : locked ? <button className={styles.action} type="button" onClick={()=>onUpgrade(feature.minPlanId,current.title)}>Solicitar {feature.minPlanName}<ArrowRight size={16}/></button> : <span className={styles.unavailable}><LockKeyhole size={15}/>{suspended?"Conta suspensa":"Recurso indisponível"}</span>}
      </div>
      <div className={styles.note}><ShieldCheck size={15}/><p>{hasUnsavedChanges ? "Há alterações ainda não salvas. As confirmações usam somente os dados gravados; salve e teste novamente antes de ativar." : "As confirmações usam dados salvos e respostas reais do sistema. O guia não ativa a IA nem envia mensagens pelo WhatsApp."}</p></div>
    </div>}
  </section>;
}
