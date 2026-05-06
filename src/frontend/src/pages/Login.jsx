import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../lib/api';
import useAuthStore from '../store/useAuthStore';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const login = useAuthStore(state => state.login);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const res = await authAPI.login(username, password);
      login(res.data.user, res.data.token);
      const { role, department_id } = res.data.user;
      if (role === 'super_admin' || role === 'admin' || role === 'reception') {
        navigate('/home');
      } else if (department_id) {
        navigate('/queue');
      } else {
        navigate('/home');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-3xl font-bold text-navy mb-6 text-center">SchoolQ Login</h1>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-navy"
              required
            />
          </div>

          {error && <p className="text-red-500 mb-4 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full bg-navy text-white py-3 rounded-lg hover:bg-opacity-90 font-semibold"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
