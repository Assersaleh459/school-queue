import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const settingsAPI = {
  getPublic: () => api.get('/settings/public')
};

export const authAPI = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
  changePassword: (current_password, new_password) =>
    api.put('/auth/change-password', { current_password, new_password })
};

export const ticketAPI = {
  create: (data) => api.post('/tickets', data),
  getById: (id) => api.get(`/tickets/${id}`)
};

export const departmentAPI = {
  getAll: () => api.get('/departments'),
  getCategories: (deptId) => api.get(`/departments/${deptId}/categories`),
  getQueue: (deptId) => api.get(`/departments/${deptId}/queue`),
  getStats: (deptId) => api.get(`/departments/${deptId}/stats`)
};

export const queueAPI = {
  getDisplayData: () => api.get('/queue/display'),
  getCurrent: (deptId) => api.get(`/queue/departments/${deptId}/current`),
  callNext: (deptId, staffId) => api.post(`/queue/departments/${deptId}/call-next`, { staff_id: staffId }),
  complete: (ticketId, notes) => api.put(`/queue/tickets/${ticketId}/complete`, { notes }),
  recall: (ticketId) => api.put(`/queue/tickets/${ticketId}/recall`),
  skip: (ticketId, reason) => api.put(`/queue/tickets/${ticketId}/skip`, { reason }),
  noShow: (ticketId) => api.put(`/queue/tickets/${ticketId}/no-show`),
  transfer: (ticketId, to_dept_id, reason, staff_id) =>
    api.post(`/queue/tickets/${ticketId}/transfer`, { to_dept_id, reason, staff_id })
};

export const userAPI = {
  getAll: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  deactivate: (id) => api.delete(`/users/${id}`)
};

export const adminAPI = {
  getSettings: () => api.get('/admin/settings'),
  saveSettings: (data) => api.put('/admin/settings', data),
  getDepartments: () => api.get('/admin/departments'),
  createDepartment: (data) => api.post('/admin/departments', data),
  updateDepartment: (id, data) => api.put(`/admin/departments/${id}`, data),
  getUsers: () => api.get('/admin/users'),
  createUser: (data) => api.post('/admin/users', data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  getAnnouncements: () => api.get('/admin/announcements'),
  createAnnouncement: (data) => api.post('/admin/announcements', data),
  updateAnnouncement: (id, data) => api.put(`/admin/announcements/${id}`, data),
  deleteAnnouncement: (id) => api.delete(`/admin/announcements/${id}`)
};

export default api;
