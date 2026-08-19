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
    atendimentoValue: 0,
    naoContactadoValue: 0,
    naoRespondeuValue: 0,
    inviavelValue: 0,
    numeroIncorretoValue: 0
  });

  const [statusData, setStatusData] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [fundFilter, setFundFilter] = useState<'Todos' | 'Alcar' | 'Alpha' | 'Cordel'>('Todos');

  useEffect(() => {
    async function fetchStats() {
      if (!profile) return;
      setErrorMsg('');

      // Cache de 5 minutos no sessionStorage para evitar recarregar toda navegação
      const CACHE_KEY = `dashboard_stats_v4_${profile.id}_${fundFilter}`;
      const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { ts, stats: cachedStats, pie } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL) {
            setStats(cachedStats);
            setStatusData(pie);
            return;
          }
        }
      } catch (_) {}

      // Busca direto nos contratos relevantes — sem loop de páginas de customers
      // Removemos o filtro de status e fundos do banco para podermos cruzar as planilhas
      // na memória. BDR tem as parcelas, Cordel tem o valor isolado. Precisamos de ambos!
      let contractsQuery = supabase
        .from('contracts')
        .select('customer_id, outstanding_balance, status, source_system, contract_number, due_date, metadata, fund');

      // Filtro por carteira se não for ADMIN
      let allData: any[] = [];
      if (profile.role !== 'ADMIN') {
        const { data: myCusts } = await supabase
          .from('customers')
          .select('id')
          .or(`owner_id.eq.${profile.id},owner_id.is.null`);
        const ids = (myCusts || []).map((c: any) => c.id);
        if (ids.length === 0) return;
        contractsQuery = contractsQuery.in('customer_id', ids);
      }

      // Busca contratos + histórico em paralelo
      const [contractsRes, historyRes] = await Promise.all([
        contractsQuery,
        supabase.from('collection_history')
          .select('customer_id, phase, created_at')
          .order('created_at', { ascending: false })
      ]);

      if (contractsRes.error) { setErrorMsg(contractsRes.error.message); return; }
      if (historyRes.error)   { setErrorMsg(historyRes.error.message); return; }

      const contractsData = contractsRes.data || [];
      const historyData   = historyRes.data || [];

      // Agrupa contratos por customer_id
      const customerMap: Record<string, any> = {};
      contractsData.forEach((c: any) => {
        if (!customerMap[c.customer_id]) customerMap[c.customer_id] = { id: c.customer_id, contracts: [], collection_history: [] };
        customerMap[c.customer_id].contracts.push(c);
      });
      historyData.forEach((h: any) => {
        if (customerMap[h.customer_id]) customerMap[h.customer_id].collection_history.push(h);
      });
      allData = Object.values(customerMap);

      if (allData.length > 0) {
        let totalContractsNum = 0;
        let contracted = 0;
        let balance = 0;
        
        let statusMap: Record<string, number> = {};
        const now = new Date();

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
                const bdr = group.find(c => c.source_system === 'BDR');
                const cordel = group.find(c => c.source_system === 'CORDEL');
                
                // APLICAÇÃO DO FILTRO (Em memória, pois já temos BDR + Cordel juntos)
                if (fundFilter === 'Cordel' && !cordel) return;
                if (fundFilter === 'Alcar' && !group.some(c => c.fund === 'Alcar')) return;
                if (fundFilter === 'Alpha' && !group.some(c => c.fund === 'Alpha')) return;

                // PRIORIDADE PARA BDR: O BDR sempre tem a dívida inteira (total)
                const base = bdr || cordel || group[0];
                
                const statusStr = String(base.status).toLowerCase();
                let valAberto = 0;

                // CÁLCULO INTELIGENTE DO CORDEL:
                // O Cordel manda apenas o valor da parcela. Se estamos filtrando pelo Cordel
                // e o usuário quer ver os valores reais multiplicados pelas parcelas (do BDR):
                if (fundFilter === 'Cordel' && cordel) {
                   const meta = (bdr && bdr.metadata) || {};
                   let qtdParcelas = parseInt((bdr && bdr.total_installments) || meta.n_parcelas_lastro || meta.pz_total || 1, 10);
                   if (isNaN(qtdParcelas) || qtdParcelas <= 0) qtdParcelas = 1;
                   
                   valAberto = Number(cordel.outstanding_balance) * qtdParcelas;
                } else {
                   // Para BDR (Alcar/Alpha) ou padrão, usa o valor total do BDR que já vem certo
                   valAberto = Number(base.outstanding_balance) || 0;
                }
                
                // Determinar a data de vencimento real (campo direto ou Excel serial do BDR)
                let dueDate: Date | null = null;
                if (base.due_date && new Date(base.due_date).getFullYear() > 1970) {
                   dueDate = new Date(base.due_date);
                } else if (base.metadata) {
                   const excelSerial = base.metadata['dt_venc_origem'] || base.metadata['dt_venc_ajustado'] || base.metadata['DT VENC ORIGEM'] || base.metadata['DT VENC AJUSTADO'];
                   if (excelSerial && !isNaN(Number(excelSerial)) && Number(excelSerial) > 30000 && Number(excelSerial) < 60000) {
                      const days = Math.floor(Number(excelSerial) - 25569);
                      dueDate = new Date(days * 86400 * 1000);
                   }
                }
                
                const isVencido = dueDate && dueDate < now;
                const isQuitado = statusStr === 'quitado';
                
                // Só entra no dashboard se está VENCIDO pela data e NÃO foi quitado
                if (isVencido && !isQuitado) {
                   totalContractsNum++;
                   custBalance += valAberto;
                   custContracted += valAberto;
                }
              });
           }

           contracted += custContracted;
           balance += custBalance;

           const valueForPie = custBalance;
           if (valueForPie > 0) {
              statusMap[overallStatus] = (statusMap[overallStatus] || 0) + valueForPie;
           }
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
          naoContactadoValue: statusMap['Novos / Inicial'] || 0,
          naoRespondeuValue: statusMap['Não Respondeu'] || 0,
          inviavelValue: statusMap['Inviável'] || 0,
          numeroIncorretoValue: statusMap['Número Incorreto'] || 0,
          divergentVolume: 0
        });

        const pieData = [];
        if (statusMap['Novos / Inicial'])    pieData.push({ name: 'Não Contactado',  value: statusMap['Novos / Inicial'],    color: '#6366f1' });
        if (statusMap['Em Atendimento'])     pieData.push({ name: 'Em Atendimento',  value: statusMap['Em Atendimento'],     color: '#3b82f6' });
        if (statusMap['Negociando'])         pieData.push({ name: 'Negociando',      value: statusMap['Negociando'],         color: '#f59e0b' });
        if (statusMap['Promessa'])           pieData.push({ name: 'Promessa',        value: statusMap['Promessa'],           color: '#8b5cf6' });
        if (statusMap['Pagamento Realizado'])pieData.push({ name: 'Recuperado',      value: statusMap['Pagamento Realizado'],color: '#10b981' });
        if (statusMap['Não Respondeu'])      pieData.push({ name: 'Não Respondeu',   value: statusMap['Não Respondeu'],      color: '#94a3b8' });
        if (statusMap['Inviável'])           pieData.push({ name: 'Inviável',        value: statusMap['Inviável'],           color: '#ef4444' });
        if (statusMap['Número Incorreto'])   pieData.push({ name: 'Num. Incorreto',  value: statusMap['Número Incorreto'],   color: '#fb7185' });

        setStatusData(pieData);

        // Salva no cache por 5 minutos
        try {
          const CACHE_KEY = `dashboard_stats_v4_${profile.id}_${fundFilter}`; // v4 para invalidar cache antigo automaticamente
          const newStats = {
            totalContracts: totalContractsNum, totalContracted: contracted, totalBalance: balance,
            totalRecovered: statusMap['Pagamento Realizado'] || 0, alerts: 0, promisesCount: 0,
            promisesValue: statusMap['Promessa'] || 0, negociandoValue: statusMap['Negociando'] || 0,
            atendimentoValue: statusMap['Em Atendimento'] || 0, divergentVolume: 0,
            naoContactadoValue: statusMap['Novos / Inicial'] || 0,
            naoRespondeuValue: statusMap['Não Respondeu'] || 0,
            inviavelValue: statusMap['Inviável'] || 0,
            numeroIncorretoValue: statusMap['Número Incorreto'] || 0
          };
          sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), stats: newStats, pie: pieData }));
        } catch (_) {}
      }
    }

    fetchStats();
  }, [profile, fundFilter]);

  const barData = [
    {
      name: 'Situação Global',
      'Não Contactado': stats.naoContactadoValue,
      'Não Respondeu': stats.naoRespondeuValue,
      'Em Atendimento': stats.atendimentoValue,
      'Negociando': stats.negociandoValue,
      'Promessas': stats.promisesValue,
      'Inviável': stats.inviavelValue,
      'Núm. Incorreto': stats.numeroIncorretoValue,
      'Valor Recuperado': stats.totalRecovered
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ margin: 0 }}>Inteligência Financeira</h1>
          {errorMsg && (
            <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.5rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
              Erro ao buscar dados: {errorMsg}
            </div>
          )}
        </div>
        
        <div>
          <select 
            className="input-field" 
            value={fundFilter}
            onChange={(e) => setFundFilter(e.target.value as any)}
            style={{ minWidth: '150px' }}
          >
            <option value="Todos">Todos os Fundos</option>
            <option value="Alcar">Fundo Alcar</option>
            <option value="Alpha">Fundo Alpha</option>
            <option value="Cordel">Planilha Cordel</option>
          </select>
        </div>
      </div>
      
      {/* KPIs Principais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        
        <div className="glass-card" style={{ borderBottom: '4px solid #fca5a5' }}>
          <div className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>Carteira Vencida</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#ef4444' }}>
            R$ {stats.totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="glass-card" style={{ borderBottom: '4px solid #6366f1' }}>
          <div className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>Não Contactado</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#6366f1' }}>
            R$ {stats.naoContactadoValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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

        <div className="glass-card" style={{ borderBottom: '4px solid #94a3b8' }}>
          <div className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>Não Respondeu</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#94a3b8' }}>
            R$ {stats.naoRespondeuValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="glass-card" style={{ borderBottom: '4px solid #ef4444' }}>
          <div className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>Inviável</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#ef4444' }}>
            R$ {stats.inviavelValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="glass-card" style={{ borderBottom: '4px solid #fb7185' }}>
          <div className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>Núm. Incorreto</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#fb7185' }}>
            R$ {stats.numeroIncorretoValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="glass-card" style={{ borderBottom: '4px solid #10b981' }}>
          <div className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>Valor Recuperado</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#10b981' }}>
            R$ {stats.totalRecovered.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
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
                <Bar dataKey="Não Contactado" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Não Respondeu" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Em Atendimento" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Negociando" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Promessas" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Inviável" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Núm. Incorreto" fill="#fb7185" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Valor Recuperado" fill="#10b981" radius={[4, 4, 0, 0]} />
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
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Carteira Vencida</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                R$ {(stats.totalBalance / 1000000).toFixed(1)}M
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
