import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { departmentAPI, ticketAPI, settingsAPI } from '../lib/api';
import useAuthStore from '../store/useAuthStore';
import TicketReceipt from '../components/TicketReceipt';

export default function Reception() {
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [formData, setFormData] = useState({
    department_id: '',
    category_id: '',
    parent_name: '',
    student_name: '',
    student_id: '',
    phone: '',
    purpose: '',
    priority: 'regular'
  });
  const [estimatedWait, setEstimatedWait] = useState(null);
  const [createdTicket, setCreatedTicket] = useState(null);
  const [queuePosition, setQueuePosition] = useState(null);
  const [schoolName, setSchoolName] = useState('Al-Noor School');

  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const navigate = useNavigate();

  useEffect(() => {
    loadDepartments();
    settingsAPI.getPublic()
      .then(res => { if (res.data.school_name) setSchoolName(res.data.school_name); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (formData.department_id) {
      loadCategories(formData.department_id);
      loadQueueInfo(formData.department_id);
    }
  }, [formData.department_id]);

  const loadDepartments = async () => {
    const res = await departmentAPI.getAll();
    setDepartments(res.data);
  };

  const loadCategories = async (deptId) => {
    const res = await departmentAPI.getCategories(deptId);
    setCategories(res.data);
  };

  const loadQueueInfo = async (deptId) => {
    const queue = await departmentAPI.getQueue(deptId);
    setQueuePosition(queue.data.length + 1);

    const stats = await departmentAPI.getStats(deptId);
    const avgWait = stats.data.waiting_count * 5;
    setEstimatedWait(avgWait);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await ticketAPI.create(formData);
      setCreatedTicket(res.data.ticket);
    } catch (error) {
      alert('Failed to create ticket: ' + error.response?.data?.error);
    }
  };

  const resetForm = () => {
    setFormData({
      department_id: '',
      category_id: '',
      parent_name: '',
      student_name: '',
      student_id: '',
      phone: '',
      purpose: '',
      priority: 'regular'
    });
    setCreatedTicket(null);
    setEstimatedWait(null);
    setQueuePosition(null);
  };

  if (createdTicket) {
    return <TicketReceipt ticket={createdTicket} schoolName={schoolName} onClose={resetForm} />;
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
              onChange={(e) => setFormData({...formData, department_id: e.target.value, category_id: ''})}
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
                onChange={(e) => setFormData({...formData, category_id: e.target.value})}
                className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
              >
                <option value="">Select Service</option>
                {categories.map(cat => (
                  <option key={cat.category_id} value={cat.category_id}>{cat.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-gray-700 font-semibold mb-2">Parent Name *</label>
            <input
              type="text"
              value={formData.parent_name}
              onChange={(e) => setFormData({...formData, parent_name: e.target.value})}
              className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 font-semibold mb-2">Student Name *</label>
            <input
              type="text"
              value={formData.student_name}
              onChange={(e) => setFormData({...formData, student_name: e.target.value})}
              className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Student ID</label>
              <input
                type="text"
                value={formData.student_id}
                onChange={(e) => setFormData({...formData, student_id: e.target.value})}
                className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
              />
            </div>
            <div>
              <label className="block text-gray-700 font-semibold mb-2">Phone Number</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 font-semibold mb-2">Purpose of Visit</label>
            <textarea
              value={formData.purpose}
              onChange={(e) => setFormData({...formData, purpose: e.target.value})}
              className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
              rows="3"
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 font-semibold mb-2">Priority</label>
            <div className="flex gap-4">
              {['regular', 'urgent', 'elderly', 'vip'].map(priority => (
                <label key={priority} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="priority"
                    value={priority}
                    checked={formData.priority === priority}
                    onChange={(e) => setFormData({...formData, priority: e.target.value})}
                    className="w-4 h-4"
                  />
                  <span className="capitalize">{priority}</span>
                </label>
              ))}
            </div>
          </div>

          {estimatedWait !== null && (
            <div className="mb-6 p-4 bg-teal bg-opacity-10 border-l-4 border-teal rounded">
              <p className="text-sm text-gray-600">Estimated Wait: <span className="font-bold text-lg">{estimatedWait} minutes</span></p>
              <p className="text-sm text-gray-600">Queue Position: <span className="font-bold text-lg">{queuePosition}th</span></p>
            </div>
          )}

          <div className="flex gap-4">
            <button
              type="submit"
              className="flex-1 bg-teal text-white py-4 rounded-lg hover:bg-opacity-90 font-bold text-lg"
            >
              CREATE & PRINT TICKET
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-8 bg-gray-300 text-gray-700 py-4 rounded-lg hover:bg-gray-400 font-semibold"
            >
              CANCEL
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
