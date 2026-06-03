import { useState, useEffect } from 'react';
import { settingsAPI, departmentAPI, kioskAPI } from '../lib/api';
import TicketReceipt from '../components/TicketReceipt';

const STEP = { WELCOME: 0, INFO: 1, DEPARTMENT: 2, CATEGORY: 3, DONE: 4 };
const RESET_AFTER = 30;

export default function Kiosk() {
  const [step, setStep]               = useState(STEP.WELCOME);
  const [settings, setSettings]       = useState({});
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories]   = useState([]);

  const [parentName, setParentName]   = useState('');
  const [studentName, setStudentName] = useState('');
  const [selectedDept, setSelectedDept] = useState(null);
  const [ticket, setTicket]           = useState(null);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const [countdown, setCountdown]     = useState(RESET_AFTER);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    settingsAPI.getPublic().then(r => setSettings(r.data)).catch(() => {});
    departmentAPI.getAll().then(r => setDepartments(r.data)).catch(() => {});
  }, []);

  // Auto-reset countdown when ticket is issued
  useEffect(() => {
    if (step !== STEP.DONE) return;
    setCountdown(RESET_AFTER);
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { reset(); return RESET_AFTER; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  const reset = () => {
    setStep(STEP.WELCOME);
    setParentName('');
    setStudentName('');
    setSelectedDept(null);
    setCategories([]);
    setTicket(null);
    setError('');
    setShowReceipt(false);
  };

  const goToDept = () => {
    if (!parentName.trim()) { setError('Please enter your name to continue.'); return; }
    setError('');
    setStep(STEP.DEPARTMENT);
  };

  const selectDept = async (dept) => {
    setSelectedDept(dept);
    setError('');
    try {
      const res = await departmentAPI.getCategories(dept.department_id);
      if (res.data.length > 0) {
        setCategories(res.data);
        setStep(STEP.CATEGORY);
      } else {
        await submitTicket(dept, null);
      }
    } catch {
      setError('Failed to load services. Please try again.');
    }
  };

  const submitTicket = async (dept, cat) => {
    setSubmitting(true);
    setError('');
    try {
      const res = await kioskAPI.createTicket({
        department_id: dept.department_id,
        category_id: cat?.category_id || null,
        parent_name: parentName.trim(),
        student_name: studentName.trim() || null,
      });
      setTicket({ ...res.data.ticket, estimated_wait: res.data.ticket.estimated_wait, department_name: dept.name });
      setStep(STEP.DONE);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create ticket. Please try again.');
      setSubmitting(false);
    } finally {
      setSubmitting(false);
    }
  };

  const schoolName = settings.school_name || 'Queue System';

  return (
    <div className="min-h-screen bg-navy flex flex-col select-none" style={{ touchAction: 'manipulation' }}>
      {/* Header */}
      <header className="px-8 py-5 flex items-center justify-between border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          {settings.school_logo && (
            <img src={settings.school_logo} alt="Logo" className="h-12 w-12 object-contain rounded-lg" />
          )}
          <span className="text-white font-bold text-2xl">{schoolName}</span>
        </div>
        {step > STEP.WELCOME && step < STEP.DONE && (
          <button
            onClick={reset}
            className="text-white/40 text-lg hover:text-white/70 transition-colors px-3 py-1"
          >
            ✕ Cancel
          </button>
        )}
      </header>

      {/* Step indicator */}
      {step > STEP.WELCOME && step < STEP.DONE && (
        <div className="flex justify-center gap-2 pt-6 shrink-0">
          {[STEP.INFO, STEP.DEPARTMENT, STEP.CATEGORY].map(s => (
            <div
              key={s}
              className={`h-2 w-12 rounded-full transition-all ${
                s <= step ? 'bg-teal' : 'bg-white/20'
              } ${s === STEP.CATEGORY && categories.length === 0 ? 'hidden' : ''}`}
            />
          ))}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 flex items-center justify-center p-8">

        {/* ── WELCOME ────────────────────────────────────────────────── */}
        {step === STEP.WELCOME && (
          <div className="text-center">
            <div className="text-8xl mb-8 leading-none">🎫</div>
            <h1 className="text-5xl font-black text-white mb-4">مرحباً · Welcome</h1>
            <p className="text-white/50 text-2xl mb-12">Tap below to get your queue ticket</p>
            <button
              onClick={() => setStep(STEP.INFO)}
              className="bg-teal text-white text-3xl font-bold px-20 py-8 rounded-3xl hover:bg-opacity-90 active:scale-95 transition-all shadow-2xl"
            >
              Get a Ticket
            </button>
          </div>
        )}

        {/* ── INFO ───────────────────────────────────────────────────── */}
        {step === STEP.INFO && (
          <div className="w-full max-w-xl">
            <h2 className="text-4xl font-black text-white mb-2 text-center">Your Details</h2>
            <p className="text-white/50 text-xl text-center mb-10">Please enter your information</p>

            <div className="space-y-5">
              <div>
                <label className="block text-white/80 font-semibold mb-2 text-xl">
                  Parent / Guardian Name <span className="text-teal">*</span>
                </label>
                <input
                  type="text"
                  value={parentName}
                  onChange={e => { setParentName(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && goToDept()}
                  placeholder="Enter your full name"
                  className="w-full px-6 py-5 text-2xl bg-white rounded-2xl outline-none focus:ring-4 focus:ring-teal"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-white/80 font-semibold mb-2 text-xl">
                  Student Name <span className="text-white/40 font-normal text-lg">(optional)</span>
                </label>
                <input
                  type="text"
                  value={studentName}
                  onChange={e => setStudentName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && goToDept()}
                  placeholder="Enter student's name"
                  className="w-full px-6 py-5 text-2xl bg-white rounded-2xl outline-none focus:ring-4 focus:ring-teal"
                />
              </div>

              {error && (
                <p className="text-red-400 text-center text-lg font-semibold">{error}</p>
              )}

              <button
                onClick={goToDept}
                className="w-full bg-teal text-white text-2xl font-bold py-6 rounded-2xl hover:bg-opacity-90 active:scale-95 transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── DEPARTMENT ─────────────────────────────────────────────── */}
        {step === STEP.DEPARTMENT && (
          <div className="w-full max-w-2xl">
            <h2 className="text-4xl font-black text-white mb-2 text-center">Select Department</h2>
            <p className="text-white/50 text-xl text-center mb-8">Which department do you need?</p>

            {error && <p className="text-red-400 text-center mb-4 text-lg">{error}</p>}

            <div className={`grid gap-4 ${departments.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {departments.map(d => (
                <button
                  key={d.department_id}
                  onClick={() => !submitting && selectDept(d)}
                  disabled={submitting}
                  className="bg-white rounded-2xl p-7 text-center hover:bg-teal group active:scale-95 transition-all disabled:opacity-50 min-h-[120px] flex flex-col items-center justify-center"
                >
                  <p className="text-2xl font-black text-navy group-hover:text-white leading-tight">{d.name}</p>
                </button>
              ))}
            </div>

            {submitting && (
              <p className="text-white/60 text-center mt-8 text-xl animate-pulse">Creating your ticket…</p>
            )}
          </div>
        )}

        {/* ── CATEGORY ───────────────────────────────────────────────── */}
        {step === STEP.CATEGORY && (
          <div className="w-full max-w-2xl">
            <h2 className="text-4xl font-black text-white mb-2 text-center">Service Needed</h2>
            <p className="text-white/50 text-xl text-center mb-8">What do you need help with?</p>

            {error && <p className="text-red-400 text-center mb-4 text-lg">{error}</p>}

            <div className={`grid gap-4 mb-5 ${categories.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {categories.map(c => (
                <button
                  key={c.category_id}
                  onClick={() => !submitting && submitTicket(selectedDept, c)}
                  disabled={submitting}
                  className="bg-white rounded-2xl p-7 text-center hover:bg-teal group active:scale-95 transition-all disabled:opacity-50 min-h-[110px] flex flex-col items-center justify-center"
                >
                  <p className="text-xl font-black text-navy group-hover:text-white">{c.name}</p>
                  {c.estimated_time_minutes && (
                    <p className="text-sm text-gray-400 group-hover:text-white/70 mt-1">~{c.estimated_time_minutes} min</p>
                  )}
                </button>
              ))}
            </div>

            <button
              onClick={() => !submitting && submitTicket(selectedDept, null)}
              disabled={submitting}
              className="w-full bg-white/10 text-white/70 text-xl font-semibold rounded-2xl py-5 hover:bg-white/20 active:scale-95 transition-all"
            >
              Other / Not sure
            </button>

            {submitting && (
              <p className="text-white/60 text-center mt-6 text-xl animate-pulse">Creating your ticket…</p>
            )}
          </div>
        )}

        {/* ── DONE ───────────────────────────────────────────────────── */}
        {step === STEP.DONE && ticket && (
          <div className="text-center w-full max-w-lg">
            <div className="text-7xl mb-6">✅</div>
            <p className="text-white/60 text-2xl mb-3">Your ticket number is</p>

            <div className="bg-white rounded-3xl p-10 mb-8 shadow-2xl">
              <p className="text-8xl font-black text-navy tracking-widest">{ticket.ticket_number}</p>
              <p className="text-gray-500 mt-4 text-2xl font-semibold">{ticket.department_name}</p>
              {ticket.estimated_wait > 0 && (
                <p className="text-gray-400 mt-2 text-lg">Estimated wait: ~{ticket.estimated_wait} min</p>
              )}
            </div>

            <div className="flex gap-4 mb-8">
              <button
                onClick={() => setShowReceipt(true)}
                className="flex-1 bg-teal text-white text-2xl font-bold py-6 rounded-2xl hover:bg-opacity-90 active:scale-95 transition-all"
              >
                🖨 Print Ticket
              </button>
              <button
                onClick={reset}
                className="flex-1 bg-white/10 text-white text-2xl font-bold py-6 rounded-2xl hover:bg-white/20 active:scale-95 transition-all"
              >
                Done ({countdown}s)
              </button>
            </div>

            <p className="text-white/30 text-lg">
              Please wait in the reception area. Your number will appear on the screen.
            </p>
          </div>
        )}
      </div>

      {/* Print receipt overlay */}
      {showReceipt && ticket && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <TicketReceipt
            ticket={ticket}
            schoolName={schoolName}
            ticketSettings={settings}
            closeLabel="Close"
            onClose={() => setShowReceipt(false)}
          />
        </div>
      )}
    </div>
  );
}
