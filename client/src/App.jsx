import { useEffect, useRef, useState } from 'react';
import './App.css';
import { useSocket } from './socket/socket';
import { NotificationProvider, useNotifications } from './context/NotificationContext';
import UserProfile from './components/UserProfile';
import RegisterPage from './pages/Register';
import UserDirectory from './components/UserDirectory';

function AppContent() {
  const {
    login,
    connect,
    disconnect,
    isConnected,
    socket,
    sendMessage,
    sendPrivateMessage,
    lastMessage,
    messages,
    users,
    typingUsers,
    setTyping,
    setStatus,
    joinRoom,
    leaveRoom,
    sendRoomMessage,
    sendFile,
    markMessageRead,
    reactToMessage,
    rooms,
    fetchRooms,
    createRoom,
    fetchMessages,
    fetchPrivateMessages,
    searchMessages,
  } = useSocket();

  const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

  // Threads / private conversations
  const [threads, setThreads] = useState([]);
  const [currentThread, setCurrentThread] = useState(null); // { otherId, otherName }
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadInput, setThreadInput] = useState('');

  const fetchThreads = async () => {
    try {
      const token = localStorage.getItem('chatToken');
      if (!token) return;
      const res = await fetch(`${SOCKET_URL}/api/auth/profile`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      // threads: [{ otherId, lastMessage }]
      setThreads(data.threads || []);
    } catch (err) {
      console.error('fetchThreads error', err);
    }
  };

  useEffect(() => {
    if (isConnected) fetchThreads();
  }, [isConnected]);

  // Load older messages for current room
  const loadOlderMessages = async () => {
    try {
      const roomName = room || 'general';
      // find earliest message for this room
      const earliest = messages.find(m => (m.room || 'general') === roomName) || messages[0];
      const before = earliest?.id || earliest?._id || earliest?.timestamp;
      const older = await fetchMessages({ room: roomName, before, limit: 50 });
      if (Array.isArray(older) && older.length > 0) {
        // server returns newest-first; reverse to chronological and prepend
        setMessages((prev) => [...older.reverse(), ...prev]);
      }
    } catch (err) {
      console.error('loadOlderMessages error', err);
    }
  };

  const loadOlderThreadMessages = async () => {
    if (!currentThread) return;
    try {
      const earliest = threadMessages[0];
      const before = earliest?.id || earliest?._id || earliest?.timestamp;
      const older = await fetchPrivateMessages(currentThread.otherId, { before, limit: 50 });
      if (Array.isArray(older) && older.length > 0) {
        setThreadMessages((prev) => [...older, ...prev]);
      }
    } catch (err) {
      console.error('loadOlderThreadMessages error', err);
    }
  };

  const openThread = async (otherId, otherName) => {
    try {
      const token = localStorage.getItem('chatToken');
      const res = await fetch(`${SOCKET_URL}/api/messages/private/${otherId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load thread');
      const msgs = await res.json();
      setThreadMessages(msgs.map(m => ({ ...m, id: m._id, message: m.content, timestamp: m.createdAt })));
      setCurrentThread({ otherId, otherName });
    } catch (err) {
      console.error('openThread error', err);
    }
  };

  const sendThreadMessage = async () => {
    if (!currentThread || !threadInput.trim()) return;
    try {
      // Optimistically append with a temp id so UI is responsive
      const u = JSON.parse(localStorage.getItem('chatUser') || '{}');
      const tempId = `temp-${Date.now()}`;
      const newMsg = {
        id: tempId,
        sender: u.username,
        senderId: u.id,
        content: threadInput.trim(),
        message: threadInput.trim(),
        timestamp: new Date().toISOString(),
        isPrivate: true
      };
      setThreadMessages((prev) => [...prev, newMsg]);

      // Emit via socket with ACK to convert temp id to server id when saved
      sendPrivateMessage(currentThread.otherId, threadInput.trim(), (ack) => {
        if (ack && ack.ok && ack.id) {
          setThreadMessages((prev) => prev.map(m => m.id === tempId ? { ...m, id: ack.id, timestamp: ack.timestamp || m.timestamp } : m));
        } else {
          // Optionally mark message as failed
          setThreadMessages((prev) => prev.map(m => m.id === tempId ? { ...m, failed: true } : m));
        }
      });

      setThreadInput('');
      // refresh threads list
      fetchThreads();
    } catch (err) {
      console.error('sendThreadMessage error', err);
    }
  };

  // Don't render notifications until socket is connected
  const shouldRenderNotifications = isConnected && socket;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showUserDirectory, setShowUserDirectory] = useState(false);
  const [room, setRoom] = useState('');
  const [file, setFile] = useState(null);
  const messagesEndRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    // load rooms when connected
    if (isConnected) {
      fetchRooms().catch(() => {});
    }
  }, [isConnected]);

  useEffect(() => {
    // Auto-scroll to bottom when messages change
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Append incoming private messages to open thread if applicable
  useEffect(() => {
    if (!lastMessage || !lastMessage.isPrivate || !currentThread) return;
    const otherId = currentThread.otherId;
    if (String(lastMessage.senderId) === String(otherId) || String(lastMessage.recipient) === String(otherId)) {
      setThreadMessages((prev) => [...prev, { ...lastMessage, id: lastMessage.id || lastMessage._id, message: lastMessage.message || lastMessage.content }]);
    }
  }, [lastMessage, currentThread]);

  const handleLogin = async () => {
    if (!username.trim()) return;
    try {
      setError('');
      await login(username.trim(), password);
      connect();
      setStatus('online');
    } catch (err) {
      setError('Login failed: ' + err.message);
    }
  };

  const handleDisconnect = () => {
    setStatus('offline');
    disconnect();
  };

  const handleSend = (e) => {
    e?.preventDefault();
    if (!message.trim()) return;
    if (room) sendRoomMessage(room, message.trim());
    else sendMessage(message.trim());
    setMessage('');
    setTyping(false);
  };

  const { resetUnreadCount, getUnreadCount } = useNotifications();

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!room.trim()) return;
    joinRoom(room);
    resetUnreadCount(room);
  };  const handleLeaveRoom = () => {
    if (!room.trim()) return;
    leaveRoom(room.trim());
    setRoom('');
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    setFile(f || null);
  };

  const handleSendFile = async () => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result.split(',')[1]; // base64
      sendFile({ room: room || null, fileName: file.name, fileType: file.type, data });
      setFile(null);
    };
    reader.readAsDataURL(file);
  };

  const handleMarkRead = (m) => {
    if (m && m.id) markMessageRead(m.id);
  };

  const handleReact = (m, reaction) => {
    if (m && m.id) reactToMessage(m.id, reaction);
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <h1>Socket.io Chat (Demo)</h1>
        <div className="status">Status: {isConnected ? 'Connected' : 'Disconnected'}</div>
      </header>

      <section className="controls">
        {error && <div className="error">{error}</div>}
        <div className="login-form">
          <input
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isConnected}
          />
          <input
            type="password"
            placeholder="Password (optional)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isConnected}
          />
        </div>
        {!isConnected ? (
          <>
            <button onClick={handleLogin} disabled={!username.trim()}>
              Login & Join
            </button>
            <button onClick={() => setShowRegister(true)}>Create account</button>
          </>
        ) : (
          <>
            <button onClick={handleDisconnect}>Logout</button>
            <button onClick={() => setShowProfile(true)}>Profile</button>
            <div style={{ display: 'inline-flex', marginLeft: 8 }}>
              <input placeholder="Search messages..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              <button onClick={async () => {
                if (!searchQuery.trim()) return;
                const results = await searchMessages(searchQuery.trim());
                setSearchResults(results);
                setShowSearch(true);
              }} style={{ marginLeft: 8 }}>Search</button>
            </div>
          </>
        )}
      </section>

      <main className="chat-container">
        <aside className="sidebar">
          <div className="profile">
            <div className="avatar">{JSON.parse(localStorage.getItem('chatUser') || '{}').username?.[0] || 'U'}</div>
            <div className="profile-info">
              <strong>{JSON.parse(localStorage.getItem('chatUser') || '{}').username || 'Guest'}</strong>
              <button onClick={() => setShowProfile(true)}>Edit</button>
            </div>
          </div>

          <div className="room-creation">
            <input placeholder="Create room" value={room} onChange={(e) => setRoom(e.target.value)} />
            <button onClick={async () => {
              if (!room.trim()) return;
              try {
                await createRoom(room.trim());
                setRoom('');
              } catch (err) {
                alert(err.message || 'Could not create room');
              }
            }}>Create</button>
          </div>

          {/* Pinned room: General (always present and pinned) */}
          <div className="rooms-panel">
            <h4>Pinned</h4>
            <ul>
              <li
                key="general"
                className={`room-item pinned ${room === 'general' ? 'active' : ''}`}
                onClick={() => {
                  setRoom('general');
                  joinRoom('general');
                  resetUnreadCount('general');
                  setCurrentThread(null); // Close private chat if open
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.2em' }}>#</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold' }}>General</div>
                    <div style={{ fontSize: '0.8em', color: '#666' }}>
                      {getUnreadCount('general') > 0 ? `${getUnreadCount('general')} unread` : 'Public chat — pinned'}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.75em', color: '#2196f3', fontWeight: 600 }}>Pinned</div>
                </div>
              </li>
            </ul>
          </div>

          {/* Custom rooms created by users (listed below the pinned room) */}
          <div className="rooms-list">
            <h4>Other Rooms</h4>
            <ul>
              {Array.isArray(rooms) ? rooms
                .filter(r => String(r.name).toLowerCase() !== 'general')
                .map((r) => (
                <li
                  key={r._id || r.id}
                  className={`room-item ${room === r.name ? 'active' : ''}`}
                  onClick={() => {
                    setRoom(r.name);
                    joinRoom(r.name);
                    resetUnreadCount(r.name);
                    setCurrentThread(null); // Close private chat if open
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2em' }}>#</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold' }}>{r.name}</div>
                      <div style={{ fontSize: '0.8em', color: '#666' }}>
                        {getUnreadCount(r.name) > 0 ? `${getUnreadCount(r.name)} unread` : 'Chat room'}
                      </div>
                    </div>
                  </div>
                </li>
              )) : null}
            </ul>
          </div>

          <div className="private-list">
            <h4>Private Chats</h4>
            <ul>
              {Array.isArray(threads) && threads.length > 0 ? (
                threads.map((t) => (
                  <li 
                    key={t.otherId} 
                    className={`private-item ${currentThread?.otherId === t.otherId ? 'active' : ''}`} 
                    onClick={() => {
                      openThread(t.otherId, t.lastMessage?.sender || 'Private');
                      setRoom(''); // Close room chat if open
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="avatar" style={{ width: '32px', height: '32px', fontSize: '0.9em' }}>
                        {t.lastMessage?.sender?.[0] || 'U'}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                          {t.lastMessage?.sender || 'User'}
                        </div>
                        <div style={{ 
                          fontSize: '0.8em', 
                          color: '#666',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {t.lastMessage?.content || t.lastMessage?.message || 'No messages yet'}
                        </div>
                      </div>
                    </div>
                  </li>
                ))
              ) : (
                <li className="private-item" style={{ textAlign: 'center', color: '#666' }}>
                  No private chats yet
                </li>
              )}
            </ul>
            <div style={{ marginTop: 16, padding: '0 8px' }}>
              <button 
                onClick={() => setShowUserDirectory(true)}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: '#2196f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '20px',
                  cursor: 'pointer'
                }}
              >
                Start New Private Chat
              </button>
            </div>
          </div>
        </aside>

        <section className="chat">
          {currentThread ? (
            <div className="thread-view">
              <h3>Chat with {currentThread.otherName || currentThread.otherId}</h3>
                <div style={{ padding: '8px 16px' }}>
                  <button onClick={loadOlderThreadMessages} style={{ marginBottom: 8 }}>Load earlier messages</button>
                </div>
                <div className="messages">
                {threadMessages.map((m) => (
                  <div key={m.id || m._id} className="message">
                    <div className="meta"><strong>{m.sender}</strong> <span className="time">{new Date(m.timestamp).toLocaleTimeString()}</span></div>
                    <div className="body">{m.message || m.content}</div>
                  </div>
                ))}
              </div>
              <div className="composer">
                <input placeholder="Type a private message..." value={threadInput} onChange={(e) => setThreadInput(e.target.value)} />
                <button onClick={sendThreadMessage} disabled={!threadInput.trim()}>Send</button>
                <button onClick={() => { setCurrentThread(null); setThreadMessages([]); }}>Close</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ padding: '8px 16px' }}>
                <button onClick={loadOlderMessages} style={{ marginBottom: 8 }}>Load earlier messages</button>
              </div>
              <div className="messages">
                {messages.map((m) => {
                  const currentUser = JSON.parse(localStorage.getItem('chatUser') || '{}');
                  const isOwnMessage = currentUser.username === m.sender;
                  
                  return (
                    <div
                      key={m.id}
                      className={`message ${m.system ? 'system' : ''} ${isOwnMessage ? 'own' : ''}`}
                      onClick={() => handleMarkRead(m)}
                      style={{
                        alignSelf: isOwnMessage ? 'flex-end' : 'flex-start',
                        backgroundColor: m.system ? '#e8f5e9' : isOwnMessage ? '#e3f2fd' : '#f5f5f5',
                        borderRadius: '12px',
                        maxWidth: '70%'
                      }}
                    >
                      {m.system ? (
                        <em>{m.message}</em>
                      ) : (
                        <>
                          <div className="meta" style={{ marginBottom: '4px' }}>
                            <strong style={{ color: isOwnMessage ? '#1976d2' : '#333' }}>
                              {isOwnMessage ? 'You' : m.sender}
                            </strong>
                            <span className="time" style={{ fontSize: '0.8em', color: '#666', marginLeft: '8px' }}>
                              {new Date(m.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="body" style={{ wordBreak: 'break-word' }}>
                            {m.isFile ? (
                              m.fileType?.startsWith('image/') ? (
                                <div style={{ position: 'relative' }}>
                                  <img 
                                    src={`data:${m.fileType};base64,${m.data}`} 
                                    alt={m.fileName} 
                                    style={{ 
                                      maxWidth: '100%',
                                      borderRadius: '8px',
                                      border: '1px solid #eee'
                                    }} 
                                  />
                                  <div style={{ fontSize: '0.8em', color: '#666', marginTop: '4px' }}>
                                    {m.fileName}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ 
                                  padding: '8px', 
                                  background: '#fff', 
                                  borderRadius: '4px',
                                  border: '1px solid #eee'
                                }}>
                                  <a 
                                    href={`data:${m.fileType};base64,${m.data}`} 
                                    download={m.fileName}
                                    style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '8px',
                                      color: '#2196f3',
                                      textDecoration: 'none'
                                    }}
                                  >
                                    📎 {m.fileName}
                                  </a>
                                </div>
                              )
                            ) : (
                              // server stores message text in `content`; older code used `message`
                              m.content || m.message || m.body
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}

                <div ref={messagesEndRef} />
              </div>

              <div className="typing" style={{ padding: '0.5rem 1rem', minHeight: '24px' }}>
                {typingUsers.length > 0 && (
                  <small style={{ color: '#666', fontStyle: 'italic' }}>
                    {typingUsers.join(', ')} typing...
                  </small>
                )}
              </div>

              <form className="composer" onSubmit={handleSend}>
                <input
                  placeholder="Type a message..."
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setTyping(e.target.value.length > 0);
                  }}
                  disabled={!isConnected}
                />
                <button type="submit" disabled={!isConnected || !message.trim()}>
                  Send
                </button>
              </form>
              <div className="file-share">
                <label htmlFor="file-input" className="choose-file">📎 Choose File</label>
                <input id="file-input" type="file" onChange={handleFileChange} style={{ display: 'none' }} />
                <div className="file-name">{file ? file.name : 'No file chosen'}</div>
                <button className="send-file-btn" onClick={handleSendFile} disabled={!file}>Send file</button>
              </div>
            </>
          )}
        </section>
      </main>
      {/* Register modal */}
      {showRegister && (
        <div className="modal">
          <div className="modal-content">
            <button className="close" onClick={() => setShowRegister(false)}>Close</button>
            <RegisterPage onRegister={async () => { setShowRegister(false); try { await connect(); setStatus('online'); } catch (e) {} }} />
          </div>
        </div>
      )}

      {/* Profile modal */}
      {showProfile && (
        <div className="modal">
          <div className="modal-content">
            <button className="close" onClick={() => setShowProfile(false)}>Close</button>
            <UserProfile onUpdated={() => { setShowProfile(false); try { socket.emit('update_profile', { username: JSON.parse(localStorage.getItem('chatUser') || '{}').username }); } catch (e) {} }} />
          </div>
        </div>
      )}

      {/* User Directory modal */}
      {showUserDirectory && (
        <div className="modal">
          <div className="modal-content">
            <button className="close" onClick={() => setShowUserDirectory(false)}>Close</button>
            <UserDirectory 
              onSelect={(user) => {
                openThread(user.id, user.username);
                setShowUserDirectory(false);
              }}
              onClose={() => setShowUserDirectory(false)} 
            />
          </div>
        </div>
      )}

      {/* Search results modal */}
      {showSearch && (
        <div className="modal">
          <div className="modal-content">
            <button className="close" onClick={() => setShowSearch(false)}>Close</button>
            <h3>Search results for "{searchQuery}"</h3>
            <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: 8 }}>
              {Array.isArray(searchResults) && searchResults.length > 0 ? (
                searchResults.map(r => (
                  <div key={r._id} className="message" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => { setShowSearch(false); /* TODO: jump to message */ }}>
                    <div style={{ fontSize: '0.85em', color: '#666' }}>{r.sender} · {new Date(r.createdAt).toLocaleString()}</div>
                    <div style={{ fontWeight: 500 }}>{r.content}</div>
                  </div>
                ))
              ) : (
                <div style={{ padding: 16 }}>No results</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
}

export default App;
