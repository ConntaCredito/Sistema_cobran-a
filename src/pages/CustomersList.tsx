import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';
import { KanbanBoard } from '../components/KanbanBoard';
import { List, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const CustomersList = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  useEffect(() => {
    async function fetchCustomers() {
      if (!profile) return;
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
            const customerIds = custData.map(c => c.id);
            
            const [contractsRes, historyRes] = await Promise.all([
              supabase.from('contracts').select('customer_id, id, contract_number, status, contracted_amount, outstanding_balance, source_system, due_date, dismissal_date, metadata, companies ( razao_social )').in('customer_id', customerIds),
              supabase.from('collection_history').select('customer_id, phase, created_at').in('customer_id', customerIds)
            ]);
            
            if (contractsRes.error) throw contractsRes.error;
            if (historyRes.error) throw historyRes.error;
            
            const mergedData = custData.map(c => ({
              ...c,
              contracts: contractsRes.data?.filter(ct => ct.customer_id === c.id) || [],
              collection_history: historyRes.data?.filter(h => h.customer_id === c.id) || []
            }));

            allData = [...allData, ...mergedData];
            page++;
            if (custData.length < pageSize) hasMore = false;
          } else {
            hasMore = false;
          }
        }
      } catch (e: any) {
        console.error('Erro ao buscar clientes:', e);
        setProgressMsg(`Erro: ${e.message}`);
        setLoading(false);
        return;
      }

      setProgressMsg('Processando layout...');

      if (allData.length >= 0) {
        const consolidatedCustomers = allData.map((customer: any) => {
          if (!customer.contracts || customer.contracts.length === 0) return customer;

          const grouped: Record<string, any[]> = {};
          customer.contracts.forEach((c: any) => {
            if (!grouped[c.contract_number]) grouped[c.contract_number] = [];
            grouped[c.contract_number].push(c);
          });

          const consolidatedContracts: any[] = [];
          Object.values(grouped).forEach(group => {
            const bdr = group.find((c: any) => c.source_system === 'BDR');
            const cordel = group.find((c: any) => c.source_system === 'CORDEL');
            const base = cordel || bdr || group[0];

            let isDivergent = false;
            if (bdr && cordel) {
              if (bdr.status !== cordel.status || Number(bdr.outstanding_balance) !== Number(cordel.outstanding_balance)) {
                isDivergent = true;
              }
            }
            consolidatedContracts.push({
              ...base,
              status: isDivergent ? 'Divergente' : base.status
            });
          });

          return { ...customer, contracts: consolidatedContracts };
        });

        setCustomers(consolidatedCustomers);
      }
      setLoading(false);
      setProgressMsg('');
    }
    
    const timeoutId = setTimeout(() => {
      fetchCustomers();
    }, 500); // debounce de 500ms
    
    return () => clearTimeout(timeoutId);
  }, [profile, searchTerm]);

  const [displayLimit, setDisplayLimit] = useState(100);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 10;
    if (bottom) {
      setDisplayLimit(prev => prev + 100);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '1.5rem', paddingRight: '2rem' }}>
      
      {/* Cabeçalho, Busca e Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0 }}>
        <h1>Central de Clientes</h1>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          
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
                              data-tip={`${contract.companies?.razao_social || 'Desconhecido'} - R$ ${contract.contracted_amount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
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
