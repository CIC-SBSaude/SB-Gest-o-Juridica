import React, { useState } from 'react';
import { ShieldAlert, RefreshCw, LogOut, Mail, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export const UnauthorizedPage: React.FC = () => {
  const { user, profile, signOut, claimInvite, refreshProfile, profileValidationError } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const userEmail = user?.email || profile?.email || 'e-mail corporativo';
  const validationFailed = Boolean(profileValidationError);

  const handleClaimOrRefresh = async () => {
    setIsChecking(true);
    setFeedbackMessage(null);
    try {
      if (validationFailed) {
        await refreshProfile();
        setFeedbackMessage('Validação do perfil executada novamente.');
        return;
      }

      const claimed = await claimInvite();
      await refreshProfile();
      if (claimed) {
        setFeedbackMessage('Convite verificado. Atualizando autorização...');
      } else {
        setFeedbackMessage('Nenhum convite pendente foi encontrado para esta conta ou seu acesso ainda não foi liberado.');
      }
    } catch {
      setFeedbackMessage('Erro ao verificar convite no momento.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Marca SB SAÚDE */}
        <div className="text-[#0F172A] font-extrabold text-3xl tracking-tight leading-none mb-1">
          SB <span className="text-[#E11D48]">SAÚDE</span>
        </div>
        <div className="text-xs text-[#64748B] font-bold tracking-widest uppercase mb-4">
          GESTÃO JURÍDICA
        </div>

        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#FEE2E2] text-[#991B1B] mb-3">
          <ShieldAlert className="h-6 w-6 text-[#E11D48]" />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-[#0F172A] sm:text-2xl">
          ACESSO NÃO AUTORIZADO
        </h1>
        <p className="mt-2 text-sm text-[#475569] max-w-sm mx-auto leading-relaxed">
          {validationFailed
            ? 'Sua conta foi autenticada, mas não foi possível confirmar seu perfil de acesso neste momento.'
            : 'Sua conta foi autenticada com sucesso, mas seu perfil de acesso não está ativo no sistema da SB Saúde.'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 border border-[#E2E8F0] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:px-8">
          {/* Dados da Conta Autenticada */}
          <div className="rounded-lg bg-[#F8FAFC] p-4 border border-[#E2E8F0] mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#1E293B] text-white flex items-center justify-center text-xs shrink-0">
                <Mail className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold uppercase text-[#94A3B8]">
                  Conta Autenticada:
                </span>
                <p className="text-xs font-bold text-[#0F172A] truncate">
                  {userEmail}
                </p>
                <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                  <span className={validationFailed ? 'inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-800' : 'badge-red'}>
                    {validationFailed ? 'Validação de perfil indisponível' : 'Inativo ou Sem Convite'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Feedback de tentativa de claim */}
          {feedbackMessage && (
            <div className="mb-6 rounded-lg bg-[#DBEAFE] p-3 border border-blue-200 text-xs text-[#1E40AF] flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>{feedbackMessage}</span>
            </div>
          )}

          {/* Instruções */}
          <div className="space-y-3 text-xs text-[#475569] mb-6 leading-relaxed">
            {validationFailed ? (
              <>
                <p>
                  A autenticação do Google/Supabase foi concluída, porém a aplicação não conseguiu confirmar seu registro em <code className="font-mono text-[#0F172A]">user_profiles</code>.
                </p>
                <p className="text-[11px] text-[#64748B] bg-[#F8FAFC] p-2.5 rounded border border-[#E2E8F0]">
                  Isso pode ser uma falha temporária de rede, sessão ou consulta. Seu usuário não será tratado como inativo apenas por essa falha.
                </p>
                {profileValidationError && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-200 break-words">
                    {profileValidationError}
                  </p>
                )}
              </>
            ) : (
              <>
                <p>
                  Para acessar o <strong>SB Gestão Jurídica</strong>, é necessário que o administrador do sistema aprove sua solicitação ou envie um convite de acesso para o seu e-mail corporativo.
                </p>
                <p className="text-[11px] text-[#64748B] bg-[#F8FAFC] p-2.5 rounded border border-[#E2E8F0]">
                  Se você acabou de receber um convite ou é o primeiro administrador cadastrado, clique no botão abaixo para resgatar o convite através da função <code className="font-mono text-[#0F172A]">claim_my_invite()</code>.
                </p>
              </>
            )}
          </div>

          {/* Ações */}
          <div className="space-y-3">
            <button
              id="unauthorized-claim-invite-btn"
              type="button"
              onClick={handleClaimOrRefresh}
              disabled={isChecking}
              className="action-btn w-full"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Verificando acesso...' : validationFailed ? 'Tentar Validar Novamente' : 'Resgatar Convite / Atualizar Status'}</span>
            </button>

            <button
              id="unauthorized-logout-btn"
              type="button"
              onClick={signOut}
              className="action-btn-secondary w-full"
            >
              <LogOut className="w-3.5 h-3.5 text-[#64748B]" />
              <span>Sair / Utilizar Outra Conta</span>
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#94A3B8]">
          Suporte SB Saúde Jurídico &bull; Entre em contato com a equipe de TI Corporativa
        </p>
      </div>
    </div>
  );
};
