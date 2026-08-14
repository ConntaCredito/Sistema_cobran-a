import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabase';
import { ArrowLeft, Building2 } from 'lucide-react';

export const CompanyDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCompanyData() {
      if (!id) return;
      setLoading(true);

      // 1. Fetch Company
      const { data: compData } = await supabase.from('companies').select('*').eq('id', id).single();
      if (compData) setCompany(compData);

      // 2. Fetch all contracts for this company to get the unique customers
      const { data: contractsData } = await supabase
        .from('contracts')
        .select(`
          outstanding_balance, contracted_amount, status, contract_number,
          customers (
            id, cpf, full_name, owner_id,
            profiles (username)
          )
        `)
        .eq('company_id', id);

      if (contractsData) {
        // Group contracts by customer
        const custMap: Record<string, any> = {};
        
        contractsData.forEach((c: any) => {
          if (!c.customers) return;
          const cust = c.customers;
          if (!custMap[cust.id]) {
            custMap[cust.id] = {
              ...cust,
              contracts: [],
              totalDebt: 0
            };
          }
          custMap[cust.id].contracts.push(c);
          custMap[cust.id].totalDebt += Number(c.outstanding_balance) || 0;
        });

        setCustomers(Object.values(custMap));
      }
      setLoading(false);
    }
    fetchCompanyData();
  }, [id]);

  if (loading) {
    return (
      <div>
        <button className="btn-secondary mb-4" onClick={() => navigate(-1)}><ArrowLeft size={18} /> Voltar</button>
        <p>Carregando carteira da empresa...</p>
      </div>
    );
  }

  if (!company) {
    return (
      <div>
        <button className="btn-secondary mb-4" onClick={() => navigate(-1)}><ArrowLeft size={18} /> Voltar</button>
        <p>Empresa não encontrada.</p>
      </div>
    );
  }

  return (
    <div>
      <button className="btn-secondary mb-4" onClick={() => navigate('/companies')}><ArrowLeft size={18} /> Voltar para Empresas</button>
      
      <div className="glass-card mb-4" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1.5rem' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.2)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Building2 size={32} className="text-primary" />
        </div>
        <div>
          <h2 style={{ marginBottom: '0.25rem' }}>{company.razao_social}</h2>
          <p className="text-muted" style={{ margin: 0, fontFamily: 'monospace' }}>CNPJ: {company.cnpj}</p>
        </div>
      </div>

      <h3 className="mb-4">Clientes Associados ({customers.length})</h3>

      <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '1rem' }}>CPF</th>
              <th style={{ padding: '1rem' }}>Nome Completo</th>
              <th style={{ padding: '1rem' }}>Contratos nesta Empresa</th>
              <th style={{ padding: '1rem' }}>Dívida Total (Empresa)</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer: any) => (
              <tr 
                key={customer.id} 
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'background 0.2s' }}
                onClick={() => navigate(`/customer/${customer.cpf}`)}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '1rem' }}>{customer.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}</td>
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
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {customer.contracts.map((contract: any, idx: number) => (
                      <span key={idx} style={{ 
                        fontSize: '0.75rem', 
                        padding: '0.2rem 0.5rem', 
                        background: 'rgba(255,255,255,0.1)', 
                        borderRadius: '4px',
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}>
                        {contract.contract_number} ({contract.status})
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--color-danger)' }}>
                  R$ {customer.totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  Nenhum cliente associado a esta empresa.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
