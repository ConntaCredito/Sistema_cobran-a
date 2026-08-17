import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { useAuth } from '../contexts/AuthContext';

export const Dashboard = () => {
  const { profile } = useAuth();
  
  const [stats, setStats] = useState({
    totalContracts: 0,
    totalContracted: 0,
    totalBalance: 0,
    totalRecovered: 0,
    alerts: 0,
    promisesCount: 0,
    promisesValue: 0,
    divergentVolume: 0,
    negociandoValue: 0,
    atendimentoValue: 0
  });

  const [statusData, setStatusData] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function fetchStats() {
      if (!profile) return;
      setErrorMsg('');
      
      let allData: any[] = [];
      let from = 0;
      const limit = 150;
      let hasMore = true;

      while (hasMore) {
        const to = from + limit - 1;
        let query = supabase.from('customers').select('id, owner_id').range(from, to);
        
        if (profile.role !== 'ADMIN') {
          query = query.or(`owner_id.eq.${profile.id},owner_id.is.null`);
        }

        const { data: custData, error: custErr } = await query;
        
        if (custErr) {
          console.error("Erro ao buscar stats:", custErr);
          setErrorMsg(custErr.message);
          break;
        }

        if (custData && custData.length > 0) {
          try {
            const customerIds = custData.map(c => c.id);
            
            const [contractsRes, historyRes] = await Promise.all([
              supabase.from('contracts').select('customer_id, contracted_amount, outstanding_balance, status, source_system, contract_number').in('customer_id', customerIds),
              supabase.from('collection_history').select('customer_id, phase, created_at').in('customer_id', customerIds)
            ]);
            
            if (contractsRes.error) throw contractsRes.error;
            if (historyRes.error) throw historyRes.error;
            
            const contractsData = contractsRes.data;
            const historyData = historyRes.data;
            
            const mergedData = custData.map(c => ({
              ...c,
              contracts: contractsData?.filter(ct => ct.customer_id === c.id) || [],
              collection_history: historyData?.filter(h => h.customer_id === c.id) || []
            }));
            
            allData = [...allData, ...mergedData];
            if (custData.length < limit) {
              hasMore = false;
            } else {
              from += limit;
            }
          } catch (e: any) {
            console.error("Erro no Promise.all:", e);
            setErrorMsg(e.message);
            hasMore = false;
            break;
          }
        } else {
          hasMore = false;
        }
      }
      
      if (allData.length > 0) {
        let totalContractsNum = 0;
        let contracted = 0;
        let balance = 0;
        
        let statusMap: Record<string, number> = {};

        allData.forEach((customer: any) => {
           let overallStatus = 'Novos / Inicial';
           if (customer.collection_history && customer.collection_history.length > 0) {
              const sortedHistory = customer.collection_history.sort((a: any, b: any) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              );
              const latestPhase = sortedHistory[0].phase;
              if (latestPhase === 'Não respondeu') overallStatus = 'Não Respondeu';
              else if (latestPhase === 'Em atendimento') overallStatus = 'Em Atendimento';
              else if (latestPhase === 'Tem interesse de regularizar, negociando') overallStatus = 'Negociando';
              else if (latestPhase === 'Promessa de Pagamento') overallStatus = 'Promessa';
              else if (latestPhase === 'Pagamento realizado') overallStatus = 'Pagamento Realizado';
              else if (latestPhase === 'Número incorreto') overallStatus = 'Número Incorreto';
              else if (latestPhase === 'Sem condições de pagamento/sem previsão' || latestPhase === 'Pagamento não realizado') overallStatus = 'Inviável';
              else if (latestPhase) overallStatus = latestPhase;
           }

           // Retro-compatibilidade: Se o contrato foi marcado manualmente antes da automação existir
           if (customer.contracts && customer.contracts.length > 0) {
              const hasQuitado = customer.contracts.some((c: any) => c.status === 'Quitado');
              const hasPromessa = customer.contracts.some((c: any) => c.status === 'Promessa de Pagamento');
              
              if (hasQuitado && overallStatus !== 'Pagamento Realizado') {
                  overallStatus = 'Pagamento Realizado';
              } else if (hasPromessa && overallStatus !== 'Pagamento Realizado' && overallStatus !== 'Promessa') {
                  overallStatus = 'Promessa';
              }
           }

           let custContracted = 0;
           let custBalance = 0;
           
           if (customer.contracts && customer.contracts.length > 0) {
              const grouped: Record<string, any[]> = {};
              customer.contracts.forEach((c: any) => {
                if (!grouped[c.contract_number]) grouped[c.contract_number] = [];
                grouped[c.contract_number].push(c);
              });
              
              Object.values(grouped).forEach(group => {
                totalContractsNum++;
                const bdr = group.find(c => c.source_system === 'BDR');
                const cordel = group.find(c => c.source_system === 'CORDEL');
                const base = cordel || bdr || group[0];
                
                const valContratado = Number(base.contracted_amount) || 0;
                const valAberto = Number(base.outstanding_balance) || 0;
                
                custContracted += valContratado;
                
                const statusStr = String(base.status).toLowerCase();
                if (statusStr !== 'quitado' && statusStr !== 'regular') {
                   custBalance += valAberto;
                }
              });
           }

           contracted += custContracted;
           balance += custBalance;

           const valueForPie = overallStatus === 'Pagamento Realizado' ? custContracted : custBalance;
           statusMap[overallStatus] = (statusMap[overallStatus] || 0) + valueForPie;
        });

        setStats({
          totalContracts: totalContractsNum,
          totalContracted: contracted,
          totalBalance: balance,
          totalRecovered: statusMap['Pagamento Realizado'] || 0,
          alerts: 0,
          promisesCount: 0,
          promisesValue: statusMap['Promessa'] || 0,
          negociandoValue: statusMap['Negociando'] || 0,
          atendimentoValue: statusMap['Em Atendimento'] || 0,
          divergentVolume: 0
        });

        const pieData = [];
        if (statusMap['Em Atendimento']) pieData.push({ name: 'Em Atendimento', value: statusMap['Em Atendimento'], color: '#3b82f6' });
        if (statusMap['Negociando']) pieData.push({ name: 'Negociando', value: statusMap['Negociando'], color: '#f59e0b' });
        if (statusMap['Promessa']) pieData.push({ name: 'Promessa', value: statusMap['Promessa'], color: '#8b5cf6' });
        if (statusMap['Pagamento Realizado']) pieData.push({ name: 'Recuperado', value: statusMap['Pagamento Realizado'], color: '#10b981' });
        if (statusMap['Não Respondeu']) pieData.push({ name: 'Não Respondeu', value: statusMap['Não Respondeu'], color: '#94a3b8' });
        if (statusMap['Número Incorreto']) pieData.push({ name: 'Número Incorreto', value: statusMap['Número Incorreto'], color: '#fb7185' });
        if (statusMap['Inviável']) pieData.push({ name: 'Inviável', value: statusMap['Inviável'], color: '#ef4444' });

        setStatusData(pieData);
      }
    }

    fetchStats();
  }, [profile]);

  const barData = [
    {
      name: 'Situação Global',
      'Valor Recuperado': stats.totalRecovered,
      'Promessas': stats.promisesValue,
      'Valor em Aberto': stats.totalBalance
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>Inteligência Financeira</h1>
        {errorMsg && (
          <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
            Erro ao buscar dados: {errorMsg}
          </div>
        )}
      </div>
      
      {/* KPIs Principais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        <div className="glass-card" style={{ borderBottom: '4px solid #86efac' }}>
          <div className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>Valor Recuperado</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#10b981' }}>
            R$ {stats.totalRecovered.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="glass-card" style={{ borderBottom: '4px solid #fca5a5' }}>
          <div className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>Valor em Aberto</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#ef4444' }}>
            R$ {stats.totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="glass-card" style={{ borderBottom: '4px solid #3b82f6' }}>
          <div className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>Em Atendimento</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#3b82f6' }}>
            R$ {stats.atendimentoValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="glass-card" style={{ borderBottom: '4px solid #f59e0b' }}>
          <div className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>Negociando</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#f59e0b' }}>
            R$ {stats.negociandoValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="glass-card" style={{ borderBottom: '4px solid #8b5cf6' }}>
          <div className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>Promessas</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#8b5cf6' }}>
            R$ {stats.promisesValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

      </div>

      {/* Área de Gráficos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        
        {/* Gráfico de Barras - Recuperação */}
        <div className="glass-card" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
          <h3 className="mb-4" style={{ fontSize: '1.1rem' }}>Evolução de Recuperação</h3>
          <div style={{ flex: 1, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" tickFormatter={(value) => `R$ ${(value/1000)}k`} />
                <Tooltip 
                  cursor={{fill: 'rgba(255,255,255,0.02)'}} 
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  formatter={(value: any) => `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                />
                <Legend />
                <Bar dataKey="Valor Recuperado" fill="#86efac" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Promessas" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Valor em Aberto" fill="#fca5a5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Donut - Status da Carteira */}
        <div className="glass-card" style={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
          <h3 className="mb-4" style={{ fontSize: '1.1rem' }}>Composição da Carteira</h3>
          <div style={{ flex: 1, width: '100%', position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={statusData.length > 1 ? 5 : 0}
                  dataKey="value"
                  stroke="none"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                  formatter={(value: any) => `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                />
                <Legend layout="vertical" verticalAlign="middle" align="right" />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Texto central do Donut */}
            <div style={{ position: 'absolute', top: '50%', left: '38%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Volume Carteira</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                R$ {(stats.totalContracted / 1000000).toFixed(1)}M
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
