import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const ContractsList = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [contracts, setContracts] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function fetchContracts() {
      if (!profile) return;
      
      let query = supabase.from('contracts').select(`
        id, contract_number, source_system, contracted_amount, outstanding_balance, status,
        customers!inner (cpf, full_name, owner_id)
      `);

      if (profile.role !== 'ADMIN') {
        query = query.eq('customers.owner_id', profile.id);
      }

      const { data } = await query;
      if (data) setContracts(data);
    }
    fetchContracts();
  }, [profile]);

  const filteredContracts = contracts.filter(contract => 
    contract.contract_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Carteira de Contratos</h1>
        
        <div style={{ position: 'relative', width: '300px' }}>
          <input 
            type="text" 
            placeholder="Buscar por Nº do Contrato..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '0.75rem 1rem', 
              borderRadius: 'var(--radius-md)', 
              border: '1px solid rgba(255,255,255,0.1)', 
              background: 'rgba(0,0,0,0.2)',
              color: 'var(--color-text)',
              outline: 'none'
            }}
          />
        </div>
      </div>
      
      <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--color-border)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <th style={{ padding: '0.5rem 1rem' }}>Nº Contrato</th>
              <th style={{ padding: '0.5rem 1rem' }}>Cliente</th>
              <th style={{ padding: '0.5rem 1rem' }}>Origem</th>
              <th style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredContracts.map(contract => (
              <tr 
                key={contract.id} 
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'background 0.2s' }}
                onClick={() => navigate(`/customer/${contract.customers.cpf}`)}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '0.6rem 1rem', fontWeight: 500 }}>{contract.contract_number}</td>
                <td style={{ padding: '0.6rem 1rem' }}>
                  {contract.customers?.full_name} <span className="text-muted" style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>({contract.customers?.cpf})</span>
                </td>
                <td style={{ padding: '0.6rem 1rem' }}>{contract.source_system}</td>
                <td style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>
                  <span style={{ 
                    padding: '0.15rem 0.4rem', 
                    borderRadius: '4px', 
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background: contract.status === 'Regular' || contract.status === 'Quitado' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: contract.status === 'Regular' || contract.status === 'Quitado' ? 'var(--color-success)' : 'var(--color-danger)'
                  }}>
                    {contract.status}
                  </span>
                </td>
              </tr>
            ))}
            {filteredContracts.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  {searchQuery ? 'Nenhum contrato encontrado com esse número.' : 'Nenhum contrato cadastrado no banco de dados ainda.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
