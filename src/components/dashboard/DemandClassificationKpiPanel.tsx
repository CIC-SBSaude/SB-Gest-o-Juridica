import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  Download,
  Filter,
  Layers,
  Printer,
  RotateCcw,
} from 'lucide-react';
import { categoryLabel, subcategoryLabel } from '../../services/demandClassificationService';
import { formatDateTime } from '../../utils/date';

export interface RawProcessClassification {
  id: string;
  categoria_demanda?: string | null;
  subcategoria_demanda?: string | null;
  tipo_demanda?: string | null;
  subtipo_demanda?: string | null;
  status_operacional?: string | null;
  status_atual?: string | null;
  arquivado?: boolean;
  company_id?: string | null;
  nivel_risco?: string | null;
  responsabilidade_atual?: string | null;
  created_at: string;
}

export interface CompanyOption {
  id: string;
  nome: string;
}

interface Props {
  processes: RawProcessClassification[];
  companies?: CompanyOption[];
  loading?: boolean;
}

const processCategory = (process: RawProcessClassification) =>
  process.categoria_demanda?.trim()
  || process.tipo_demanda?.trim()
  || 'NAO_CLASSIFICADO';

const processSubcategory = (process: RawProcessClassification) =>
  process.subcategoria_demanda?.trim()
  || process.subtipo_demanda?.trim()
  || 'SEM_SUBCLASSIFICACAO';

const statusText = (value: string) => value.replaceAll('_', ' ');

type StatRow = {
  code: string;
  label: string;
  quantidade: number;
  percentual: number;
  isUnclassified?: boolean;
};

const compactStats = (rows: StatRow[], total: number, maxRows = 6, othersLabel = 'Outras') => {
  if (rows.length <= maxRows) return rows;

  const visible = rows.slice(0, maxRows - 1);
  const hidden = rows.slice(maxRows - 1);
  const hiddenTotal = hidden.reduce((sum, row) => sum + row.quantidade, 0);

  return [
    ...visible,
    {
      code: '__OUTRAS__',
      label: othersLabel,
      quantidade: hiddenTotal,
      percentual: total > 0 ? (hiddenTotal / total) * 100 : 0,
    },
  ];
};

export const DemandClassificationKpiPanel: React.FC<Props> = ({
  processes,
  companies = [],
  loading = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [periodFilter, setPeriodFilter] = useState('ALL');
  const [companyFilter, setCompanyFilter] = useState('ALL');
  const [exportingPng, setExportingPng] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const statuses = useMemo(() => {
    const values = new Set<string>();
    processes.forEach((process) => {
      const status = process.status_operacional || process.status_atual;
      if (status) values.add(status);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [processes]);

  const filteredByGeneral = useMemo(() => {
    const now = new Date();
    return processes.filter((process) => {
      if (statusFilter !== 'ALL') {
        const status = process.status_operacional || process.status_atual;
        if (status !== statusFilter) return false;
      }

      if (companyFilter !== 'ALL' && process.company_id !== companyFilter) return false;

      if (periodFilter !== 'ALL' && process.created_at) {
        const createdAt = new Date(process.created_at);
        if (Number.isNaN(createdAt.getTime())) return false;

        const diffDays = (now.getTime() - createdAt.getTime()) / 86_400_000;
        if (periodFilter === '30D' && diffDays > 30) return false;
        if (periodFilter === '90D' && diffDays > 90) return false;
        if (periodFilter === 'YEAR' && createdAt.getFullYear() !== now.getFullYear()) return false;
      }

      return true;
    });
  }, [processes, statusFilter, companyFilter, periodFilter]);

  const categoryStats = useMemo(() => {
    const counts = new Map<string, number>();
    filteredByGeneral.forEach((process) => {
      const code = processCategory(process);
      counts.set(code, (counts.get(code) || 0) + 1);
    });

    const total = filteredByGeneral.length;
    const list = Array.from(counts.entries())
      .map(([code, quantidade]) => ({
        code,
        label: code === 'NAO_CLASSIFICADO' ? 'Sem classificação' : categoryLabel(code),
        quantidade,
        percentual: total > 0 ? (quantidade / total) * 100 : 0,
      }))
      .sort((a, b) => b.quantidade - a.quantidade || a.label.localeCompare(b.label));

    return { total, list };
  }, [filteredByGeneral]);

  const subcategoryScope = useMemo(() => {
    if (selectedCategory === 'ALL') return filteredByGeneral;
    return filteredByGeneral.filter((process) => processCategory(process) === selectedCategory);
  }, [filteredByGeneral, selectedCategory]);

  const subcategoryStats = useMemo(() => {
    const counts = new Map<string, number>();
    subcategoryScope.forEach((process) => {
      const code = processSubcategory(process);
      counts.set(code, (counts.get(code) || 0) + 1);
    });

    const total = subcategoryScope.length;
    return Array.from(counts.entries())
      .map(([code, quantidade]) => ({
        code,
        label: code === 'SEM_SUBCLASSIFICACAO' ? 'Sem subclassificação' : subcategoryLabel(code),
        quantidade,
        percentual: total > 0 ? (quantidade / total) * 100 : 0,
        isUnclassified: code === 'SEM_SUBCLASSIFICACAO',
      }))
      .sort((a, b) => b.quantidade - a.quantidade || a.label.localeCompare(b.label));
  }, [subcategoryScope]);

  const dataQuality = useMemo(() => {
    const total = subcategoryScope.length;
    const withoutSub = subcategoryStats.find((item) => item.isUnclassified)?.quantidade || 0;
    const withSub = Math.max(0, total - withoutSub);
    return {
      total,
      withSub,
      withoutSub,
      rate: total > 0 ? (withSub / total) * 100 : 0,
    };
  }, [subcategoryScope.length, subcategoryStats]);

  const compactCategoryStats = useMemo(
    () => compactStats(categoryStats.list, categoryStats.total, 6, 'Outras classificações'),
    [categoryStats],
  );

  const compactSubcategoryStats = useMemo(
    () => compactStats(subcategoryStats, subcategoryScope.length, 6, 'Outras subclassificações'),
    [subcategoryStats, subcategoryScope.length],
  );

  const hasFilters = selectedCategory !== 'ALL'
    || statusFilter !== 'ALL'
    || periodFilter !== 'ALL'
    || companyFilter !== 'ALL';

  const resetFilters = () => {
    setSelectedCategory('ALL');
    setStatusFilter('ALL');
    setPeriodFilter('ALL');
    setCompanyFilter('ALL');
  };

  const handlePrint = () => window.print();

  const handleExportPng = async () => {
    setExportingPng(true);
    setExportNotice(null);

    try {
      const width = 1400;
      const padding = 54;
      const headerHeight = 150;
      const rowHeight = 34;
      const maxRows = Math.max(compactCategoryStats.length, compactSubcategoryStats.length, 1);
      const height = headerHeight + 110 + maxRows * rowHeight + 90;
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponível.');
      ctx.scale(scale, scale);

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#E30613';
      ctx.fillRect(0, 0, width, 6);

      ctx.fillStyle = '#0F172A';
      ctx.font = '700 27px Arial';
      ctx.fillText('SB Gestão Jurídica • Perfil das Demandas', padding, 48);
      ctx.fillStyle = '#64748B';
      ctx.font = '13px Arial';
      ctx.fillText(`Emissão: ${formatDateTime(new Date().toISOString())}`, padding, 75);

      const categoryName = selectedCategory === 'ALL' ? 'Todas as classificações' : categoryLabel(selectedCategory);
      const periodName = periodFilter === 'ALL' ? 'Todo o histórico' : periodFilter === '30D' ? 'Últimos 30 dias' : periodFilter === '90D' ? 'Últimos 90 dias' : 'Ano atual';
      ctx.fillText(`Escopo: ${categoryName} • ${periodName} • ${subcategoryScope.length} demandas`, padding, 100);
      ctx.fillText(`Completude de subclassificação: ${dataQuality.rate.toFixed(1).replace('.', ',')}%`, padding, 122);

      const gap = 48;
      const colWidth = (width - padding * 2 - gap) / 2;
      const leftX = padding;
      const rightX = padding + colWidth + gap;
      const topY = 180;

      const drawSection = (
        x: number,
        title: string,
        rows: Array<{ label: string; quantidade: number; percentual: number; isUnclassified?: boolean }>,
      ) => {
        ctx.fillStyle = '#F8FAFC';
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, topY, colWidth, 62 + Math.max(rows.length, 1) * rowHeight, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.font = '700 16px Arial';
        ctx.fillText(title, x + 20, topY + 30);

        if (!rows.length) {
          ctx.fillStyle = '#94A3B8';
          ctx.font = '13px Arial';
          ctx.fillText('Sem dados no período', x + 20, topY + 65);
          return;
        }

        rows.forEach((row, index) => {
          const y = topY + 63 + index * rowHeight;
          const barMax = colWidth - 220;
          const barWidth = Math.max(2, barMax * (Math.min(100, row.percentual) / 100));
          ctx.fillStyle = row.isUnclassified ? '#CBD5E1' : '#E2E8F0';
          ctx.fillRect(x + 20, y + 17, barMax, 7);
          ctx.fillStyle = row.isUnclassified ? '#94A3B8' : '#E30613';
          ctx.fillRect(x + 20, y + 17, barWidth, 7);
          ctx.fillStyle = '#334155';
          ctx.font = '12px Arial';
          const label = row.label.length > 35 ? `${row.label.slice(0, 32)}…` : row.label;
          ctx.fillText(label, x + 20, y + 12);
          ctx.fillStyle = '#0F172A';
          ctx.font = '700 12px Arial';
          ctx.textAlign = 'right';
          ctx.fillText(`${row.quantidade} • ${row.percentual.toFixed(1).replace('.', ',')}%`, x + colWidth - 20, y + 17);
          ctx.textAlign = 'left';
        });
      };

      drawSection(leftX, 'Classificações', compactCategoryStats);
      drawSection(rightX, selectedCategory === 'ALL' ? 'Subclassificações' : `Subclassificações • ${categoryLabel(selectedCategory)}`, compactSubcategoryStats);

      ctx.fillStyle = '#64748B';
      ctx.font = '11px Arial';
      ctx.fillText('As classificações e subclassificações são calculadas dinamicamente a partir da base atual.', padding, height - 34);

      canvas.toBlob((blob) => {
        if (!blob) throw new Error('Falha ao gerar PNG.');
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `perfil-demandas-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      }, 'image/png');

      setExportNotice('PNG do perfil das demandas gerado com sucesso.');
    } catch (error) {
      console.error('[Perfil das Demandas] Falha na exportação PNG', error);
      setExportNotice('Não foi possível gerar o PNG neste navegador.');
    } finally {
      setExportingPng(false);
      window.setTimeout(() => setExportNotice(null), 5000);
    }
  };

  const BarList = ({
    rows,
    selectable = false,
  }: {
    rows: Array<{ code: string; label: string; quantidade: number; percentual: number; isUnclassified?: boolean }>;
    selectable?: boolean;
  }) => (
    <div className="space-y-2">
      {loading ? (
        <div className="py-8 text-center text-xs text-slate-400">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">Sem dados no período.</div>
      ) : rows.map((row) => {
        const selected = selectable && selectedCategory === row.code;
        const content = (
          <>
            <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
              <span className={`truncate ${row.isUnclassified ? 'italic text-slate-500' : selected ? 'font-bold text-red-700' : 'font-semibold text-slate-700'}`} title={row.label}>
                {row.label}
              </span>
              <span className="shrink-0 font-mono text-slate-600">
                <strong className="text-slate-900">{row.quantidade.toLocaleString('pt-BR')}</strong>
                <span className="ml-1.5 text-[10px]">{row.percentual.toFixed(1).replace('.', ',')}%</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${row.isUnclassified ? 'bg-slate-300' : selected ? 'bg-red-600' : 'bg-slate-500'}`}
                style={{ width: `${Math.min(100, Math.max(row.percentual, 1))}%` }}
              />
            </div>
          </>
        );

        if (!selectable || row.code === '__OUTRAS__') return <div key={row.code} className="px-2.5 py-1.5">{content}</div>;

        return (
          <button
            key={row.code}
            type="button"
            onClick={() => setSelectedCategory(selected ? 'ALL' : row.code)}
            className={`w-full text-left rounded-lg px-2.5 py-1.5 transition no-print-target ${selected ? 'bg-red-50 ring-1 ring-red-100' : 'hover:bg-slate-50'}`}
            title={`Filtrar por ${row.label}`}
          >
            {content}
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="printable-card bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div className="px-4 py-3.5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-slate-50/40">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-red-600" />
            <h3 className="font-bold text-[#0F172A] text-sm">Perfil das Demandas</h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Classificação + Subclassificação</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Distribuição compacta da carteira por classificação e subclassificação.</p>
        </div>

        <div className="flex items-center gap-2 no-print">
          <button type="button" onClick={handlePrint} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] font-semibold hover:bg-slate-50">
            <Printer className="w-3.5 h-3.5" /> PDF / Imprimir
          </button>
          <button type="button" onClick={handleExportPng} disabled={exportingPng} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-[11px] font-semibold hover:bg-red-100 disabled:opacity-60">
            <Download className="w-3.5 h-3.5" /> {exportingPng ? 'Gerando...' : 'PNG do perfil'}
          </button>
        </div>
      </div>

      <div className="hidden print:block px-4 py-3 border-b border-slate-200 text-xs text-slate-600">
        <div className="flex justify-between gap-4">
          <div>
            <strong className="block text-slate-900">SB Gestão Jurídica • Perfil das Demandas</strong>
            <span>Classificação e subclassificação da carteira jurídica.</span>
          </div>
          <div className="text-right">
            <span>Emissão: {formatDateTime(new Date().toISOString())}</span>
            <span className="block">Demandas no escopo: {subcategoryScope.length}</span>
          </div>
        </div>
      </div>

      <div className="no-print px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mr-1">
          <Filter className="w-3.5 h-3.5" /> Filtros
        </div>

        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          <Calendar className="w-3 h-3" />
          <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700">
            <option value="ALL">Todo o histórico</option>
            <option value="30D">Últimos 30 dias</option>
            <option value="90D">Últimos 90 dias</option>
            <option value="YEAR">Ano atual</option>
          </select>
        </label>

        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700">
            <option value="ALL">Todos</option>
            {statuses.map((status) => <option key={status} value={status}>{statusText(status)}</option>)}
          </select>
        </label>

        {companies.length > 0 && (
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            <Building2 className="w-3 h-3" />
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} className="max-w-[220px] rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700">
              <option value="ALL">Todas as empresas</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.nome}</option>)}
            </select>
          </label>
        )}

        {hasFilters && (
          <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 ml-auto text-[11px] font-semibold text-red-600 hover:underline">
            <RotateCcw className="w-3 h-3" /> Limpar filtros
          </button>
        )}
      </div>

      {exportNotice && (
        <div className="no-print mx-4 mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" /> {exportNotice}
        </div>
      )}

      <div className="print-demand-grid grid grid-cols-1 xl:grid-cols-2 gap-0 xl:divide-x divide-slate-100">
        <div className="p-3.5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h4 className="text-xs font-bold text-slate-900">Classificações</h4>
              <p className="text-[10px] text-slate-400">{categoryStats.total.toLocaleString('pt-BR')} demandas no universo filtrado</p>
            </div>
            {selectedCategory !== 'ALL' && (
              <button type="button" onClick={() => setSelectedCategory('ALL')} className="no-print text-[10px] font-semibold text-red-600 hover:underline">Ver todas</button>
            )}
          </div>
          <BarList rows={compactCategoryStats} selectable />
        </div>

        <div className="p-3.5 border-t xl:border-t-0 border-slate-100">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-red-600" />
                {selectedCategory === 'ALL' ? 'Subclassificações' : `Subclassificações • ${categoryLabel(selectedCategory)}`}
              </h4>
              <p className="text-[10px] text-slate-400">{subcategoryScope.length.toLocaleString('pt-BR')} demandas consideradas</p>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Completude</div>
              <div className="text-xs font-bold text-slate-800">{dataQuality.rate.toFixed(1).replace('.', ',')}%</div>
            </div>
          </div>
          <BarList rows={compactSubcategoryStats} />
        </div>
      </div>

      <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
        <span>Subclassificadas: <strong className="text-slate-700">{dataQuality.withSub}</strong> • Sem subclassificação: <strong className="text-slate-700">{dataQuality.withoutSub}</strong></span>
        <span>Exibição resumida em até 6 linhas por coluna.</span>
      </div>
    </section>
  );
};
