import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase, supabaseAdmin } from '../services/supabase';
import { ArrowLeft, User, Briefcase, FileText, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const CustomerDetails = () => {
  const { cpf } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'ADMIN';

  const [customer, setCustomer] = useState<any>(null);
  const [contracts, setContracts] = useState<any[]>([]);
  const [selectedContract, setSelectedContract] = useState<any | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  
  // Para ADMINs repassarem carteira
  const [allProfiles, setAllProfiles] = useState<any[]>([]);

  // Para nova observação
  const [newObservation, setNewObservation] = useState('');
  const [isSubmittingObs, setIsSubmittingObs] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!cpf) return;

      // Busca customer e contratos em PARALELO (2x mais rápido que serial)
      const [custRes, profilesRes] = await Promise.all([
        supabase.from('customers').select(`
          *,
          profiles (username),
          collection_history (*)
        `).eq('cpf', cpf).single(),
        isAdmin ? supabase.from('profiles').select('*') : Promise.resolve({ data: [] })
      ]);

      const custData = custRes.data;

      if (isAdmin && profilesRes.data) {
        setAllProfiles(profilesRes.data);
      }

      if (!custData) return;

      // Regra de Acesso:
      // Admin: Acesso total
      // User Padrão: Só acessa se for o dono (owner_id === profile.id) ou se não tiver dono (owner_id === null)
      if (!isAdmin && custData.owner_id && custData.owner_id !== profile?.id) {
        setAccessDenied(true);
        return;
      }

      // Busca contratos em paralelo com setCustomer (não bloqueia a UI)
      const [, contRes] = await Promise.all([
        Promise.resolve(setCustomer(custData)),
        supabase.from('contracts').select(`
          *,
          companies (cnpj, razao_social)
        `).eq('customer_id', custData.id)
      ]);

      const contData = contRes.data;
      if (contData) {
        // Lógica de conciliação
        const grouped: Record<string, any[]> = {};
        contData.forEach(c => {
          if (!grouped[c.contract_number]) grouped[c.contract_number] = [];
          grouped[c.contract_number].push(c);
        });
        
        const consolidatedContracts: any[] = [];
        
        Object.values(grouped).forEach(group => {
          if (group.length === 1) {
            const c = group[0];
            consolidatedContracts.push({
              ...c,
              discrepancyType: c.source_system === 'BDR' ? 'SOMENTE BDR' : (c.source_system === 'CORDEL' ? 'SOMENTE CORDEL' : null),
              bdrData: c.source_system === 'BDR' ? c : null,
              cordelData: c.source_system === 'CORDEL' ? c : null
            });
          } else {
            const bdr = group.find(c => c.source_system === 'BDR');
            const cordel = group.find(c => c.source_system === 'CORDEL');
            // Priorizar exibição do Cordel se existir
            const base = cordel || bdr || group[0];
            
            let discrepancyType = null;
            if (bdr && cordel) {
              if (bdr.status !== cordel.status || Number(bdr.outstanding_balance) !== Number(cordel.outstanding_balance)) {
                if (Number(bdr.outstanding_balance) > Number(cordel.outstanding_balance) * 1.5) {
                  discrepancyType = 'PARCELA ISOLADA';
                } else {
                  discrepancyType = 'DIVERGENTE';
                }
              } else {
                discrepancyType = 'CONCILIADO';
              }
            }
            
            consolidatedContracts.push({
              ...base,
              discrepancyType,
              bdrData: bdr,
              cordelData: cordel,
              status: discrepancyType === 'DIVERGENTE' ? 'Divergente' : base.status
            });
          }
        });
        
        setContracts(consolidatedContracts);
      }
    }
    
    // So roda quando profile tiver carregado para não dar falso positivo na trava
    if (profile !== undefined) {
      fetchData();
    }
  }, [cpf, isAdmin, profile]);

  if (accessDenied) {
    return (
      <div className="main-content">
        <button className="btn-secondary mb-4" onClick={() => navigate(-1)}><ArrowLeft size={18} /> Voltar</button>
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <h2 style={{ color: 'var(--color-danger)', marginBottom: '1rem' }}>Acesso Negado</h2>
          <p className="text-muted">
            Este cliente pertence à carteira de outro operador. Apenas o dono ou um administrador pode visualizar seus detalhes.
          </p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="main-content">
        <button className="btn-secondary mb-4" onClick={() => navigate(-1)}><ArrowLeft size={18} /> Voltar</button>
        <p>Carregando dados do cliente...</p>
      </div>
    );
  }

  const handleTakeOwnership = async () => {
    if (!profile) return;
    const { error } = await supabaseAdmin.from('customers').update({ owner_id: profile.id }).eq('id', customer.id);
    if (!error) {
      // Registrar no histórico
      await supabase.from('collection_history').insert({
        customer_id: customer.id,
        title: 'Transferência de Carteira',
        description: `O usuário @${profile.username} assumiu este cliente (Auto-atribuição).`,
        responsible: profile.username
      });
      
      setCustomer({ ...customer, owner_id: profile.id, profiles: { username: profile.username } });
      alert('Cliente atribuído à sua carteira com sucesso!');
    } else {
      console.error(error);
      alert('Erro de permissão! O banco de dados bloqueou a alteração. Falta a regra de UPDATE.');
    }
  };

  const handleTransferOwnership = async (newOwnerId: string) => {
    const ownerToSet = newOwnerId === "" ? null : newOwnerId;
    const { error } = await supabaseAdmin.from('customers').update({ owner_id: ownerToSet }).eq('id', customer.id);
    if (!error) {
      let logMsg = '';
      if (ownerToSet === null) {
        logMsg = `O administrador @${profile?.username} removeu o dono do cliente. O cliente agora está "Sem dono".`;
        setCustomer({ ...customer, owner_id: null, profiles: null });
      } else {
        const selectedProf = allProfiles.find(p => p.id === newOwnerId);
        logMsg = `O administrador @${profile?.username} transferiu o cliente para @${selectedProf?.username}.`;
        setCustomer({ ...customer, owner_id: newOwnerId, profiles: { username: selectedProf?.username } });
      }

      // Registrar no histórico
      await supabase.from('collection_history').insert({
        customer_id: customer.id,
        title: 'Gestão de Carteira (Admin)',
        description: logMsg,
        responsible: profile?.username || 'Sistema'
      });

    } else {
      console.error(error);
      alert('Erro ao transferir: Falta regra de UPDATE no banco.');
    }
  };

  const handleAddObservation = async () => {
    if (!newObservation.trim() || !profile) return;
    setIsSubmittingObs(true);
    
    const newRecord = {
      customer_id: customer.id,
      title: 'Anotação / Interação Manual',
      description: newObservation.trim(),
      responsible: profile.username
    };
    
    const { data, error } = await supabase.from('collection_history').insert(newRecord).select().single();
    
    if (!error && data) {
      setCustomer({
        ...customer,
        collection_history: [...(customer.collection_history || []), data]
      });
      setNewObservation('');
    } else {
      alert('Erro ao salvar observação. Tente novamente.');
      console.error(error);
    }
    
    setIsSubmittingObs(false);
  };

  const handleSetReturnDate = async (newDate: string) => {
    const valToSet = newDate ? newDate : null;
    const { error } = await supabaseAdmin.from('customers').update({ return_date: valToSet }).eq('id', customer.id);
    if (!error) {
      setCustomer({ ...customer, return_date: valToSet });
      
      // Registrar no histórico
      await supabase.from('collection_history').insert({
        customer_id: customer.id,
        title: 'Data de Retorno Atualizada',
        description: valToSet ? `O retorno foi agendado para ${new Date(valToSet).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'A data de retorno foi removida.',
        responsible: profile?.username || 'Sistema'
      });
    } else {
      console.error(error);
      alert('Erro ao atualizar data de retorno. Falta permissão UPDATE?');
    }
  };

  const totalBalance = contracts.reduce((acc, curr) => {
    const status = String(curr.status).toLowerCase();
    if (status !== 'quitado' && status !== 'regular') {
      return acc + Number(curr.outstanding_balance);
    }
    return acc;
  }, 0);

  let qualLabel = '🟢 Regular';
  let qualColor = 'var(--color-success)';
  let qualBg = 'rgba(16, 185, 129, 0.1)';

  const hasAtraso = contracts.some(c => c.status === 'Em atraso' || c.status === 'Divergente');
  const hasPromessa = contracts.some(c => c.status === 'Promessa de Pagamento');
  const isAllQuitado = contracts.length > 0 && contracts.every(c => c.status === 'Quitado');

  if (hasAtraso) {
    qualLabel = '🔴 Risco Máximo';
    qualColor = 'var(--color-danger)';
    qualBg = 'rgba(239, 68, 68, 0.1)';
  } else if (hasPromessa) {
    qualLabel = '🟡 Em Negociação (Promessa)';
    qualColor = '#eab308';
    qualBg = 'rgba(234, 179, 8, 0.1)';
  } else if (isAllQuitado) {
    qualLabel = '🌟 Premium (Quitado)';
    qualColor = 'var(--color-primary)';
    qualBg = 'rgba(59, 130, 246, 0.1)';
  } else if (contracts.length === 0) {
    qualLabel = '⚪ Sem Vínculos';
    qualColor = 'var(--color-text-muted)';
    qualBg = 'rgba(255, 255, 255, 0.05)';
  }
  
  let tipoEventoGeral = '';

  contracts.forEach(c => {
    if (c.metadata) {
      const rawEvent = c.metadata.tipo_evento || c.metadata.tipo_evento_sacado || c.metadata['TIPO EVENTO SACADO'] || c.metadata.em_cobranca;
      if (typeof rawEvent === 'string' && rawEvent.trim() !== '' && !tipoEventoGeral) {
        let evt = String(rawEvent).toUpperCase();
        if (evt.includes('RESCIS') || evt.includes('RECIS')) evt = 'DEMISSÃO';
        tipoEventoGeral = evt;
      }
    }
  });

  const handleStatusChange = async (contractId: string, newStatus: string) => {
    const { error } = await supabaseAdmin.from('contracts').update({ status: newStatus }).eq('id', contractId);
    
    if (!error) {
      const updatedContracts = contracts.map((c: any) => 
        c.id === contractId ? { ...c, status: newStatus } : c
      );
      setContracts(updatedContracts);
      setCustomer({ ...customer, contracts: updatedContracts });
      
      // Correção de Inconsistência: Sincronizar mudança de status do contrato com a fase do CRM (Kanban)
      let phaseToLog = '';
      if (newStatus === 'Quitado') phaseToLog = 'Pagamento realizado';
      else if (newStatus === 'Promessa de Pagamento') phaseToLog = 'Promessa de Pagamento';

      if (phaseToLog) {
         const { data: newHist } = await supabase.from('collection_history').insert({
           customer_id: customer.id,
           title: `Contrato Atualizado: ${newStatus}`,
           phase: phaseToLog,
           description: `O status financeiro do contrato foi alterado para "${newStatus}". O sistema moveu automaticamente a fase do cliente para "${phaseToLog}".`,
           responsible: profile?.username || 'Sistema'
         }).select().single();
         
         if (newHist) {
           setCustomer((prev: any) => ({
             ...prev,
             collection_history: [...(prev.collection_history || []), newHist]
           }));
         }
      }
    }
  };

  return (
    <div>
      <button className="btn-secondary mb-4" onClick={() => navigate(-1)}>
        <ArrowLeft size={18} /> Voltar
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '2rem' }}>
        <div className="glass-card" style={{ height: 'fit-content' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.2)', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '1rem' }}>
              <User size={40} className="text-primary" />
            </div>
            <h2 style={{ marginBottom: '0.25rem' }}>{customer.full_name}</h2>
            <p className="text-muted mb-4">{customer.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}</p>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {customer.phone && (
                <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.6rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                  📞 {customer.phone}
                </span>
              )}
              {customer.email && (
                <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.6rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                  ✉️ {customer.email}
                </span>
              )}
              {customer.origin && (
                <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.6rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
                  🌍 {customer.origin}
                </span>
              )}
            </div>

            {/* Tag de Qualificação */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <div style={{ 
                background: qualBg, 
                color: qualColor, 
                padding: '0.5rem 1rem', 
                borderRadius: '2rem', 
                fontWeight: 'bold', 
                fontSize: '0.9rem',
                border: `1px solid ${qualColor}40`
              }}>
                {qualLabel}
              </div>
              
              {tipoEventoGeral && (
                <div style={{ 
                  background: tipoEventoGeral.includes('AFASTAMENTO') ? '#fef3c7' : '#fee2e2', 
                  color: tipoEventoGeral.includes('AFASTAMENTO') ? '#b45309' : '#b91c1c', 
                  padding: '0.5rem 1rem', 
                  borderRadius: '2rem', 
                  fontWeight: 'bold', 
                  fontSize: '0.9rem', 
                  border: `1px solid ${tipoEventoGeral.includes('AFASTAMENTO') ? '#fde68a' : '#fca5a5'}` 
                }}>
                  {tipoEventoGeral}
                </div>
              )}
            </div>

            {customer.additional_contacts && Object.keys(customer.additional_contacts).length > 0 && (
              <div style={{ width: '100%', padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid rgba(59, 130, 246, 0.2)', textAlign: 'left' }}>
                <div style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 'bold', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Users size={14} /> Contatos Secundários
                </div>
                <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.85rem' }}>
                  {customer.additional_contacts.contato_1_tel && (
                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-muted">{customer.additional_contacts.contato_1_nome || 'Contato 1'}</span>
                        <strong>{customer.additional_contacts.contato_1_tel}</strong>
                     </div>
                  )}
                  {customer.additional_contacts.contato_2_tel && (
                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-muted">{customer.additional_contacts.contato_2_nome || 'Contato 2'}</span>
                        <strong>{customer.additional_contacts.contato_2_tel}</strong>
                     </div>
                  )}
                  {customer.additional_contacts.contato_3_tel && (
                     <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="text-muted">{customer.additional_contacts.contato_3_nome || 'Contato 3'}</span>
                        <strong>{customer.additional_contacts.contato_3_tel}</strong>
                     </div>
                  )}
                </div>
              </div>
            )}
            
            <div style={{ width: '100%', padding: '1rem', background: 'var(--color-bg-panel)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--color-border)' }}>
              <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>Dívida Total</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-danger)' }}>
                R$ {totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {customer.notes && (
              <div style={{ width: '100%', padding: '1rem', background: 'rgba(245, 158, 11, 0.05)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid rgba(245, 158, 11, 0.2)', textAlign: 'left' }}>
                <div style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 'bold', marginBottom: '0.5rem' }}>Observações do Cliente:</div>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text)', margin: 0, whiteSpace: 'pre-wrap' }}>{customer.notes}</p>
              </div>
            )}

            {/* Bloco Data de Retorno */}
            <div style={{ width: '100%', padding: '1rem', background: 'var(--color-bg-panel)', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--color-border)' }}>
              <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Agendar Retorno (Follow-up)</div>
              <input 
                type="datetime-local" 
                value={customer.return_date ? new Date(customer.return_date).toISOString().slice(0,16) : ''}
                onChange={(e) => handleSetReturnDate(e.target.value)}
                className="input-field"
                style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem' }}
              />
            </div>

            {/* Gestão de Carteira */}
            <div style={{ width: '100%', padding: '1rem', background: 'var(--color-bg-panel)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: 'var(--color-text-muted)' }}>
                <Users size={16} /> <span style={{ fontSize: '0.85rem' }}>Responsável</span>
              </div>
              
              {!customer.owner_id ? (
                <div>
                  <span style={{ display: 'block', marginBottom: '0.5rem', color: '#f59e0b', fontSize: '0.9rem' }}>Sem dono definido</span>
                  
                  {!isAdmin && (
                    <button onClick={handleTakeOwnership} className="btn-primary" style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem' }}>
                      <UserPlus size={16} /> Pegar para mim
                    </button>
                  )}

                  {isAdmin && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '0.25rem' }}>Atribuir a um operador:</span>
                      <select 
                        onChange={(e) => handleTransferOwnership(e.target.value)}
                        className="input-field"
                        defaultValue=""
                        style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem', textAlign: 'center', cursor: 'pointer' }}
                      >
                        <option value="" disabled style={{ background: 'var(--color-bg-panel)' }}>Selecione um operador...</option>
                        {allProfiles.filter(p => p.role !== 'ADMIN').map(p => (
                          <option key={p.id} value={p.id} style={{ background: 'var(--color-bg-panel)' }}>
                            {p.username}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {isAdmin ? (
                    <select 
                      value={customer.owner_id || ""}
                      onChange={(e) => handleTransferOwnership(e.target.value)}
                      className="input-field"
                      style={{ padding: '0.5rem', fontSize: '0.85rem', textAlign: 'center', cursor: 'pointer' }}
                    >
                      <option value="" style={{ background: 'var(--color-bg-panel)', color: '#f59e0b' }}>-- Remover Dono --</option>
                      {allProfiles.filter(p => p.role !== 'ADMIN').map(p => (
                        <option key={p.id} value={p.id} style={{ background: 'var(--color-bg-panel)' }}>
                          {p.username}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--color-primary)' }}>
                      @{customer.profiles?.username}
                    </div>
                  )}
                  {isAdmin && <div className="text-muted mt-2" style={{ fontSize: '0.75rem' }}>Você pode transferir ou remover o dono.</div>}
                </div>
              )}
            </div>
            
          </div>
        </div>

        <div>
          <h2 className="mb-4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} /> Contratos do Cliente
          </h2>
          
          <div style={{ display: 'grid', gap: '1rem' }}>
            {contracts.map(contract => (
              <div 
                key={contract.id} 
                className="glass-card" 
                style={{ 
                  padding: '1rem 1.25rem', 
                  cursor: 'pointer', 
                  transition: 'background 0.2s',
                  borderLeft: contract.discrepancyType === 'DIVERGENTE' ? '4px solid #f59e0b' : 
                              contract.discrepancyType === 'PARCELA ISOLADA' ? '4px solid #8b5cf6' :
                              (contract.status === 'Regular' || contract.status === 'Quitado' ? '4px solid var(--color-success)' : '4px solid var(--color-danger)')
                }}
                onClick={() => setSelectedContract(contract)}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', marginBottom: '0.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {contract.contract_number}
                      {contract.fund && (
                        <span style={{ fontSize: '0.7rem', background: 'rgba(255, 255, 255, 0.1)', color: '#e2e8f0', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                          {contract.fund}
                        </span>
                      )}
                      {contract.discrepancyType === 'DIVERGENTE' && (
                        <span style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                          DIVERGENTE
                        </span>
                      )}
                      {contract.discrepancyType === 'PARCELA ISOLADA' && (
                        <span style={{ fontSize: '0.7rem', background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                          PARCELA ISOLADA
                        </span>
                      )}
                      {contract.discrepancyType === 'SOMENTE BDR' && (
                        <span style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                          SOMENTE BDR
                        </span>
                      )}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', marginBottom: '0.5rem' }} className="text-muted">
                      <Briefcase size={14} /> 
                      <strong style={{ color: 'var(--color-text)', fontSize: '0.95rem' }}>
                        {contract.companies?.razao_social || contract.metadata?.empresa || contract.metadata?.fonte_pagadora || 'Desconhecido'}
                      </strong>
                    </div>

                    {(() => {
                      const meta = contract.metadata || {};
                      let tipoEvento = '';
                      let dataEvento = '';
                      let vencBase = '';

                      const formatExcelDate = (serial: any) => {
                         if (!serial || isNaN(Number(serial)) || Number(serial) < 30000) return '';
                         const days = Math.floor(Number(serial) - 25569);
                         return new Date(days * 86400 * 1000).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                      };

                      const rawEvent = meta.tipo_evento || meta.tipo_evento_sacado || meta['TIPO EVENTO SACADO'] || meta.em_cobranca;
                      if (typeof rawEvent === 'string' && rawEvent.trim() !== '') {
                        let evt = String(rawEvent).toUpperCase();
                        if (evt.includes('RESCIS') || evt.includes('RECIS')) evt = 'DEMISSÃO';
                        tipoEvento = evt;
                      }
                      
                      const dtDesl = meta['entrada_afastamento/rescisao'] || meta['dt_desligamento'] || meta['ENTRADA AFASTAMENTO/RESCISAO'];
                      if (dtDesl) dataEvento = formatExcelDate(dtDesl);
                      
                      const dtVenc = meta['dt_venc_origem'] || meta['dt_venc_ajustado'] || meta['DT VENC ORIGEM'];
                      if (dtVenc) vencBase = formatExcelDate(dtVenc);

                      if (!tipoEvento && !dataEvento && !vencBase) return null;

                      return (
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                          {tipoEvento && (
                            <span style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                              EVENTO: {tipoEvento}
                            </span>
                          )}
                          {dataEvento && (
                            <span style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                              DATA EVENTO: {dataEvento}
                            </span>
                          )}
                          {vencBase && (
                            <span style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                              VENC. BASE: {vencBase}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '1.1rem', color: contract.discrepancyType === 'DIVERGENTE' ? '#f59e0b' : contract.discrepancyType === 'PARCELA ISOLADA' ? '#8b5cf6' : 'var(--color-primary)' }}>
                      R$ {Number(contract.outstanding_balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>

                    {(() => {
                      const meta = contract.metadata || {};
                      let qtdParcelas = parseInt(contract.total_installments || meta.n_parcelas_lastro || meta.pz_total || 1, 10);
                      if (isNaN(qtdParcelas) || qtdParcelas <= 0) qtdParcelas = 1;
                      
                      const saldo = Number(contract.outstanding_balance) || 0;
                      const valorParcela = saldo / qtdParcelas;

                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }} className="text-muted">
                          <span>{qtdParcelas}x de</span>
                          <strong style={{ color: 'var(--color-text)' }}>R$ {valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                        </div>
                      );
                    })()}

                    <span style={{ fontSize: '0.7rem', marginTop: '0.25rem' }} className="text-muted">Clique para detalhes</span>
                  </div>
                </div>
              </div>
            ))}
            
            {contracts.length === 0 && (
              <div className="glass-card text-center text-muted" style={{ padding: '2rem' }}>
                Nenhum contrato ativo encontrado para este cliente.
              </div>
            )}
          </div>

          {/* HISTÓRICO DE COBRANÇAS / CRM */}
          <div style={{ marginTop: '2rem' }}>
            <h2 className="mb-4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={20} /> Histórico e Observações
            </h2>
            
            <div style={{ background: 'var(--color-bg-panel)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1.5rem' }}>
              <textarea 
                value={newObservation}
                onChange={(e) => setNewObservation(e.target.value)}
                placeholder="Registre uma nova interação, promessa ou recado que você teve com o cliente..."
                className="input-field"
                style={{ width: '100%', minHeight: '80px', resize: 'vertical', marginBottom: '0.75rem', background: 'var(--color-bg)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button 
                  onClick={handleAddObservation} 
                  disabled={isSubmittingObs || !newObservation.trim()}
                  className="btn-primary" 
                  style={{ padding: '0.5rem 1.5rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {isSubmittingObs ? 'Salvando...' : 'Adicionar Observação'}
                </button>
              </div>
            </div>

            {customer.collection_history && customer.collection_history.length > 0 ? (
              <div style={{ display: 'grid', gap: '0.75rem', borderLeft: '2px solid var(--color-border)', paddingLeft: '1rem', marginLeft: '0.5rem' }}>
                {customer.collection_history
                  .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((history: any) => (
                  <div key={history.id} style={{ position: 'relative', background: 'var(--color-bg-panel)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                    {/* Linha do tempo dot */}
                    <div style={{ position: 'absolute', left: '-1.45rem', top: '1.25rem', width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6', border: '2px solid var(--color-bg)' }}></div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <div>
                        <strong style={{ fontSize: '0.95rem', display: 'block' }}>{history.title || 'Ocorrência'}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)', padding: '0.1rem 0.4rem', borderRadius: '4px', marginRight: '0.5rem' }}>
                          Fase: {history.phase || 'N/A'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          Status: {history.status || 'N/A'}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                          {new Date(history.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                          @{history.responsible || 'Sistema'}
                        </div>
                      </div>
                    </div>
                    
                    {history.description && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                        {history.description}
                      </div>
                    )}
                    
                    {(history.assigned_value > 0 || history.situation) && (
                      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.75rem' }}>
                        {history.assigned_value > 0 && (
                          <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>
                            Valor Negociado: R$ {Number(history.assigned_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                        {history.situation && (
                          <span className="text-muted">Situação: {history.situation}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted text-center" style={{ padding: '2rem', background: 'var(--color-bg-panel)', borderRadius: 'var(--radius-md)' }}>
                Nenhuma ocorrência ou observação registrada para este cliente.
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Modal / Card Flutuante do Contrato */}
      {selectedContract && (
        <div 
          style={{ 
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 
          }}
          onClick={() => setSelectedContract(null)}
        >
          <div 
            className="glass-card" 
            style={{ 
              width: '100%', maxWidth: (selectedContract.discrepancyType === 'DIVERGENTE' || selectedContract.discrepancyType === 'PARCELA ISOLADA') ? '800px' : '500px', padding: '2rem', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(0, 255, 170, 0.1)',
              maxHeight: '90vh', overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '0.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {selectedContract.contract_number}
                  {selectedContract.discrepancyType && (
                     <span style={{ 
                        fontSize: '0.75rem', 
                        background: selectedContract.discrepancyType === 'DIVERGENTE' ? 'rgba(245,158,11,0.2)' : 
                                    selectedContract.discrepancyType === 'PARCELA ISOLADA' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(59,130,246,0.2)',
                        color: selectedContract.discrepancyType === 'DIVERGENTE' ? '#f59e0b' : 
                               selectedContract.discrepancyType === 'PARCELA ISOLADA' ? '#8b5cf6' : '#3b82f6',
                        padding: '0.2rem 0.5rem', borderRadius: '4px' 
                     }}>
                        {selectedContract.discrepancyType}
                     </span>
                  )}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }} className="text-muted">
                  <Briefcase size={16} style={{ color: 'var(--color-primary)' }} /> 
                  <strong style={{ color: 'var(--color-text)', fontSize: '1.1rem' }}>
                    {selectedContract.companies?.razao_social || selectedContract.metadata?.empresa || selectedContract.metadata?.fonte_pagadora || 'Desconhecido'}
                  </strong>
                </div>
              </div>
              <button 
                onClick={() => setSelectedContract(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '1.5rem' }}
              >
                &times;
              </button>
            </div>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Status da Cobrança (Consolidado)</label>
              <select 
                value={selectedContract.status}
                onChange={(e) => {
                  handleStatusChange(selectedContract.id, e.target.value);
                  setSelectedContract({ ...selectedContract, status: e.target.value });
                }}
                style={{ 
                  width: '100%',
                  padding: '0.75rem', 
                  borderRadius: 'var(--radius-sm)', 
                  fontSize: '0.95rem', 
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: `1px solid ${selectedContract.status === 'Regular' || selectedContract.status === 'Quitado' ? 'var(--color-success)' : (selectedContract.status === 'Divergente' ? '#f59e0b' : 'var(--color-danger)')}60`,
                  background: selectedContract.status === 'Regular' || selectedContract.status === 'Quitado' ? 'rgba(16, 185, 129, 0.15)' : (selectedContract.status === 'Divergente' ? 'rgba(245,158,11,0.15)' : 'rgba(239, 68, 68, 0.15)'),
                  color: selectedContract.status === 'Regular' || selectedContract.status === 'Quitado' ? 'var(--color-success)' : (selectedContract.status === 'Divergente' ? '#f59e0b' : 'var(--color-danger)'),
                  outline: 'none'
                }}
              >
                <option value="Regular" style={{ background: 'var(--color-bg-panel)', color: 'var(--color-text)' }}>Regular</option>
                <option value="Em atraso" style={{ background: 'var(--color-bg-panel)', color: 'var(--color-text)' }}>Em Atraso</option>
                <option value="Divergente" style={{ background: 'var(--color-bg-panel)', color: 'var(--color-text)' }}>Divergente</option>
                <option value="Promessa de Pagamento" style={{ background: 'var(--color-bg-panel)', color: 'var(--color-text)' }}>Promessa</option>
                <option value="Quitado" style={{ background: 'var(--color-bg-panel)', color: 'var(--color-text)' }}>Quitado</option>
              </select>
            </div>

            {selectedContract.discrepancyType === 'DIVERGENTE' || selectedContract.discrepancyType === 'PARCELA ISOLADA' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div style={{ background: 'rgba(59, 130, 246, 0.05)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59,130,246,0.2)' }}>
                   <h4 style={{ color: '#3b82f6', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><FileText size={16}/> Dados BDR</h4>
                   <div style={{ display: 'grid', gap: '0.75rem' }}>
                     <div>
                       <div className="text-muted" style={{ fontSize: '0.75rem' }}>Status</div>
                       <div style={{ fontWeight: 500 }}>{selectedContract.bdrData?.status || 'N/A'}</div>
                     </div>
                     <div>
                       <div className="text-muted" style={{ fontSize: '0.75rem' }}>Saldo Atual</div>
                       <div style={{ fontWeight: 600 }}>R$ {selectedContract.bdrData ? Number(selectedContract.bdrData.outstanding_balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'}</div>
                     </div>
                     <div>
                       <div className="text-muted" style={{ fontSize: '0.75rem' }}>Valor Contratado</div>
                       <div style={{ fontWeight: 500 }}>R$ {selectedContract.bdrData ? Number(selectedContract.bdrData.contracted_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'}</div>
                     </div>
                     <div>
                       <div className="text-muted" style={{ fontSize: '0.75rem' }}>Vencimento Base</div>
                       <div style={{ fontWeight: 500 }}>
                         {(() => {
                           if (!selectedContract.bdrData) return 'N/A';
                           if (selectedContract.bdrData.due_date && new Date(selectedContract.bdrData.due_date).getFullYear() > 1970) {
                              return new Date(selectedContract.bdrData.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                           }
                           const meta = selectedContract.bdrData.metadata || {};
                           const excelDate = meta['dt_venc_origem'] || meta['dt_venc_ajustado'] || meta['DT VENC ORIGEM'];
                           if (excelDate && !isNaN(Number(excelDate)) && Number(excelDate) > 30000 && Number(excelDate) < 60000) {
                              const days = Math.floor(Number(excelDate) - 25569);
                              const dt = new Date(days * 86400 * 1000);
                              return new Date(dt.getTime() + dt.getTimezoneOffset() * 60000).toLocaleDateString('pt-BR');
                           }
                           return 'Não informado';
                         })()}
                       </div>
                     </div>
                     <div>
                       <div className="text-muted" style={{ fontSize: '0.75rem' }}>Data Demissão</div>
                       <div style={{ fontWeight: 500 }}>
                         {(() => {
                           if (!selectedContract.bdrData) return 'N/A';
                           if (selectedContract.bdrData.dismissal_date && new Date(selectedContract.bdrData.dismissal_date).getFullYear() > 1970) {
                              return new Date(selectedContract.bdrData.dismissal_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                           }
                           const meta = selectedContract.bdrData.metadata || {};
                           const excelDate = meta['entrada_afastamento/rescisao'] || meta['dt_desligamento'] || meta['ENTRADA AFASTAMENTO/RESCISAO'];
                           if (excelDate && !isNaN(Number(excelDate)) && Number(excelDate) > 30000 && Number(excelDate) < 60000) {
                              const days = Math.floor(Number(excelDate) - 25569);
                              const dt = new Date(days * 86400 * 1000);
                              return new Date(dt.getTime() + dt.getTimezoneOffset() * 60000).toLocaleDateString('pt-BR');
                           }
                           return 'Não aplicável';
                         })()}
                       </div>
                     </div>
                   </div>
                </div>
                <div style={{ background: 'rgba(234, 179, 8, 0.05)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(234,179,8,0.2)' }}>
                   <h4 style={{ color: '#eab308', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><FileText size={16}/> Dados CORDEL</h4>
                   <div style={{ display: 'grid', gap: '0.75rem' }}>
                     <div>
                       <div className="text-muted" style={{ fontSize: '0.75rem' }}>Status</div>
                       <div style={{ fontWeight: 500 }}>{selectedContract.cordelData?.status || 'N/A'}</div>
                     </div>
                     <div>
                       <div className="text-muted" style={{ fontSize: '0.75rem' }}>Saldo Atual</div>
                       <div style={{ fontWeight: 600 }}>R$ {selectedContract.cordelData ? Number(selectedContract.cordelData.outstanding_balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'}</div>
                     </div>
                     <div>
                       <div className="text-muted" style={{ fontSize: '0.75rem' }}>Valor Contratado</div>
                       <div style={{ fontWeight: 500 }}>R$ {selectedContract.cordelData ? Number(selectedContract.cordelData.contracted_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'}</div>
                     </div>
                     <div>
                       <div className="text-muted" style={{ fontSize: '0.75rem' }}>Vencimento Base</div>
                       <div style={{ fontWeight: 500 }}>
                         {(() => {
                           if (!selectedContract.cordelData) return 'N/A';
                           if (selectedContract.cordelData.due_date && new Date(selectedContract.cordelData.due_date).getFullYear() > 1970) {
                              return new Date(selectedContract.cordelData.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                           }
                           return 'Não informado';
                         })()}
                       </div>
                     </div>
                     <div>
                       <div className="text-muted" style={{ fontSize: '0.75rem' }}>Data Demissão</div>
                       <div style={{ fontWeight: 500 }}>
                         {(() => {
                           if (!selectedContract.cordelData) return 'N/A';
                           if (selectedContract.cordelData.dismissal_date && new Date(selectedContract.cordelData.dismissal_date).getFullYear() > 1970) {
                              return new Date(selectedContract.cordelData.dismissal_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                           }
                           return 'Não aplicável';
                         })()}
                       </div>
                     </div>
                   </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.2rem' }}>Valor Contratado</div>
                  <div style={{ fontWeight: 500 }}>R$ {Number(selectedContract.contracted_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.2rem' }}>Saldo Atual</div>
                  <div style={{ fontWeight: 600, color: 'var(--color-danger)' }}>R$ {Number(selectedContract.outstanding_balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.2rem' }}>Total Parcelas</div>
                  <div style={{ fontWeight: 500 }}>
                    {(() => {
                      const meta = selectedContract.metadata || {};
                      let qtdParcelas = parseInt(selectedContract.total_installments || meta.n_parcelas_lastro || meta.pz_total || 1, 10);
                      if (isNaN(qtdParcelas) || qtdParcelas <= 0) qtdParcelas = 1;
                      return `${qtdParcelas}x`;
                    })()}
                  </div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.2rem' }}>Valor da Parcela</div>
                  <div style={{ fontWeight: 500 }}>
                    {(() => {
                      const meta = selectedContract.metadata || {};
                      let qtdParcelas = parseInt(selectedContract.total_installments || meta.n_parcelas_lastro || meta.pz_total || 1, 10);
                      if (isNaN(qtdParcelas) || qtdParcelas <= 0) qtdParcelas = 1;
                      
                      const saldo = Number(selectedContract.outstanding_balance) || 0;
                      const valorParcela = saldo / qtdParcelas;
                      return `R$ ${valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
                    })()}
                  </div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.2rem' }}>Fundo</div>
                  <div style={{ fontWeight: 500 }}>{selectedContract.fund || 'Não informado'}</div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.2rem' }}>Vencimento Base</div>
                  <div style={{ fontWeight: 500 }}>
                    {(() => {
                       if (selectedContract.due_date && new Date(selectedContract.due_date).getFullYear() > 1970) {
                          return new Date(selectedContract.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                       }
                       const meta = selectedContract.metadata || {};
                       const excelDate = meta['dt_venc_origem'] || meta['dt_venc_ajustado'] || meta['DT VENC ORIGEM'] || meta['DT VENC AJUSTADO'];
                       if (excelDate && !isNaN(Number(excelDate)) && Number(excelDate) > 30000 && Number(excelDate) < 60000) {
                          const days = Math.floor(Number(excelDate) - 25569);
                          const dt = new Date(days * 86400 * 1000);
                          return new Date(dt.getTime() + dt.getTimezoneOffset() * 60000).toLocaleDateString('pt-BR');
                       }
                       return 'Não informado';
                    })()}
                  </div>
                </div>
                <div>
                  <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.2rem' }}>Data Demissão</div>
                  <div style={{ fontWeight: 500 }}>
                    {(() => {
                       if (selectedContract.dismissal_date && new Date(selectedContract.dismissal_date).getFullYear() > 1970) {
                          return new Date(selectedContract.dismissal_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
                       }
                       const meta = selectedContract.metadata || {};
                       const excelDate = meta['entrada_afastamento/rescisao'] || meta['dt_desligamento'] || meta['ENTRADA AFASTAMENTO/RESCISAO'] || meta['DT DESLIGAMENTO'];
                       if (excelDate && !isNaN(Number(excelDate)) && Number(excelDate) > 30000 && Number(excelDate) < 60000) {
                          const days = Math.floor(Number(excelDate) - 25569);
                          const dt = new Date(days * 86400 * 1000);
                          return new Date(dt.getTime() + dt.getTimezoneOffset() * 60000).toLocaleDateString('pt-BR');
                       }
                       return 'Não aplicável';
                    })()}
                  </div>
                </div>
              </div>
            )}

            {selectedContract.metadata && Object.keys(selectedContract.metadata).length > 0 && (
              <div style={{ marginTop: '1.5rem', background: 'rgba(59, 130, 246, 0.05)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <div style={{ fontSize: '0.9rem', color: '#3b82f6', fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={16}/> Dados Detalhados da Importação (Origem)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  {(() => {
                    // Campos a ESCONDER
                    const hiddenKeys = new Set([
                      'status', 'tx_lastro', 'tx_cessao', 'nm_cessao', 'nm_cessao_bdr'
                    ]);

                    // Renomear campos
                    const renameMap: Record<string, string> = {
                      'pz_atual': 'TEMPO DE ATRASO',
                      'n_controle_lastro_bdr': 'CCB',
                      'n_controle_lastro_origem': 'CCB ORIGEM',
                      'vl_pdd': 'VL PDD',
                      'vl_face': 'VL FACE',
                      'vl_aquisicao': 'VL AQUISIÇÃO',
                      'vl_presente_adm': 'VL PRESENTE ADM',
                      'cnpj_fundo': 'CNPJ FUNDO',
                      'cnpj_empresa': 'CNPJ EMPRESA',
                      'doc_sacado': 'DOCUMENTO SACADO',
                      'doc_cedente': 'DOCUMENTO CEDENTE',
                    };

                    // Campos de documento (remover prefixo FD e formatar)
                    const docKeys = new Set(['cnpj_fundo', 'cnpj_empresa', 'doc_sacado', 'doc_cedente', 'pagador']);

                    // Campos de valor monetário
                    const moneyKeys = new Set(['vl_pdd', 'vl_face', 'vl_aquisicao', 'vl_presente_adm']);

                    const formatDoc = (k: string, v: string) => {
                      const nums = String(v).replace(/\D/g, '');
                      // Sacado é sempre CPF — o BDR adiciona zeros à esquerda, precisamos limpar
                      if (k.toLowerCase() === 'doc_sacado') {
                        const stripped = nums.replace(/^0+/, '') || '0';
                        const padded = stripped.padStart(11, '0');
                        return padded.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                      }
                      if (nums.length <= 11) {
                        const padded = nums.padStart(11, '0');
                        return padded.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
                      }
                      if (nums.length <= 14) {
                        const padded = nums.padStart(14, '0');
                        return padded.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
                      }
                      // Mais de 14 dígitos: provavelmente FD + CNPJ, pegar últimos 14
                      const cnpjPart = nums.slice(-14);
                      return cnpjPart.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
                    };

                    const formatMetadataValue = (k: string, v: any) => {
                      if (v === null || v === '') return '-';
                      const kLower = k.toLowerCase();

                      // Datas Excel
                      const isDateKey = kLower.includes('dt') || kLower.includes('data') || kLower.includes('venc') || kLower.includes('rescisao') || kLower.includes('afastamento') || kLower.includes('prestacao');
                      if (isDateKey && !isNaN(Number(v)) && Number(v) > 30000 && Number(v) < 60000) {
                        const days = Math.floor(Number(v) - 25569);
                        const date = new Date(days * 86400 * 1000);
                        const dt = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
                        return dt.toLocaleDateString('pt-BR');
                      }

                      // Documentos
                      if (docKeys.has(kLower)) return formatDoc(k, String(v));

                      // Valores monetários → vírgula
                      if (moneyKeys.has(kLower)) return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

                      // pz_atual → dias em atraso
                      if (kLower === 'pz_atual') {
                        const dias = Math.abs(Number(v));
                        return `${dias} dias`;
                      }

                      return String(v);
                    };

                    return Object.entries(selectedContract.metadata)
                      .filter(([key]) => !hiddenKeys.has(key.toLowerCase()))
                      .map(([key, value]: [string, any]) => {
                        const label = renameMap[key.toLowerCase()] || key.replace(/_/g, ' ');
                        return (
                          <div key={key} style={{ background: 'var(--color-bg)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                            <div className="text-muted" style={{ fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: '0.2rem', letterSpacing: '0.5px' }}>
                              {label}
                            </div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500, wordBreak: 'break-word' }}>
                              {formatMetadataValue(key, value)}
                            </div>
                          </div>
                        );
                      });
                  })()}
                </div>
              </div>
            )}
            
            {selectedContract.notes && (
              <div style={{ marginTop: '1.5rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>Observações do Contrato:</div>
                <p style={{ fontSize: '0.85rem', margin: 0, whiteSpace: 'pre-wrap' }}>{selectedContract.notes}</p>
              </div>
            )}
            
          </div>
        </div>
      )}
    </div>
  );
};
