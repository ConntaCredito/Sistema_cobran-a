import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { supabase } from '../services/supabase';

export const Search = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const searchTerm = query.trim();
    if (!searchTerm) return;
    
    setLoading(true);
    setError('');

    const onlyNumbers = searchTerm.replace(/\D/g, '');
    let cpfQuery = `cpf.eq.${searchTerm}`;
    if (onlyNumbers.length > 0) {
      cpfQuery += `,cpf.eq.${onlyNumbers}`;
    }

    // 1. Tentar buscar direto pelo CPF na tabela customers
    const { data: customerData } = await supabase
      .from('customers')
      .select('cpf')
      .or(cpfQuery)
      .limit(1)
      .maybeSingle();

    if (customerData) {
      setLoading(false);
      navigate(`/customer/${customerData.cpf}`);
      return;
    }

    // 2. Tentar buscar pelo número do contrato na tabela contracts
    const { data: contractData } = await supabase
      .from('contracts')
      .select('customer_id')
      .eq('contract_number', searchTerm)
      .maybeSingle();

    if (contractData) {
      // Pegar o CPF do cliente dono deste contrato
      const { data: custByContract } = await supabase
        .from('customers')
        .select('cpf')
        .eq('id', contractData.customer_id)
        .single();
        
      if (custByContract) {
        setLoading(false);
        navigate(`/customer/${custByContract.cpf}`);
        return;
      }
    }

    setLoading(false);
    setError('Nenhum cliente ou contrato encontrado com esse termo.');
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '2rem' }}>
      <h1 className="mb-4">Consultar Cliente ou Contrato</h1>
      
      <div className="glass-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <h3 className="mb-2">Localizar Ficha Consolidada</h3>
        <p className="text-muted mb-4" style={{ fontSize: '0.9rem' }}>
          Digite o <strong>CPF</strong> ou o <strong>Número do Contrato</strong> para buscar as informações.
        </p>
        
        {error && (
          <div className="mb-4" style={{ color: 'var(--color-danger)', fontSize: '0.9rem', padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '4px' }}>
            {error}
          </div>
        )}
        
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem' }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Ex: 111.111.111-11 ou CT-2023-0001" 
            style={{ flex: 1 }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            <SearchIcon size={20} /> {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </form>
      </div>
    </div>
  );
};
