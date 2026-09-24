import React, { useEffect, useMemo, useState } from 'react';
import { Users, UserPlus, RefreshCw, CheckCircle2, XCircle, Mail, AlertCircle, Clock, Check, Shield, History, Ban } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { RoleBadge } from '../../components/common/RoleBadge';
import { ActionDialog } from '../../components/common/ActionDialog';
import { RecordActionModal } from '../../components/common/RecordActionModal';
import { UserRole } from '../../types/database';
import { userAdminService } from '../../services/userAdminService';

interface UserProfileRecord {
  id: string; email: string | null; display_name: string | null; role: UserRole; active: boolean;
  last_login_at: string | null; created_at: string; updated_at: string;
}
interface AccessInviteRecord {
  id: string; email: string; role: UserRole; active: boolean; created_by: string | null;
  claimed_by: string | null; claimed_at: string | null; created_at: string;
  expires_at?: string | null; revoked_at?: string | null; revoked_by?: string | null;
}
interface AuditRecord {
  id: string; action: string; actor_user_id: string | null; target_user_id: string | null; target_email: string;
  old_role: UserRole | null; new_role: UserRole | null; old_active: boolean | null; new_active: boolean | null;
  reason: string | null; created_at: string;
}

type PendingAction =
  | { kind: 'ACTIVE'; user: UserProfileRecord; next: boolean }
  | { kind: 'ROLE'; user: UserProfileRecord; nextRole: UserRole }
  | { kind: 'REVOKE'; invite: AccessInviteRecord }
  | null;

const fmt = (value?: string | null) => value ? new Date(value).toLocaleString('pt-BR') : '-';
const inviteStatus = (inv: AccessInviteRecord) => {
  if (inv.claimed_at) return 'RESGATADO';
  if (inv.revoked_at) return 'REVOGADO';
  if (!inv.active) return 'INATIVO';
  if (inv.expires_at && new Date(inv.expires_at).getTime() <= Date.now()) return 'EXPIRADO';
  return 'PENDENTE';
};

export const UsersPage: React.FC = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'ADMIN';
  const [users, setUsers] = useState<UserProfileRecord[]>([]);
  const [invites, setInvites] = useState<AccessInviteRecord[]>([]);
  const [audit, setAudit] = useState<AuditRecord[]>([]);
  const [activeAdmins, setActiveAdmins] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('ANALISTA');
  const [inviteReason, setInviteReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfileRecord | null>(null);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const load = async () => {
    if (!isAdmin) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const data = await userAdminService.list();
      setUsers(data.users || []); setInvites(data.invites || []); setAudit(data.audit || []); setActiveAdmins(data.activeAdmins || 0);
    } catch (e: any) { setError(e.message || 'Falha ao carregar usuários.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [isAdmin]);

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await userAdminService.createInvite(inviteEmail, inviteRole, inviteReason);
      setSuccess(`E-mail ${inviteEmail.trim().toLowerCase()} autorizado com perfil ${inviteRole}.`);
      setInviteEmail(''); setInviteReason(''); setShowInvite(false); await load();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  const confirmAction = async (reason?: string) => {
    if (!pendingAction) return;
    setBusy(true); setError(null);
    try {
      if (pendingAction.kind === 'ACTIVE') {
        await userAdminService.setActive(pendingAction.user.id, pendingAction.next, reason);
        setSuccess(`Usuário ${pendingAction.next ? 'reativado' : 'inativado'} com sucesso.`);
      } else if (pendingAction.kind === 'ROLE') {
        await userAdminService.setRole(pendingAction.user.id, pendingAction.nextRole, reason);
        setSuccess(`Perfil alterado para ${pendingAction.nextRole}.`);
      } else {
        await userAdminService.revokeInvite(pendingAction.invite.id, reason);
        setSuccess('Autorização de e-mail revogada.');
      }
      setPendingAction(null); await load();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  if (!isAdmin) return (
    <div className="stat-card flex items-start gap-3"><Shield className="w-5 h-5 text-amber-600"/><div><h2 className="font-bold text-slate-900">Acesso administrativo</h2><p className="text-sm text-slate-600 mt-1">Somente ADMIN pode gerenciar usuários, perfis e autorizações de e-mail.</p></div></div>
  );

  const dialogTitle = pendingAction?.kind === 'ROLE'
    ? 'Alterar perfil'
    : pendingAction?.kind === 'REVOKE'
      ? 'Revogar autorização'
      : pendingAction?.kind === 'ACTIVE' && pendingAction.next
        ? 'Reativar usuário'
        : 'Inativar usuário';
  const dialogDanger = pendingAction?.kind === 'REVOKE'
    || (pendingAction?.kind === 'ACTIVE' && pendingAction.next === false);
  const dialogMessage = pendingAction?.kind === 'ROLE'
    ? `Alterar ${pendingAction.user.display_name || pendingAction.user.email} de ${pendingAction.user.role} para ${pendingAction.nextRole}. A alteração será auditada.`
    : pendingAction?.kind === 'REVOKE'
      ? `Revogar a autorização pendente de ${pendingAction.invite.email}. A ação será auditada.`
      : pendingAction?.kind === 'ACTIVE'
        ? `${pendingAction.next ? 'Reativar' : 'Inativar'} ${pendingAction.user.display_name || pendingAction.user.email}. A alteração terá efeito nas próximas requisições do usuário.`
        : '';

  return <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
      <div><span className="text-xs font-bold uppercase tracking-wider text-red-600">Administração</span><h2 className="text-2xl font-bold text-slate-900">Usuários e Permissões</h2><p className="text-sm text-slate-500">Autorização de e-mail, perfis, inativação e auditoria. Alterações sensíveis passam pelo backend administrativo.</p></div>
      <div className="flex gap-2"><button onClick={() => void load()} disabled={loading} className="px-3 py-2 border rounded-lg text-xs font-semibold flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/>Atualizar</button><button onClick={() => setShowInvite(true)} className="action-btn"><UserPlus className="w-4 h-4"/>Autorizar e-mail</button></div>
    </div>

    {error && <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 flex gap-3 text-sm"><AlertCircle className="w-5 h-5 shrink-0"/><span>{error}</span></div>}
    {success && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 flex gap-3 text-sm"><CheckCircle2 className="w-5 h-5 shrink-0"/><span>{success}</span></div>}

    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="stat-card"><div className="text-xs text-slate-500">Usuários</div><div className="text-2xl font-bold mt-1">{users.length}</div></div>
      <div className="stat-card"><div className="text-xs text-slate-500">Ativos</div><div className="text-2xl font-bold mt-1">{users.filter(u=>u.active).length}</div></div>
      <div className="stat-card"><div className="text-xs text-slate-500">ADMIN ativos</div><div className="text-2xl font-bold mt-1">{activeAdmins}</div><div className="text-3xs text-slate-400 mt-1">Nunca pode chegar a zero</div></div>
      <div className="stat-card"><div className="text-xs text-slate-500">Autorizações pendentes</div><div className="text-2xl font-bold mt-1">{invites.filter(i=>inviteStatus(i)==='PENDENTE').length}</div></div>
    </div>

    <div className="stat-card p-0 overflow-hidden">
      <div className="p-4 border-b flex items-center gap-2"><Users className="w-4 h-4"/><h3 className="text-xs font-bold uppercase tracking-wider">Usuários cadastrados</h3></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500 uppercase"><tr><th className="p-3">Usuário</th><th className="p-3">E-mail</th><th className="p-3">Perfil</th><th className="p-3">Status</th><th className="p-3">Último acesso</th></tr></thead><tbody className="divide-y">
        {users.map(u => { const self=u.id===profile?.id; return <tr key={u.id} tabIndex={0} role="button" onClick={()=>setSelectedUser(u)} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedUser(u);}}} className="cursor-pointer hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"><td className="p-3 font-semibold">{u.display_name||'Sem nome'} {self&&<span className="ml-1 text-blue-600">(você)</span>}</td><td className="p-3 font-mono">{u.email}</td><td className="p-3"><RoleBadge role={u.role} size="sm"/></td><td className="p-3">{u.active?<span className="text-emerald-700 inline-flex gap-1"><CheckCircle2 className="w-3.5 h-3.5"/>Ativo</span>:<span className="text-slate-500 inline-flex gap-1"><XCircle className="w-3.5 h-3.5"/>Inativo</span>}</td><td className="p-3 text-slate-500">{fmt(u.last_login_at)}</td></tr>; })}
      </tbody></table></div>
    </div>

    <div className="stat-card p-0 overflow-hidden"><div className="p-4 border-b flex items-center gap-2"><Mail className="w-4 h-4"/><h3 className="text-xs font-bold uppercase tracking-wider">Autorizações de e-mail</h3></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-50 text-slate-500 uppercase"><tr><th className="p-3 text-left">E-mail</th><th className="p-3 text-left">Perfil</th><th className="p-3">Status</th><th className="p-3">Validade</th><th className="p-3">Resgatado</th><th className="p-3 text-right">Ação</th></tr></thead><tbody className="divide-y">{invites.map(inv=>{const st=inviteStatus(inv);return <tr key={inv.id}><td className="p-3 text-left font-mono font-semibold">{inv.email}</td><td className="p-3 text-left"><RoleBadge role={inv.role} size="sm"/></td><td className="p-3 text-center">{st==='PENDENTE'?<span className="text-amber-700 inline-flex gap-1"><Clock className="w-3 h-3"/>Pendente</span>:st==='RESGATADO'?<span className="text-blue-700 inline-flex gap-1"><Check className="w-3 h-3"/>Resgatado</span>:<span className="text-slate-500">{st}</span>}</td><td className="p-3 text-center">{fmt(inv.expires_at)}</td><td className="p-3 text-center">{fmt(inv.claimed_at)}</td><td className="p-3 text-right">{st==='PENDENTE'&&<button onClick={()=>setPendingAction({kind:'REVOKE',invite:inv})} className="px-2 py-1 border border-red-200 bg-red-50 text-red-700 rounded font-semibold inline-flex items-center gap-1"><Ban className="w-3 h-3"/>Revogar</button>}</td></tr>})}</tbody></table></div></div>

    <div className="stat-card p-0 overflow-hidden"><div className="p-4 border-b flex items-center gap-2"><History className="w-4 h-4"/><h3 className="text-xs font-bold uppercase tracking-wider">Auditoria de acesso</h3></div><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-50 text-slate-500 uppercase"><tr><th className="p-3 text-left">Data</th><th className="p-3 text-left">Ação</th><th className="p-3 text-left">Alvo</th><th className="p-3 text-left">Alteração</th><th className="p-3 text-left">Executado por</th><th className="p-3 text-left">Motivo</th></tr></thead><tbody className="divide-y">{audit.map(a=>{const actor=a.actor_user_id?usersById.get(a.actor_user_id):null;return <tr key={a.id}><td className="p-3">{fmt(a.created_at)}</td><td className="p-3 font-mono">{a.action}</td><td className="p-3">{a.target_email}</td><td className="p-3">{a.old_role!==a.new_role?`${a.old_role||'-'} → ${a.new_role||'-'}`:a.old_active!==a.new_active?`${a.old_active?'Ativo':'Inativo'} → ${a.new_active?'Ativo':'Inativo'}`:'-'}</td><td className="p-3">{actor?.display_name||actor?.email||'Sistema/Usuário'}</td><td className="p-3 text-slate-500">{a.reason||'-'}</td></tr>})}</tbody></table></div></div>


    <RecordActionModal
      isOpen={Boolean(selectedUser)}
      title={selectedUser?.display_name || selectedUser?.email || 'Usuário'}
      subtitle={selectedUser?.email || undefined}
      onClose={() => setSelectedUser(null)}
      actions={selectedUser ? (() => {
        const self = selectedUser.id === profile?.id;
        return <>
          <select
            disabled={self || busy}
            value={selectedUser.role}
            onChange={(e) => {
              const nextRole = e.target.value as UserRole;
              if (nextRole !== selectedUser.role) setPendingAction({ kind: 'ROLE', user: selectedUser, nextRole });
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
            aria-label="Alterar perfil"
          >
            <option>ADMIN</option><option>GESTOR</option><option>ANALISTA</option><option>CONSULTA</option>
          </select>
          <button
            type="button"
            disabled={self || busy}
            onClick={() => setPendingAction({ kind: 'ACTIVE', user: selectedUser, next: !selectedUser.active })}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selectedUser.active ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'} disabled:opacity-40`}
          >
            {selectedUser.active ? 'Inativar' : 'Reativar'}
          </button>
        </>;
      })() : null}
    >
      {selectedUser && <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div><div className="text-[11px] font-semibold uppercase text-slate-400">Perfil</div><div className="mt-1"><RoleBadge role={selectedUser.role} size="sm"/></div></div>
        <div><div className="text-[11px] font-semibold uppercase text-slate-400">Status</div><div className="mt-1 font-semibold">{selectedUser.active ? 'Ativo' : 'Inativo'}</div></div>
        <div><div className="text-[11px] font-semibold uppercase text-slate-400">Último acesso</div><div className="mt-1">{fmt(selectedUser.last_login_at)}</div></div>
        <div><div className="text-[11px] font-semibold uppercase text-slate-400">Criado em</div><div className="mt-1">{fmt(selectedUser.created_at)}</div></div>
      </div>}
    </RecordActionModal>

    {showInvite && <div className="fixed inset-0 z-50 bg-slate-950/45 flex items-center justify-center p-4"><form onSubmit={createInvite} className="bg-white rounded-2xl border shadow-2xl w-full max-w-md p-5 space-y-4"><h3 className="font-bold text-slate-900">Autorizar e-mail</h3><p className="text-xs text-slate-500">A autorização vale por 7 dias. Nenhum e-mail é enviado pelo sistema nesta etapa.</p><input type="email" required value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="usuario@empresa.com.br" className="w-full border rounded-lg px-3 py-2 text-sm"/><select value={inviteRole} onChange={e=>setInviteRole(e.target.value as UserRole)} className="w-full border rounded-lg px-3 py-2 text-sm bg-white"><option value="CONSULTA">CONSULTA</option><option value="ANALISTA">ANALISTA</option><option value="GESTOR">GESTOR</option><option value="ADMIN">ADMIN</option></select><textarea value={inviteReason} onChange={e=>setInviteReason(e.target.value)} placeholder="Motivo/observação (opcional)" className="w-full border rounded-lg px-3 py-2 text-sm" rows={2}/><div className="flex justify-end gap-2"><button type="button" onClick={()=>setShowInvite(false)} className="px-3 py-2 border rounded-lg text-xs font-semibold">Cancelar</button><button disabled={busy} className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold">Autorizar</button></div></form></div>}

    <ActionDialog isOpen={Boolean(pendingAction)} title={dialogTitle} message={dialogMessage} inputLabel="Motivo / justificativa" inputPlaceholder="Ex.: mudança de função, desligamento, correção de acesso..." busy={busy} variant={dialogDanger ? 'danger' : 'warning'} onClose={()=>!busy&&setPendingAction(null)} onConfirm={confirmAction}/>
  </div>;
};
