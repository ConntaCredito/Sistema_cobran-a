import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';
import { KanbanBoard } from '../components/KanbanBoard';
import { List, LayoutDashboard, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const CustomersList = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  const [fundFilter, setFundFilter] = useState<'Todos' | 'Alcar' | 'Alpha'>('Todos');
  const [operatorFilter, setOperatorFilter] = useState<string>('Todos');
  const [operatorsList, setOperatorsList] = useState<{id: string, username: string}[]>([]);

  useEffect(() => {
    if (profile?.role === 'ADMIN') {
      supabase.from('profiles').select('id, username').order('username')
        .then(({ data }) => {
          if (data) setOperatorsList(data);
        });
    }
  }, [profile]);

  useEffect(() => {
    async function fetchCustomers() {
      if (!profile) return;
      
      const CACHE_KEY = `customers_list_v1_${profile.id}_${fundFilter}_${operatorFilter}`;
      const CACHE_TTL = 5 * 60 * 1000;

      if (!searchTerm.trim()) {
        try {
          const cached = sessionStorage.getItem(CACHE_KEY);
          if (cached) {
            const { ts, data } = JSON.parse(cached);
            if (Date.now() - ts < CACHE_TTL) {
              setCustomers(data);
              setLoading(false);
              return;
            }
          }
        } catch (_) {}
      }

      setLoading(true);

      const isAdmin = profile.role === 'ADMIN';
      let allData: any[] = [];

      try {
        let page = 0;
        const pageSize = 500;
        let hasMore = true;

        while (hasMore) {
          setProgressMsg(`Carregando base de dados... (${allData.length} registros)`);
          
          let query = supabase
            .from('customers')
            .select('id, cpf, full_name, phone, email, return_date, owner_id, profiles(username)')
            .order('created_at', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);
            
          if (!isAdmin) {
            query = query.or(`owner_id.eq.${profile.id},owner_id.is.null`);
          } else {
            if (operatorFilter === 'SemDono') {
              query = query.is('owner_id', null);
            } else if (operatorFilter !== 'Todos') {
              query = query.eq('owner_id', operatorFilter);
            }
          }
          
          if (searchTerm.trim().length > 0) {
            const term = searchTerm.trim();
            const onlyNumbers = term.replace(/\D/g, '');
            
            if (onlyNumbers.length > 0) {
              query = query.or(`full_name.ilike.%${term}%,cpf.ilike.%${term}%,cpf.ilike.%${onlyNumbers}%`);
            } else {
              query = query.or(`full_name.ilike.%${term}%`);
            }
          }
          
          const { data: custData, error } = await query;
          if (error) {
             console.error("ERRO GRAVE AO BUSCAR:", error);
             setProgressMsg(`Erro: ${error.message}`);
             hasMore = false;
             break;
          }
          
          if (custData && custData.length > 0) {
            allData = [...allData, ...custData];
            if (custData.length < pageSize) hasMore = false;
            else page++;
          } else {
            hasMore = false;
          }
        }

        setProgressMsg(`Avaliando contratos e divergências...`);
        const customerIds = allData.map(c => c.id);
        
        let allContracts: any[] = [];
        for (let i = 0; i < customerIds.length; i += 500) {
           const chunk = customerIds.slice(i, i + 500);
           const { data: cData } = await supabase
             .from('contracts')
             .select('*, companies(razao_social)')
             .in('customer_id', chunk);
           if (cData) allContracts = [...allContracts, ...cData];
        }

        const consolidatedCustomers = allData.map(customer => {
          const cContracts = allContracts.filter(c => c.customer_id === customer.id);
          const grouped: Record<string, any[]> = {};
          cContracts.forEach((c: any) => {
            if (!grouped[c.contract_number]) grouped[c.contract_number] = [];
            grouped[c.contract_number].push(c);
          });

          const consolidatedContracts: any[] = [];
          Object.values(grouped).forEach(group => {
            const bdr = group.find((c: any) => c.source_system === 'BDR');
            const cordel = group.find((c: any) => c.source_system === 'CORDEL');
            const base = cordel || bdr || group[0];
            
            let discrepancyType = null;
            if (bdr && cordel) {
              if (bdr.status !== cordel.status || Number(bdr.outstanding_balance) !== Number(cordel.outstanding_balance)) {
                discrepancyType = base.fund === 'Alcar' ? 'PARCELA ISOLADA' : 'DIVERGENTE';
              } else {
                discrepancyType = 'CONCILIADO';
              }
            } else if (bdr && !cordel) {
              discrepancyType = 'SOMENTE BDR';
            } else if (!bdr && cordel) {
              discrepancyType = 'SOMENTE CORDEL';
            }
            
            consolidatedContracts.push({
              ...base,
              discrepancyType,
              status: discrepancyType === 'DIVERGENTE' ? 'Divergente' : base.status
            });
          });

          const filteredContracts = fundFilter === 'Todos' ? consolidatedContracts : consolidatedContracts.filter(c => c.fund === fundFilter);
          if (filteredContracts.length === 0) return null;
          const isAtivo = filteredContracts.some(c => c.status !== 'Regular' && c.status !== 'Quitado');
          if (!isAtivo) return null;

          return { ...customer, contracts: filteredContracts };
        }).filter(Boolean);

        setCustomers(consolidatedCustomers);

        if (!searchTerm.trim()) {
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: consolidatedCustomers }));
          } catch (_) {}
        }
      } catch (e: any) {
        console.error('Erro ao buscar clientes:', e);
        setProgressMsg(`Erro: ${e.message}`);
      } finally {
        setLoading(false);
        setProgressMsg('');
      }
    }
    
    const timeoutId = setTimeout(() => {
      fetchCustomers();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [profile, searchTerm, fundFilter, operatorFilter]);

  const [displayLimit, setDisplayLimit] = useState(100);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 10;
    if (bottom) {
      setDisplayLimit(prev => prev + 100);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '1.5rem', paddingRight: '2rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0 }}>
        <h1>Central de Clientes</h1>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select 
              className="input-field" 
              value={fundFilter}
              onChange={(e) => setFundFilter(e.target.value as any)}
              style={{ minWidth: '150px' }}
            >
              <option value="Todos">Todos os Fundos</option>
              <option value="Alcar">Fundo Alcar</option>
              <option value="Alpha">Fundo Alpha</option>
            </select>
            
            {profile?.role === 'ADMIN' && (
              <select 
                className="input-field" 
                value={operatorFilter}
                onChange={(e) => setOperatorFilter(e.target.value)}
                style={{ minWidth: '160px' }}
              >
                <option value="Todos">Todos os Clientes</option>
                <option value="SemDono">Sem Dono Definido</option>
                {operatorsList.map(op => (
                  <option key={op.id} value={op.id}>@{op.username}</option>
                ))}
              </select>
            )}

            <button 
              className="btn-secondary"
              onClick={() => {
                sessionStorage.removeItem(`customers_list_v1_${profile?.id}_${fundFilter}_${operatorFilter}`);
                setSearchTerm(searchTerm + ' ');
                setTimeout(() => setSearchTerm(searchTerm.trim()), 100);
              }}
              title="Forçar atualização dos dados"
              style={{ padding: '0.65rem' }}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          
          {(loading || progressMsg) && (
            <div style={{ 
              background: 'rgba(59, 130, 246, 0.1)', 
              color: '#3b82f6', 
              border: '1px solid rgba(59, 130, 246, 0.3)', 
              padding: '0.5rem 1rem', 
              borderRadius: '8px', 
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span className="spinner" style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></span>
              {progressMsg || 'Buscando...'}
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <input 
              type="text" 
              placeholder="Pesquisar Nome ou CPF..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field"
              style={{ width: '300px', paddingLeft: '2.5rem', borderRadius: '8px' }}
            />
          </div>

          <div style={{ display: 'flex', background: '#e5e7eb', padding: '0.25rem', borderRadius: '8px' }}>
            <button 
              onClick={() => setViewMode('kanban')}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', 
                background: viewMode === 'kanban' ? '#ffffff' : 'transparent',
                color: viewMode === 'kanban' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s'
              }}
            >
              <LayoutDashboard size={18} /> Kanban (CRM)
            </button>
            <button 
              onClick={() => setViewMode('list')}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', 
                background: viewMode === 'list' ? '#ffffff' : 'transparent',
                color: viewMode === 'list' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s'
              }}
            >
              <List size={18} /> Lista Clássica
            </button>
          </div>
        </div>
      </div>
      
      {/* Área de Visualização */}
      {viewMode === 'kanban' ? (
        <KanbanBoard rawData={customers} onRefresh={() => setSearchTerm(searchTerm + ' ')} />
      ) : (
        <div 
          className="glass-card" 
          onScroll={handleScroll}
          style={{ padding: '0', overflow: 'auto', flex: 1 }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '1rem' }}>CPF</th>
                <th style={{ padding: '1rem' }}>Nome Completo</th>
                <th style={{ padding: '1rem' }}>Vínculos (Empresas e Contratos)</th>
              </tr>
            </thead>
            <tbody>
              {customers.slice(0, displayLimit).map(customer => (
                <tr 
                  key={customer.id} 
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'background 0.2s' }}
                  onClick={() => navigate(`/customer/${customer.cpf}`)}
                  onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '1rem' }}>{customer.cpf}</td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ fontWeight: 500 }}>{customer.full_name}</div>
                    {customer.profiles ? (
                      <div className="text-muted mt-1" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ color: 'var(--color-primary)' }}>@{customer.profiles.username}</span>
                      </div>
                    ) : (
                      <div className="text-muted mt-1" style={{ fontSize: '0.75rem', color: '#f59e0b' }}>Sem dono</div>
                    )}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    {customer.contracts && customer.contracts.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {customer.contracts.map((contract: any) => (
                          <div className="tip-wrap" key={contract.id}>
                            <button 
                              className={`tip-btn ${contract.status === 'Regular' || contract.status === 'Quitado' ? 'tip-btn--alt' : 'tip-btn--warn'}`}
                              style={{ 
                                padding: '6px 12px', 
                                fontSize: '0.75rem',
                                color: 'var(--color-text)',
                                cursor: 'default'
                              }}
                              data-tip={`${contract.companies?.razao_social || contract.metadata?.empresa || contract.metadata?.fonte_pagadora || 'Desconhecido'} - R$ ${contract.contracted_amount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                            >
                              {contract.contract_number}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.85rem' }}>Sem contratos</span>
                    )}
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Nenhum cliente cadastrado no banco de dados ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
};
