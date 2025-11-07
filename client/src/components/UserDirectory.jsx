import React, { useState, useEffect } from 'react';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export default function UserDirectory({ onSelect, onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('chatToken');
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(`${SOCKET_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load users');

      const data = await res.json();
      // Filter out current user
      const currentUser = JSON.parse(localStorage.getItem('chatUser') || '{}');
      setUsers(data.filter(u => String(u.id) !== String(currentUser.id)));
    } catch (err) {
      console.error('loadUsers error:', err);
      setError(err.message || 'Could not load users');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="user-directory-modal">
      <div className="user-directory">
        <header>
          <h3>Start Private Chat</h3>
          <button className="close" onClick={onClose}>×</button>
        </header>

        <div className="search">
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {error ? (
          <div className="error">{error}</div>
        ) : loading ? (
          <div className="loading">Loading users...</div>
        ) : (
          <div className="users-list">
            {filteredUsers.length === 0 ? (
              <div className="no-results">No users found</div>
            ) : (
              filteredUsers.map(user => (
                <div
                  key={user.id}
                  className="user-item"
                  onClick={() => onSelect(user)}
                >
                  <div className="avatar">
                    {user.profileImage ? (
                      <img src={user.profileImage} alt={user.username} />
                    ) : (
                      <div className="avatar-placeholder">
                        {user.username[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="user-info">
                    <div className="username">{user.username}</div>
                    <div className="status">{user.status}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <style>{`
        .user-directory-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .user-directory {
          background: white;
          border-radius: 8px;
          width: 90%;
          max-width: 400px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
        }

        header {
          padding: 16px;
          border-bottom: 1px solid #eee;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        h3 {
          margin: 0;
        }

        .close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 0 8px;
        }

        .search {
          padding: 16px;
          border-bottom: 1px solid #eee;
        }

        .search input {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .users-list {
          overflow-y: auto;
          padding: 16px;
        }

        .user-item {
          display: flex;
          align-items: center;
          padding: 8px;
          cursor: pointer;
          border-radius: 4px;
        }

        .user-item:hover {
          background: #f5f5f5;
        }

        .avatar {
          width: 40px;
          height: 40px;
          border-radius: 20px;
          margin-right: 12px;
          overflow: hidden;
        }

        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .avatar-placeholder {
          width: 100%;
          height: 100%;
          background: #ddd;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: #666;
        }

        .user-info {
          flex: 1;
        }

        .username {
          font-weight: 500;
        }

        .status {
          font-size: 12px;
          color: #666;
        }

        .error {
          padding: 16px;
          color: red;
        }

        .loading,
        .no-results {
          padding: 16px;
          text-align: center;
          color: #666;
        }
      `}</style>
    </div>
  );
}