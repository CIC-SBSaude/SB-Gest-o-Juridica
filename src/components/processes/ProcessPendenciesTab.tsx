import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, PlayCircle, Plus, XCircle } from 'lucide-react';
import { managementService } from '../../services/managementService';
import type { ProcessPendency } from '../../types/database';

export function ProcessPendenciesTab({ processId, canEdit }: { processId: string; canEdit: boolean }) {
  const [rows,setRows]=useState<ProcessPendency[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState<string|null>(null);
  const [description,setDescription]=useState(''); const [responsible,setResponsible]=useState('OPERADORA'); const [criticality,setCriticality]=useState('MEDIA'); const [dueAt,setDueAt]=useState('');
  const load=async()=>{setLoading(true);const r=await managementService.listPendencies(processId);setRows(r.data);setError(r.error);setLoading(false)};
  useEffect(()=>{load()},[processId]);
  const create=async()=>{ if(description.trim().length<3) return; const r=await managementService.createPendency({process_id:processId,description:description.trim(),responsible_type:responsible as any,criticality,status:'ABERTA',type:'OUTRA',source:'HUMANO',due_at:dueAt?new Date(dueAt).toISOString():null}); if(r.error){setError(r.error);return;} setDescription('');setDueAt('');load(); };
  const setStatus=async(id:string,status:'EM_TRATAMENTO'|'RESOLVIDA'|'CANCELADA')=>{const r=await managementService.setPendencyStatus(id,status);if(r.error){setError(r.error);return;}load();};
  if(loading) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin"/></div>;
  return <div className="space-y-4">
    {error&&<div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
    {canEdit&&<div className="p-4 border border-slate-200 rounded-xl bg-slate-50 grid grid-cols-1 md:grid-cols-4 gap-3">
      <input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Nova pendência" className="md:col-span-2 border rounded-lg px-3 py-2 text-xs"/>
      <select value={responsible} onChange={e=>setResponsible(e.target.value)} className="border rounded-lg px-3 py-2 text-xs"><option>OPERADORA</option><option>ESCRITORIO</option><option>JUDICIARIO</option><option>TERCEIRO</option></select>
      <select value={criticality} onChange={e=>setCriticality(e.target.value)} className="border rounded-lg px-3 py-2 text-xs"><option>BAIXA</option><option>MEDIA</option><option>ALTA</option><option>URGENTE</option></select>
      <input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} className="md:col-span-2 border rounded-lg px-3 py-2 text-xs"/>
      <button onClick={create} className="md:col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 text-white text-xs font-semibold px-3 py-2"><Plus className="w-4 h-4"/>Adicionar pendência</button>
    </div>}
    <div className="space-y-3">{rows.length===0?<div className="text-center text-xs text-slate-500 py-8">Nenhuma pendência registrada.</div>:rows.map(p=>{
      const overdue = p.due_at && new Date(p.due_at).getTime() < Date.now() && !['RESOLVIDA','CANCELADA'].includes(p.status);
      return <div key={p.id} className={`border rounded-xl p-4 flex items-start justify-between gap-4 ${overdue?'border-red-200 bg-red-50/40':'border-slate-200'}`}><div><div className="font-semibold text-sm text-slate-900">{p.description}</div><div className="text-xs text-slate-500 mt-1">{p.responsible_type} · {p.criticality} · {p.status}{p.due_at?` · prazo ${new Date(p.due_at).toLocaleString('pt-BR')}`:''}{overdue?' · VENCIDA':''}</div></div>{canEdit&&!['RESOLVIDA','CANCELADA'].includes(p.status)&&<div className="flex flex-wrap justify-end gap-2">{p.status==='ABERTA'&&<button onClick={()=>setStatus(p.id,'EM_TRATAMENTO')} className="text-xs px-3 py-2 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg inline-flex items-center gap-1"><PlayCircle className="w-4 h-4"/>Iniciar</button>}<button onClick={()=>setStatus(p.id,'RESOLVIDA')} className="text-xs px-3 py-2 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-lg inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/>Resolver</button><button onClick={()=>setStatus(p.id,'CANCELADA')} className="text-xs px-3 py-2 border border-slate-200 bg-white text-slate-600 rounded-lg inline-flex items-center gap-1"><XCircle className="w-4 h-4"/>Cancelar</button></div>}</div>})}</div>
  </div>;
}
