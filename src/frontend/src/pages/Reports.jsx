import { useState, useEffect } from 'react';
import api, { adminAPI, reportsAPI } from '../lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';

const today = new Date().toISOString().split('T')[0];

function AccuracyBadge({ estimated, actual }) {
  if (actual == null || estimated == null) return <span className="text-gray-300">—</span>;
  const diff  = Math.abs(actual - estimated);
  const pct   = estimated > 0 ? Math.round((actual / estimated) * 100) : null;
  const color = diff <= 2 ? 'text-green-600' : diff <= 5 ? 'text-yellow-600' : 'text-red-500';
  return <span className={`font-semibold ${color}`}>{pct != null ? `${pct}%` : '—'}</span>;
}

// ── Daily Summary ─────────────────────────────────────────────────────────────

function DailySummary() {
  const [date, setDate]           = useState(today);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading]     = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/reports/daily?date=${date}`);
      setReportData(res.data);
    } catch {
      alert('Failed to fetch report. Make sure you have admin access.');
    } finally {
      setLoading(false);
    }
  };

  const totals = reportData ? {
    total:    reportData.reduce((s, r) => s + r.total_tickets, 0),
    served:   reportData.reduce((s, r) => s + r.served, 0),
    no_shows: reportData.reduce((s, r) => s + r.no_shows, 0),
  } : null;

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text('Daily Summary Report', 14, 22);
    doc.setFontSize(11); doc.text(`Date: ${date}`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 36);
    doc.autoTable({
      startY: 44,
      head: [['Department', 'Total', 'Served', 'No-Shows', 'Skipped', 'Avg Wait (min)', 'Avg Service (min)']],
      body: reportData.map(d => [d.department, d.total_tickets, d.served, d.no_shows, d.skipped ?? 0, d.avg_wait_minutes ?? 0, d.avg_service_minutes ?? 0]),
      foot: [['TOTAL', totals.total, totals.served, totals.no_shows, '', '', '']],
      styles: { fontSize: 10 },
      headStyles: { fillColor: [25, 34, 74] },
      footStyles: { fillColor: [95, 174, 182], textColor: [255, 255, 255], fontStyle: 'bold' }
    });
    doc.save(`daily-report-${date}.pdf`);
  };

  const exportToExcel = () => {
    const rows = reportData.map(d => ({
      Department: d.department, 'Total Tickets': d.total_tickets, Served: d.served,
      'No-Shows': d.no_shows, Skipped: d.skipped ?? 0,
      'Avg Wait (min)': d.avg_wait_minutes ?? 0, 'Avg Service (min)': d.avg_service_minutes ?? 0
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Report');
    XLSX.writeFile(wb, `daily-report-${date}.xlsx`);
  };

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-bold text-navy mb-4">Daily Summary Report</h2>
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">Select Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal" />
          </div>
          <div className="pt-5">
            <button onClick={fetchReport} disabled={loading}
              className="px-8 py-2 bg-teal text-white rounded-lg hover:bg-opacity-90 font-semibold disabled:opacity-50">
              {loading ? 'Loading...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {reportData && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-sm text-gray-500">Total Tickets</p>
              <p className="text-4xl font-black text-navy">{totals.total}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-sm text-gray-500">Served</p>
              <p className="text-4xl font-black text-teal">{totals.served}</p>
              <p className="text-sm text-gray-400">{totals.total ? Math.round(totals.served / totals.total * 100) : 0}% completion</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-sm text-gray-500">No-Shows</p>
              <p className="text-4xl font-black text-red-500">{totals.no_shows}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-navy">By Department — {date}</h3>
              <div className="flex gap-2">
                <button onClick={exportToPDF} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold">Export PDF</button>
                <button onClick={exportToExcel} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-semibold">Export Excel</button>
              </div>
            </div>

            <table className="w-full mb-8">
              <thead className="bg-navy text-white">
                <tr>
                  <th className="px-4 py-3 text-left">Department</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Served</th>
                  <th className="px-4 py-3 text-right">No-Shows</th>
                  <th className="px-4 py-3 text-right">Skipped</th>
                  <th className="px-4 py-3 text-right">Avg Wait (min)</th>
                  <th className="px-4 py-3 text-right">Avg Service (min)</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold">{row.department}</td>
                    <td className="px-4 py-3 text-right">{row.total_tickets}</td>
                    <td className="px-4 py-3 text-right text-teal font-semibold">{row.served}</td>
                    <td className="px-4 py-3 text-right text-red-500">{row.no_shows}</td>
                    <td className="px-4 py-3 text-right text-orange-500">{row.skipped ?? 0}</td>
                    <td className="px-4 py-3 text-right">{row.avg_wait_minutes ?? 0}</td>
                    <td className="px-4 py-3 text-right">{row.avg_service_minutes ?? 0}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-bold">
                <tr>
                  <td className="px-4 py-3">TOTAL</td>
                  <td className="px-4 py-3 text-right">{totals.total}</td>
                  <td className="px-4 py-3 text-right text-teal">{totals.served}</td>
                  <td className="px-4 py-3 text-right text-red-500">{totals.no_shows}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>

            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={reportData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="department" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total_tickets" fill="#19224A" name="Total Tickets" radius={[4,4,0,0]} />
                <Bar dataKey="served"        fill="#5FAEB6" name="Served"        radius={[4,4,0,0]} />
                <Bar dataKey="no_shows"      fill="#ef4444" name="No-Shows"      radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {reportData?.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400 text-lg">
          No tickets found for {date}.
        </div>
      )}
    </div>
  );
}

// ── Service Type Report ───────────────────────────────────────────────────────

function ServiceTypeReport() {
  const [fromDate, setFromDate]       = useState(today);
  const [toDate, setToDate]           = useState(today);
  const [deptId, setDeptId]           = useState('');
  const [departments, setDepartments] = useState([]);
  const [reportData, setReportData]   = useState(null);
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    adminAPI.getDepartments().then(r => setDepartments(r.data)).catch(() => {});
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = { from: fromDate, to: toDate };
      if (deptId) params.department_id = deptId;
      const res = await reportsAPI.getServiceTypes(params);
      setReportData(res.data);
    } catch {
      alert('Failed to fetch service type report.');
    } finally {
      setLoading(false);
    }
  };

  const totals = reportData ? {
    total:    reportData.reduce((s, r) => s + r.total_tickets, 0),
    served:   reportData.reduce((s, r) => s + r.served, 0),
    no_shows: reportData.reduce((s, r) => s + r.no_shows, 0),
  } : null;

  const chartData = (reportData || []).map(r => ({
    name:              r.service_type.length > 16 ? r.service_type.slice(0, 14) + '…' : r.service_type,
    'Estimated (min)': r.estimated_time_minutes,
    'Actual (min)':    r.avg_actual_minutes ?? 0,
  }));

  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(16); doc.text('Service Type Report', 14, 18);
    doc.setFontSize(10); doc.text(`Period: ${fromDate} to ${toDate}`, 14, 25);
    doc.autoTable({
      startY: 30,
      head: [['Service Type', 'Department', 'Total', 'Served', 'No-Shows', 'Avg Wait', 'Actual Avg', 'Estimated', 'Accuracy']],
      body: reportData.map(r => [
        r.service_type, r.department, r.total_tickets, r.served, r.no_shows,
        r.avg_wait_minutes ?? '—', r.avg_actual_minutes ?? '—', r.estimated_time_minutes,
        r.avg_actual_minutes != null
          ? `${Math.round((r.avg_actual_minutes / r.estimated_time_minutes) * 100)}%` : '—'
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [25, 34, 74] },
    });
    doc.save(`service-type-report-${fromDate}-${toDate}.pdf`);
  };

  const exportToExcel = () => {
    const rows = reportData.map(r => ({
      'Service Type': r.service_type, Department: r.department,
      'Total Tickets': r.total_tickets, Served: r.served, 'No-Shows': r.no_shows,
      'Avg Wait (min)': r.avg_wait_minutes ?? '', 'Actual Avg (min)': r.avg_actual_minutes ?? '',
      'Estimated (min)': r.estimated_time_minutes,
      'Accuracy %': r.avg_actual_minutes != null
        ? Math.round((r.avg_actual_minutes / r.estimated_time_minutes) * 100) : ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Service Types');
    XLSX.writeFile(wb, `service-type-report-${fromDate}-${toDate}.xlsx`);
  };

  return (
    <div>
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-bold text-navy mb-4">Service Type Detailed Report</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">To</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">Department</label>
            <select value={deptId} onChange={e => setDeptId(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal">
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d.department_id} value={d.department_id}>{d.name}</option>
              ))}
            </select>
          </div>
          <button onClick={fetchReport} disabled={loading}
            className="px-8 py-2 bg-teal text-white rounded-lg hover:bg-opacity-90 font-semibold disabled:opacity-50">
            {loading ? 'Loading...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {reportData && reportData.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-sm text-gray-500">Total Tickets</p>
              <p className="text-4xl font-black text-navy">{totals.total}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-sm text-gray-500">Served</p>
              <p className="text-4xl font-black text-teal">{totals.served}</p>
              <p className="text-sm text-gray-400">{totals.total ? Math.round(totals.served / totals.total * 100) : 0}% completion</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-5">
              <p className="text-sm text-gray-500">No-Shows</p>
              <p className="text-4xl font-black text-red-500">{totals.no_shows}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-navy">By Service Type</h3>
              <div className="flex gap-2">
                <button onClick={exportToPDF} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold">Export PDF</button>
                <button onClick={exportToExcel} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-semibold">Export Excel</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-navy text-white">
                  <tr>
                    <th className="px-4 py-3 text-left">Service Type</th>
                    <th className="px-4 py-3 text-left">Department</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Served</th>
                    <th className="px-4 py-3 text-right">No-Shows</th>
                    <th className="px-4 py-3 text-right">Avg Wait (min)</th>
                    <th className="px-4 py-3 text-right">Actual Avg (min)</th>
                    <th className="px-4 py-3 text-right">Estimated (min)</th>
                    <th className="px-4 py-3 text-right">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((row, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold">{row.service_type}</td>
                      <td className="px-4 py-3 text-gray-500">{row.department}</td>
                      <td className="px-4 py-3 text-right">{row.total_tickets}</td>
                      <td className="px-4 py-3 text-right text-teal font-semibold">{row.served}</td>
                      <td className="px-4 py-3 text-right text-red-500">{row.no_shows}</td>
                      <td className="px-4 py-3 text-right">{row.avg_wait_minutes ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{row.avg_actual_minutes ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{row.estimated_time_minutes}</td>
                      <td className="px-4 py-3 text-right">
                        <AccuracyBadge estimated={row.estimated_time_minutes} actual={row.avg_actual_minutes} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 font-bold">
                  <tr>
                    <td className="px-4 py-3" colSpan={2}>TOTAL</td>
                    <td className="px-4 py-3 text-right">{totals.total}</td>
                    <td className="px-4 py-3 text-right text-teal">{totals.served}</td>
                    <td className="px-4 py-3 text-right text-red-500">{totals.no_shows}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {chartData.some(r => r['Actual (min)'] > 0) && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-bold text-navy mb-4">Estimated vs Actual Time per Service</h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 50, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 12 }} unit=" min" />
                  <Tooltip formatter={v => `${v} min`} />
                  <Legend />
                  <Bar dataKey="Estimated (min)" fill="#F59E0B" radius={[4,4,0,0]} />
                  <Bar dataKey="Actual (min)"    fill="#5FAEB6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-400 mt-2 text-center">
                Accuracy: green = within 2 min of estimate · yellow = within 5 min · red = off by more than 5 min
              </p>
            </div>
          )}
        </>
      )}

      {reportData?.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400 text-lg">
          No service type data found for the selected period.
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Reports() {
  const [tab, setTab] = useState('daily');
  const navigate      = useNavigate();
  const logout        = useAuthStore(s => s.logout);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy text-white py-4 px-8 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/home')} className="text-teal hover:text-white text-sm font-semibold">← Home</button>
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
        </div>
        <button onClick={() => logout()} className="bg-red-600 px-4 py-2 rounded hover:bg-red-700 text-sm">Logout</button>
      </header>

      <main className="max-w-6xl mx-auto p-8">
        <div className="flex gap-2 mb-6">
          {[
            { key: 'daily',        label: 'Daily Summary' },
            { key: 'serviceTypes', label: 'Service Types' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-6 py-2 rounded-lg font-semibold text-sm transition-all
                ${tab === t.key
                  ? 'bg-navy text-white shadow'
                  : 'bg-white text-gray-600 hover:bg-gray-100 shadow-sm'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'daily'        && <DailySummary />}
        {tab === 'serviceTypes' && <ServiceTypeReport />}
      </main>
    </div>
  );
}
