import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileUp, CheckCircle, Database } from 'lucide-react';
import { supabase } from '../services/supabase';

export const ImportEstoque = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const processImport = async () => {
    if (!file) return;
    setIsProcessing(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet) as any[];

      const totalRows = rows.length;
      let validRows = 0;
      let errors = 0;

      // Inserção em lotes (batching) para melhor performance
      const batchSize = 100;
      for (let i = 0; i < totalRows; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        
        const mappedBatch = batch.map(row => {
          // Tentar encontrar colunas comuns independentemente da capitalização
          const getVal = (keys: string[]) => {
            const foundKey = Object.keys(row).find(k => keys.includes(k.toLowerCase().trim()));
            return foundKey ? String(row[foundKey]) : null;
          };

          const rawCpf = getVal(['cpf', 'cnpj', 'documento', 'doc']);
          const cpf = rawCpf ? rawCpf.replace(/\D/g, '') : null;
          const nome = getVal(['nome', 'nome_cliente', 'cliente', 'razao', 'razao_social']);

          return {
            cpf: cpf,
            nome: nome,
            status: 'Disponível',
            file_name: file.name,
            payload: row
          };
        });

        const { error } = await supabase.from('estoque').insert(mappedBatch);

        if (error) {
          console.error('Erro no lote:', error);
          errors += batch.length;
        } else {
          validRows += batch.length;
        }
      }

      setResult({
        total: totalRows,
        valid: validRows,
        errors: errors,
        fileName: file.name,
      });

    } catch (e) {
      console.error(e);
      alert('Falha crítica na importação do Excel.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="main-content">
      <h1 className="mb-4">Importar Estoque (Base Fria)</h1>
      <p className="text-muted mb-4">Envie planilhas Excel reais (.xlsx, .xls) ou CSV. Os dados serão guardados de forma segura e flexível no Estoque.</p>
      
      <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        
        <div className="glass-card">
          <h2 className="mb-4" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileUp size={24} /> Subir Planilha
          </h2>

          <div className="mb-4" style={{ 
            border: '2px dashed var(--color-border)', 
            padding: '2rem', borderRadius: 'var(--radius-md)', 
            textAlign: 'center', background: 'rgba(0,0,0,0.2)' 
          }}>
            <input 
              type="file" 
              accept=".xlsx, .xls, .csv" 
              onChange={handleFileChange}
              style={{ display: 'none' }}
              id="file-upload"
            />
            <label htmlFor="file-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <Upload size={32} className="text-muted" />
              <span>{file ? file.name : 'Clique para selecionar um arquivo Excel (.xlsx)'}</span>
              {!file && <span className="text-muted" style={{ fontSize: '0.8rem' }}>ou arraste e solte aqui</span>}
            </label>
          </div>

          <button 
            className="btn-primary" 
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={!file || isProcessing}
            onClick={processImport}
          >
            {isProcessing ? 'Lendo Excel e Gravando no Estoque...' : 'Iniciar Importação de Estoque'}
          </button>
        </div>

        {result && (
          <div className="glass-card" style={{ borderLeft: '4px solid var(--color-success)' }}>
            <h2 className="mb-4 text-success" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={24} /> Relatório de Carga
            </h2>
            
            <div className="mb-4">
              <p className="text-muted" style={{ fontSize: '0.9rem' }}>Arquivo: <strong style={{ color: '#fff' }}>{result.fileName}</strong></p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '0.5rem' }}>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>Registros Lidos</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{result.total}</div>
              </div>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--color-success)', padding: '1rem', borderRadius: '0.5rem' }}>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>Enviados ao Estoque</div>
                <div className="text-success" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{result.valid}</div>
              </div>
              {result.errors > 0 && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-danger)', padding: '1rem', borderRadius: '0.5rem' }}>
                  <div className="text-muted" style={{ fontSize: '0.8rem' }}>Falhas</div>
                  <div className="text-danger" style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{result.errors}</div>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                <Database size={16} /> 
                Os dados foram armazenados de forma flexível na base apartada (Estoque).
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
