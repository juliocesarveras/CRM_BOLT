import React, { useState, useEffect } from 'react';
import { 
  FileText, Search, Plus, Filter, RefreshCw, Download, Eye, Trash2, Edit, 
  FileSpreadsheet, DollarSign, Package, Users, Calendar, ArrowUp, ArrowDown, 
  XCircle, History, FileDown, Mail, Printer 
} from 'lucide-react';
import { billingAPI } from '../../lib/api/billing';
import type { Invoice } from '../../types/billing';
import CreateInvoiceModal from './CreateInvoiceModal';
import InvoiceViewerModal from './InvoiceViewerModal';
import EditInvoiceModal from './EditInvoiceModal';
import SendEmailModal from './SendEmailModal';
import { exportToCSV } from '../../utils/export';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { jsPDF } from "jspdf";

// Status order for sorting
const STATUS_ORDER = {
  'draft': 0,
  'issued': 1,
  'voided': 2
};

// Payment status order for sorting
const PAYMENT_STATUS_ORDER = {
  'pending': 0,
  'partial': 1,
  'paid': 2
};

export default function InvoiceList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewerModal, setShowViewerModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });
  const [stats, setStats] = useState({
    issuedInvoices: { count: 0, total: 0 },
    paidInvoices: { count: 0, total: 0 },
    pendingInvoices: { count: 0, total: 0 },
    voidedInvoices: { count: 0, total: 0 },
    draftInvoices: { count: 0, total: 0 },
    topProducts: [] as { name: string; total: number }[]
  });
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  }>({ key: 'status', direction: 'asc' });

  const itemsPerPage = 30;
  const currentMonth = new Date().toLocaleString('es-DO', { month: 'long' });

  useEffect(() => {
    loadInvoices();
    loadStats();
  }, [activeFilter, dateRange, sortConfig]);

  const loadStats = async () => {
    try {
      const { data: monthlyData } = await billingAPI.getInvoices();
      if (!monthlyData) return;

      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // Filter invoices for current month
      const monthlyInvoices = monthlyData.filter(inv => 
        new Date(inv.issue_date) >= firstDayOfMonth
      );

      // Calculate issued invoices
      const issuedInvoices = monthlyInvoices.filter(inv => inv.status === 'issued');
      const issuedTotal = issuedInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);

      // Calculate paid invoices
      const paidInvoices = monthlyInvoices.filter(inv => 
        inv.status === 'issued' && inv.payment_status === 'paid'
      );
      const paidTotal = paidInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);

      // Calculate pending invoices
      const pendingInvoices = monthlyInvoices.filter(inv => 
        inv.status === 'issued' && inv.payment_status !== 'paid'
      );
      const pendingTotal = pendingInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);

      // Calculate voided invoices
      const voidedInvoices = monthlyInvoices.filter(inv => inv.status === 'voided');
      const voidedTotal = voidedInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);

      // Calculate draft invoices
      const draftInvoices = monthlyInvoices.filter(inv => inv.status === 'draft');
      const draftTotal = draftInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);

      // Calculate top products
      const productSales = new Map<string, number>();
      monthlyInvoices.forEach(invoice => {
        invoice.items?.forEach(item => {
          const product = item.product?.name || '';
          const currentTotal = productSales.get(product) || 0;
          productSales.set(product, currentTotal + item.total_amount);
        });
      });

      const topProducts = Array.from(productSales.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, total]) => ({ name, total }));

      setStats({
        issuedInvoices: { count: issuedInvoices.length, total: issuedTotal },
        paidInvoices: { count: paidInvoices.length, total: paidTotal },
        pendingInvoices: { count: pendingInvoices.length, total: pendingTotal },
        voidedInvoices: { count: voidedInvoices.length, total: voidedTotal },
        draftInvoices: { count: draftInvoices.length, total: draftTotal },
        topProducts
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadInvoices = async () => {
    try {
      const { data, error } = await billingAPI.getInvoices();
      if (error) throw error;
      
      let filteredData = data || [];
      
      // Apply date range filter if set
      if (dateRange.startDate && dateRange.endDate) {
        filteredData = filteredData.filter(inv => 
          inv.issue_date >= dateRange.startDate && 
          inv.issue_date <= dateRange.endDate
        );
      }
      
      // By default show only issued and draft invoices
      if (!activeFilter) {
        filteredData = filteredData.filter(inv => 
          inv.status === 'issued' || inv.status === 'draft'
        );
      } else {
        // Apply active filter
        switch (activeFilter) {
          case 'month':
            const now = new Date();
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            filteredData = filteredData.filter(inv => 
              new Date(inv.issue_date) >= firstDayOfMonth &&
              inv.status === 'issued'
            );
            break;
          case 'draft':
            filteredData = filteredData.filter(inv => 
              inv.status === 'draft'
            );
            break;
          case 'paid':
            filteredData = filteredData.filter(inv => 
              inv.payment_status === 'paid' &&
              inv.status === 'issued'
            );
            break;
          case 'pending':
            filteredData = filteredData.filter(inv => 
              inv.payment_status !== 'paid' &&
              inv.status === 'issued'
            );
            break;
          case 'voided':
            filteredData = filteredData.filter(inv => 
              inv.status === 'voided'
            );
            break;
          case 'history':
            // No additional filtering needed
            break;
        }
      }

      // Apply sorting
      if (sortConfig) {
        filteredData.sort((a, b) => {
          let aValue, bValue;
          
          switch (sortConfig.key) {
            case 'status':
              aValue = STATUS_ORDER[a.status as keyof typeof STATUS_ORDER];
              bValue = STATUS_ORDER[b.status as keyof typeof STATUS_ORDER];
              break;
            case 'payment_status':
              aValue = PAYMENT_STATUS_ORDER[a.payment_status as keyof typeof PAYMENT_STATUS_ORDER];
              bValue = PAYMENT_STATUS_ORDER[b.payment_status as keyof typeof PAYMENT_STATUS_ORDER];
              break;
            case 'customer':
              aValue = a.customer?.full_name || '';
              bValue = b.customer?.full_name || '';
              break;
            case 'ncf':
              aValue = a.ncf;
              bValue = b.ncf;
              break;
            case 'issue_date':
              aValue = new Date(a.issue_date).getTime();
              bValue = new Date(b.issue_date).getTime();
              break;
            case 'total_amount':
              aValue = a.total_amount;
              bValue = b.total_amount;
              break;
            default:
              aValue = a[sortConfig.key as keyof Invoice];
              bValue = b[sortConfig.key as keyof Invoice];
          }

          if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }

      setInvoices(filteredData);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) {
      return null;
    }
    return sortConfig.direction === 'asc' ? 
      <ArrowUp className="h-4 w-4" /> : 
      <ArrowDown className="h-4 w-4" />;
  };

  const handleFilter = (filter: string) => {
    setActiveFilter(activeFilter === filter ? '' : filter);
    setCurrentPage(1);
    // Clear date range when changing filters
    if (filter !== 'history') {
      setDateRange({ startDate: '', endDate: '' });
    }
  };

  const getFilterDescription = () => {
    if (dateRange.startDate && dateRange.endDate) {
      return `Facturas del ${new Date(dateRange.startDate).toLocaleDateString()} al ${new Date(dateRange.endDate).toLocaleDateString()}`;
    }

    switch (activeFilter) {
      case 'month':
        return `Facturas Emitidas de ${currentMonth}`;
      case 'draft':
        return 'Borradores de Facturas';
      case 'paid':
        return `Facturas Cobradas de ${currentMonth}`;
      case 'pending':
        return `Facturas por Cobrar de ${currentMonth}`;
      case 'voided':
        return `Facturas Anuladas`;
      case 'history':
        return 'Historial de Facturas';
      default:
        return 'Facturas Emitidas';
    }
  };

  const handleExportPDF = async (invoice: Invoice) => {
    try {
      const doc = new jsPDF();
      
      // Add company header
      doc.setFontSize(20);
      doc.text('Quimicinter S.R.L', 105, 20, { align: 'center' });
      doc.setFontSize(12);
      doc.text('Productos Químicos Industriales e Institucionales', 105, 30, { align: 'center' });
      
      // Add invoice details
      doc.setFontSize(14);
      doc.text(`Factura #${invoice.ncf}`, 20, 50);
      doc.setFontSize(10);
      doc.text(`Fecha: ${new Date(invoice.issue_date).toLocaleDateString()}`, 20, 60);
      doc.text(`Cliente: ${invoice.customer?.full_name}`, 20, 70);
      
      // Add items table
      let y = 90;
      doc.text('Descripción', 20, y);
      doc.text('Cantidad', 100, y);
      doc.text('Precio', 140, y);
      doc.text('Total', 180, y);
      
      y += 10;
      invoice.items?.forEach(item => {
        doc.text(item.product?.name || '', 20, y);
        doc.text(item.quantity.toString(), 100, y);
        doc.text(item.unit_price.toFixed(2), 140, y);
        doc.text(item.total_amount.toFixed(2), 180, y);
        y += 10;
      });
      
      // Add totals
      y += 10;
      doc.text(`Subtotal: ${invoice.subtotal.toFixed(2)}`, 140, y);
      y += 10;
      doc.text(`ITBIS: ${invoice.tax_amount.toFixed(2)}`, 140, y);
      y += 10;
      doc.text(`Total: ${invoice.total_amount.toFixed(2)}`, 140, y);
      
      // Save the PDF
      doc.save(`factura-${invoice.ncf}.pdf`);
    } catch (error) {
      console.error('Error exporting to PDF:', error);
    }
  };

  const handleView = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowViewerModal(true);
  };

  const handleEdit = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowEditModal(true);
  };

  const handleEmail = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowEmailModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Está seguro que desea eliminar esta factura?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadInvoices();
      await loadStats();
    } catch (error) {
      console.error('Error deleting invoice:', error);
    }
  };

  const handleExport = () => {
    if (invoices.length > 0) {
      exportToCSV(invoices, 'invoices');
    }
  };

  const filteredInvoices = invoices.filter(invoice =>
    invoice.ncf.toLowerCase().includes(search.toLowerCase()) ||
    invoice.customer?.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const paginatedInvoices = filteredInvoices.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-gray-100">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center">
          <div className="sm:flex-auto">
            <h1 className="text-2xl font-semibold">Facturación</h1>
            <p className="mt-2 text-sm text-gray-400">
              Gestione las facturas y pagos del sistema
            </p>
          </div>
          <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex space-x-3">
            <Link
              to="/facturacion/cotizaciones"
              className="btn btn-secondary"
            >
              <FileText className="h-4 w-4 mr-2" />
              Cotizaciones
            </Link>
            <button
              onClick={handleExport}
              className="btn btn-secondary"
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva Factura
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {/* Issued Invoices */}
          <button
            onClick={() => handleFilter('month')}
            className={`bg-gray-800/50 overflow-hidden rounded-lg border ${
              activeFilter === 'month' ? 'border-blue-500/50' : 'border-white/10'
            } animate-slide-up transition-colors`}
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <FileSpreadsheet className="h-6 w-6 text-blue-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-400 truncate">
                      Facturas de {currentMonth}
                    </dt>
                    <dd className="mt-2">
                      <div className="text-lg font-semibold text-blue-400">
                        {stats.issuedInvoices.count} facturas
                      </div>
                      <div className="text-2xl font-semibold text-blue-300">
                        {new Intl.NumberFormat('es-DO', {
                          style: 'currency',
                          currency: 'DOP'
                        }).format(stats.issuedInvoices.total)}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </button>

          {/* Paid Invoices */}
          <button
            onClick={() => handleFilter('paid')}
            className={`bg-gray-800/50 overflow-hidden rounded-lg border ${
              activeFilter === 'paid' ? 'border-emerald-500/50' : 'border-white/10'
            } animate-slide-up-delay-1 transition-colors`}
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <DollarSign className="h-6 w-6 text-emerald-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-400 truncate">
                      Facturas Cobradas de {currentMonth}
                    </dt>
                    <dd className="mt-2">
                      <div className="text-lg font-semibold text-emerald-400">
                        {stats.paidInvoices.count} facturas
                      </div>
                      <div className="text-2xl font-semibold text-emerald-300">
                        {new Intl.NumberFormat('es-DO', {
                          style: 'currency',
                          currency: 'DOP'
                        }).format(stats.paidInvoices.total)}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </button>

          {/* Pending Invoices */}
          <button
            onClick={() => handleFilter('pending')}
            className={`bg-gray-800/50 overflow-hidden rounded-lg border ${
              activeFilter === 'pending' ? 'border-red-500/50' : 'border-white/10'
            } animate-slide-up-delay-2 transition-colors`}
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <FileText className="h-6 w-6 text-red-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-400 truncate">
                      Facturas por Cobrar de {currentMonth}
                    </dt>
                    <dd className="mt-2">
                      <div className="text-base font-semibold text-red-400">
                        {stats.pendingInvoices.count} facturas
                      </div>
                      <div className="text-lg font-semibold text-red-300">
                        {new Intl.NumberFormat('es-DO', {
                          style: 'currency',
                          currency: 'DOP'
                        }).format(stats.pendingInvoices.total)}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </button>

          {/* Draft Invoices */}
          <button
            onClick={() => handleFilter('draft')}
            className={`bg-gray-800/50 overflow-hidden rounded-lg border ${
              activeFilter === 'draft' ? 'border-yellow-500/50' : 'border-white/10'
            } animate-slide-up-delay-3 transition-colors`}
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <FileText className="h-6 w-6 text-yellow-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-400 truncate">
                      Borradores de {currentMonth}
                    </dt>
                    <dd className="mt-2">
                      <div className="text-lg font-semibold text-yellow-400">
                        {stats.draftInvoices.count} facturas
                      </div>
                      <div className="text-2xl font-semibold text-yellow-300">
                        {new Intl.NumberFormat('es-DO', {
                          style: 'currency',
                          currency: 'DOP'
                        }).format(stats.draftInvoices.total)}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </button>

          {/* Voided Invoices */}
          <button
            onClick={() => handleFilter('voided')}
            className={`bg-gray-800/50 overflow-hidden rounded-lg border ${
              activeFilter === 'voided' ? 'border-gray-500/50' : 'border-white/10'
            } animate-slide-up-delay-4 transition-colors`}
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <XCircle className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-400 truncate">
                      Anuladas de {currentMonth}
                    </dt>
                    <dd className="mt-2">
                      <div className="text-lg font-semibold text-gray-400">
                        {stats.voidedInvoices.count} facturas
                      </div>
                      <div className="text-2xl font-semibold text-gray-300">
                        {new Intl.NumberFormat('es-DO', {
                          style: 'currency',
                          currency: 'DOP'
                        }).format(stats.voidedInvoices.total)}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-8">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar facturas..."
                  className="form-input pl-10 w-full"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Date Range Filter */}
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                  className="form-input w-40"
                />
                <span className="text-gray-400">a</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                  className="form-input w-40"
                />
              </div>

              {/* History Button */}
              <button
                onClick={() => handleFilter('history')}
                className={`btn ${activeFilter === 'history' ? 'btn-primary' : 'btn-secondary'}`}
              >
                <History className="h-4 w-4 mr-2" />
                Historial
              </button>

              <button
                onClick={loadInvoices}
                className="btn btn-secondary"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualizar
              </button>
            </div>
          </div>

          {/* Results count with filter description */}
          <div className="mb-4 text-sm text-gray-400">
            Mostrando {paginatedInvoices.length} de {filteredInvoices.length} {getFilterDescription()}
            {dateRange.startDate && dateRange.endDate && (
              <> del {new Date(dateRange.startDate).toLocaleDateString()} al {new Date(dateRange.endDate).toLocaleDateString()}</>
            )}
          </div>

          <div className="overflow-x-auto">
            <div className="table-container">
              <table className="min-w-full divide-y divide-white/5">
                <thead className="table-header">
                  <tr>
                    <th scope="col" className="table-header th cursor-pointer" onClick={() => handleSort('ncf')}>
                      <div className="flex items-center space-x-1">
                        <span>NCF</span>
                        {getSortIcon('ncf')}
                      </div>
                    </th>
                    <th scope="col" className="table-header th cursor-pointer" onClick={() => handleSort('customer')}>
                      <div className="flex items-center space-x-1">
                        <span>CLIENTE</span>
                        {getSortIcon('customer')}
                      </div>
                    </th>
                    <th scope="col" className="table-header th cursor-pointer" onClick={() => handleSort('issue_date')}>
                      <div className="flex items-center space-x-1">
                        <span>FECHA</span>
                        {getSortIcon('issue_date')}
                      </div>
                    </th>
                    <th scope="col" className="table-header th text-right cursor-pointer" onClick={() => handleSort('total_amount')}>
                      <div className="flex items-center justify-end space-x-1">
                        <span>TOTAL</span>
                        {getSortIcon('total_amount')}
                      </div>
                    </th>
                    <th scope="col" className="table-header th cursor-pointer" onClick={() => handleSort('status')}>
                      <div className="flex items-center justify-center space-x-1">
                        <span>ESTADO</span>
                        {getSortIcon('status')}
                      </div>
                    </th>
                    <th scope="col" className="table-header th cursor-pointer" onClick={() => handleSort('payment_status')}>
                      <div className="flex items-center justify-center space-x-1">
                        <span>ESTADO DE PAGO</span>
                        {getSortIcon('payment_status')}
                      </div>
                    </th>
                    <th scope="col" className="relative table-header th">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paginatedInvoices.map((invoice) => (
                    <tr key={invoice.id} className="table-row">
                      <td className="table-cell font-medium">{invoice.ncf}</td>
                      <td className="table-cell">{invoice.customer?.full_name}</td>
                      <td className="table-cell">
                        {new Date(invoice.issue_date).toLocaleDateString()}
                      </td>
                      <td className="table-cell text-right">
                        {new Intl.NumberFormat('es-DO', {
                          style: 'currency',
                          currency: 'DOP'
                        }).format(invoice.total_amount)}
                      </td>
                      <td className="table-cell text-center">
                        <span className={`status-badge ${
                          invoice.status === 'issued' ? 'status-badge-success' :
                          invoice.status === 'voided' ? 'status-badge-error' :
                          'status-badge-warning'
                        }`}>
                          {invoice.status === 'issued' ? 'Emitida' :
                 invoice.status === 'voided' ? 'Anulada' : 'Borrador'}
                        </span>
                      </td>
                      <td className="table-cell text-center">
                        <span className={`status-badge ${
                          invoice.payment_status === 'paid' ? 'status-badge-success' :
                          invoice.payment_status === 'partial' ? 'status-badge-warning' :
                          'status-badge-error'
                        }`}>
                          {invoice.payment_status === 'paid' ? 'Pagada' :
                           invoice.payment_status === 'partial' ? 'Parcial' : 'Pendiente'}
                        </span>
                      </td>
                      <td className="table-cell-action">
                        <div className="flex justify-end space-x-3">
                          <button
                            onClick={() => handleView(invoice)}
                            className="action-icon-button"
                            title="Ver detalles"
                          >
                            <Eye className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleEmail(invoice)}
                            className="action-icon-button"
                            title="Enviar por email"
                          >
                            <Mail className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleExportPDF(invoice)}
                            className="action-icon-button"
                            title="Exportar a PDF"
                          >
                            <FileDown className="h-5 w-5" />
                          </button>
                          {invoice.status === 'draft' && (
                            <>
                              <button
                                onClick={() => handleEdit(invoice)}
                                className="action-icon-button"
                                title="Editar"
                              >
                                <Edit className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleDelete(invoice.id)}
                                className="text-red-400 hover:text-red-300 action-icon-button"
                                title="Eliminar"
                              >
                                <Trash2 className="h-5 w-5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-white/10 bg-gray-800/50 px-4 py-3 sm:px-6">
              <div className="flex flex-1 justify-between sm:hidden">
                <button
                  onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                  className="btn btn-secondary"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages}
                  className="btn btn-secondary"
                >
                  Siguiente
                </button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-400">
                    Mostrando <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> a{' '}
                    <span className="font-medium">
                      {Math.min(currentPage * itemsPerPage, filteredInvoices.length)}
                    </span>{' '}
                    de <span className="font-medium">{filteredInvoices.length}</span> resultados
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    <button
                      onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-white/10 hover:bg-white/5 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                    >
                      <span className="sr-only">Anterior</span>
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-white/10 hover:bg-white/5 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                    >
                      <span className="sr-only">Siguiente</span>
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>

        <CreateInvoiceModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadInvoices();
            loadStats();
          }}
        />

        <InvoiceViewerModal
          isOpen={showViewerModal}
          onClose={() => {
            setShowViewerModal(false);
            setSelectedInvoice(null);
          }}
          invoice={selectedInvoice}
          onSuccess={() => {
            loadInvoices();
            loadStats();
          }}
        />

        {selectedInvoice && (
          <EditInvoiceModal
            isOpen={showEditModal}
            onClose={() => {
              setShowEditModal(false);
              setSelectedInvoice(null);
            }}
            onSuccess={() => {
              loadInvoices();
              loadStats();
            }}
            invoice={selectedInvoice}
          />
        )}

        <SendEmailModal
          isOpen={showEmailModal}
          onClose={() => {
            setShowEmailModal(false);
            setSelectedInvoice(null);
          }}
          invoice={selectedInvoice!}
        />
      </div>
    </div>
  );
}