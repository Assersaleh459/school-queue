import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { departmentAPI, ticketAPI, settingsAPI } from '../lib/api';
import useAuthStore from '../store/useAuthStore';
import TicketReceipt from '../components/TicketReceipt';
import { toast } from '../store/useToastStore';

export default function Reception() {
  const [departments, setDepartments]     = useState([]);
  const [categories, setCategories]       = useState([]);
  const [formData, setFormData]           = useState({
    department_id: '',
    category_id: '',
    parent_name: '',
    student_name: '',
    student_id: '',
    phone: '',
    purpose: '',
    priority: 'regular'
  });
  const [waitingCount, setWaitingCount]   = useState(null);
  const [queuePosition, setQueuePosition] = useState(null);
  const [waitEstimate, setWaitEstimate]   = useState(null); // { minutes, ahead, perService }
  const [createdTicket, setCreatedTicket] = useState(null);
  const [schoolName, setSchoolName]       = useState('Al-Noor School');
  const [ticketSettings, setTicketSettings] = useState({});

  const user   = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const navigate = useNavigate();

  useEffect(() => {
    departmentAPI.getAll().then(r => setDepartments(r.data)).catch(() => {});
    settingsAPI.getPublic()
      .then(res => {
        if (res.data.school_name) setSchoolName(res.data.school_name);
        setTicketSettings(res.data);
      })
      .catch(() => {});
  }, []);

  // When department changes — load categories + queue count
  useEffect(() => {
    if (!formData.department_id) {
      setCategories([]);
      setWaitingCount(null);
      setQueuePosition(null);
      setWaitEstimate(null);
      return;
    }
    departmentAPI.getCategories(formData.department_id)
      .then(r => setCategories(r.data)).catch(() => {});
    departmentAPI.getQueue(formData.department_id).then(r => {
      setWaitingCount(r.data.length);
      setQueuePosition(r.data.length + 1);
    }).catch(() => {});
  }, [formData.department_id]);

  // Recalculate estimate when category selection, categories list, or waitingCount changes
  useEffect(() => {
    if (waitingCount === null) { setWaitEstimate(null); return; }

    let perService = 5;
    if (formData.category_id) {
      const cat = categories.find(c => String(c.category_id) === String(formData.category_id));
      if (cat) perService = cat.estimated_time_minutes;
    } else if (categories.length > 0) {
      perService = Math.round(
        categories.reduce((s, c) => s + c.estimated_time_minutes, 0) / categories.length
      );
    }
    setWaitEstimate({ minutes: waitingCount * perService, ahead: waitingCount, perService });
  }, [formData.category_id, categories, waitingCount]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const ticketRes = await ticketAPI.create(formData);
      settingsAPI.getPublic().then(res => {
        setTicketSettings(res.data);
        if (res.data.school_name) setSchoolName(res.data.school_name);
      }).catch(() => {});
      setCreatedTicket(ticketRes.data.ticket);
    } catch (error) {
      toast.error('Failed to create ticket: ' + (error.response?.data?.error || error.message));
    }
  };

  const resetForm = () => {
    setFormData({ department_id: '', category_id: '', parent_name: '', student_name: '', student_id: '', phone: '', purpose: '', priority: 'regular' });
    setCreatedTicket(null);
    setWaitEstimate(null);
    setWaitingCount(null);
    setQueuePosition(null);
  };

  if (createdTicket) {
    return <TicketReceipt ticket={createdTicket} schoolName={schoolName} ticketSettings={ticketSettings} onClose={resetForm} />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-navy text-white py-4 px-8 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/home')} className="text-teal hover:text-white text-sm font-semibold">← Home</button>
          <h1 className="text-2xl font-bold">Create New Ticket</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-300">{user?.full_name}</span>
          <button onClick={() => logout()} className="bg-red-600 px-4 py-2 rounded hover:bg-red-700 text-sm">Logout</button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto mt-8 p-8 bg-white rounded-lg shadow-md">
        <form onSubmit={handleSubmit}>

          <div className="mb-4">
            <label className="block text-gray-700 font-semibold mb-2">Department *</label>
            <select
              value={formData.department_id}
              onChange={e => setFormData({ ...formData, department_id: e.target.value, category_id: '' })}
              className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
              required
            >
              <option value="">Select Department</option>
              {departments.map(dept => (
                <option key={dept.department_id} value={dept.department_id}>{dept.name}</option>
              ))}
            </select>
          </div>

          {formData.department_id && (
            <div className="mb-4">
              <label className="block text-gray-700 font-semibold mb-2">Service Type</label>
              <select
                value={formData.category_id}
                onChange={e => setFormData({ ...formData, category_id: e.target.value })}
                className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
              >
                <option value="">Select Service</option>
                {categories.map(cat => (
                  <option key={cat.category_id} value={cat.category_id}>
                    {cat.name} ({cat.estimated_time_minutes} min)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Live wait estimate */}
          {waitEstimate !== null && (
            <div className="mb-5 p-4 bg-teal bg-opacity-10 border-l-4 border-teal rounded-lg">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-0.5">Estimated Wait</p>
                  {waitEstimate.ahead === 0
                    ? <p className="text-xl font-black text-teal">You're next — no wait!</p>
                    : <>
                        <p className="text-2xl font-black text-teal">~{waitEstimate.minutes} min</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {waitEstimate.ahead} {waitEstimate.ahead === 1 ? 'person' : 'people'} ahead &times; {waitEstimate.perService} min/service
                        </p>
                      </>
                  }
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-0.5">Queue Position</p>
                  <p className="text-2xl font-black text-navy">#{queuePosition}</p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-gray-700 font-semibold mb-2">Parent Name *</label>
            <input type="text" value={formData.parent_name}
              onChange={e => setFormData({ ...formData, parent_name: e.target.value })}
              className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy" required />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 font-semibold mb-2">Student Name *</label>
            <input type="text" value={formData.student_name}
              onChange={e => setFormData({ ...formData, student_name: e.target.value })}
              className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy" required />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Student ID</label>
              <input type="text" value={formData.student_id}
                onChange={e => setFormData({ ...formData, student_id: e.target.value })}
                className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy" />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Phone Number</label>
              <input type="tel" value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy" />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 font-semibold mb-2">Purpose of Visit</label>
            <textarea value={formData.purpose}
              onChange={e => setFormData({ ...formData, purpose: e.target.value })}
              className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy" rows="3" />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 font-semibold mb-2">Priority</label>
            <div className="flex gap-4">
              {['regular', 'urgent', 'elderly', 'vip'].map(priority => (
                <label key={priority} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="priority" value={priority}
                    checked={formData.priority === priority}
                    onChange={e => setFormData({ ...formData, priority: e.target.value })}
                    className="w-4 h-4" />
                  <span className="capitalize">{priority}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-4">
            <button type="submit"
              className="flex-1 bg-teal text-white py-4 rounded-lg hover:bg-opacity-90 font-bold text-lg">
              CREATE & PRINT TICKET
            </button>
            <button type="button" onClick={resetForm}
              className="px-8 bg-gray-300 text-gray-700 py-4 rounded-lg hover:bg-gray-400 font-semibold">
              CANCEL
            </button>
          </div>

        </form>
      </main>
    </div>
  );
}
