import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const CompaniesList = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<any[]>([]);

  useEffect(() => {
    async function fetchCompanies() {
      if (!profile) return;

      if (profile.role === 'ADMIN') {
        const { data } = await supabase.from('companies').select('*');
        if (data) setCompanies(data);
      } else {
        // Para usuario normal, pegar contratos e filtrar as empresas unicas
        const { data: contractsData } = await supabase
          .from('contracts')
          .select(`company_id, customers!inner(owner_id)`)
          .eq('customers.owner_id', profile.id);

        if (contractsData && contractsData.length > 0) {
          const companyIds = [...new Set(contractsData.map(c => c.company_id))];
          const { data: companiesData } = await supabase
            .from('companies')
            .select('*')
            .in('id', companyIds);
            
          if (companiesData) setCompanies(companiesData);
        } else {
          setCompanies([]);
        }
      }
    }
    
    fetchCompanies();
  }, [profile]);

  return (
    <div>
      <h1 className="mb-4">Empresas (Entidades)</h1>
      
      <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '1rem' }}>CNPJ</th>
              <th style={{ padding: '1rem' }}>Razão Social</th>
              <th style={{ padding: '1rem' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {companies.map(company => (
              <tr 
                key={company.id} 
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'background 0.2s' }}
                onClick={() => navigate(`/company/${company.id}`)}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{company.cnpj}</td>
                <td style={{ padding: '1rem', fontWeight: 500 }}>{company.razao_social}</td>
                <td style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Ver todos os clientes associados
                </td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  Nenhuma empresa encontrada para a sua carteira.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
