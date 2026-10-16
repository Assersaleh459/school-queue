// License side of the API client: tells the server which device this is (the license limits
// how many Staff devices may be connected at once), sends everyone to the "license expired"
// screen once the license is past its grace period, and the License API calls.
// Imported once from App.jsx; it adds its interceptors to the shared axios instance.
import api from './api';

// Staff app: the PC's Machine ID and name. Browser: a random id kept in this browser.
let device = null;
function deviceHeaders() {
  if (!device) {
    const info = window.electronAPI?.deviceInfo?.();
    if (info?.id) {
      device = { id: info.id, name: info.name || 'Staff PC', kind: 'staff' };
    } else {
      let id = null;
      try { id = localStorage.getItem('schoolq_device'); } catch { /* storage blocked */ }
      if (!id) {
        id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
        try { localStorage.setItem('schoolq_device', id); } catch { /* storage blocked */ }
      }
      const ua = navigator.userAgent;
      const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
      const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'Mac' : '';
      device = { id, name: `${browser}${os ? ` · ${os}` : ''}`, kind: 'browser' };
    }
  }
  return {
    'X-SchoolQ-Device': device.id,
    'X-SchoolQ-Device-Name': encodeURIComponent(device.name),
    'X-SchoolQ-Device-Kind': device.kind,
  };
}

api.interceptors.request.use((config) => {
  Object.assign(config.headers, deviceHeaders());
  return config;
});

api.interceptors.response.use(res => res, (err) => {
  if (err.response?.status === 402 && err.response.data?.code === 'license_expired' && window.location.pathname !== '/license-expired') {
    window.location.href = '/license-expired';
  }
  return Promise.reject(err);
});

export const licenseAPI = {
  get:     ()    => api.get('/license'),
  status:  ()    => api.get('/license/status'),
  devices: ()    => api.get('/license/devices'),
  revoke:  (id)  => api.post(`/license/devices/${encodeURIComponent(id)}/revoke`),
  expired: ()    => api.get('/license/expired'),
  renew:   (key) => api.post('/license/renew', { key }),
};
