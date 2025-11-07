// socket.js - Socket.io client setup

import { io } from 'socket.io-client';
import { useEffect, useState } from 'react';

// Socket.io connection URL
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

// Create socket instance with auth
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  auth: {
    token: localStorage.getItem('chatToken')
  },
  transports: ['websocket', 'polling'] // Try WebSocket first, fallback to polling
});

// Custom hook for using socket.io
export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [lastMessage, setLastMessage] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [rooms, setRooms] = useState([]);

  // Login and connect
  const login = async (username, password) => {
    try {
      const response = await fetch(`${SOCKET_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include'  // Include cookies if needed
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }

      const { token, user } = await response.json();
      localStorage.setItem('chatToken', token);
      localStorage.setItem('chatUser', JSON.stringify(user));

      // Update socket auth
      socket.auth = { token };
      
      return new Promise((resolve, reject) => {
        // Connect with timeout
        socket.connect();
        
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);

        socket.once('connect', () => {
          clearTimeout(timeout);
          resolve(user);
        });

        socket.once('connect_error', (error) => {
          clearTimeout(timeout);
          reject(new Error(error.message));
        });
      });
    } catch (error) {
      console.error('Login error:', error);
      socket.disconnect();
      localStorage.removeItem('chatToken');
      localStorage.removeItem('chatUser');
      throw error;
    }
  };

  // Connect to socket server (requires login first)
  const connect = () => {
    if (!localStorage.getItem('chatToken')) {
      throw new Error('Login required');
    }
    socket.connect();
  };

  // Disconnect and logout
  const disconnect = () => {
    socket.disconnect();
    localStorage.removeItem('chatToken');
    localStorage.removeItem('chatUser');
  };

  // Send a message
  const sendMessage = (message, options = {}, cb) => {
    // options: { room }
    socket.emit('send_message', { message, room: options.room }, (ack) => {
      if (cb) cb(ack);
    });
  };

  // Send a private message
  const sendPrivateMessage = (toUserId, message, cb) => {
    // toUserId should be the recipient's user id (not socket id)
    socket.emit('private_message', { to: toUserId, message }, (ack) => {
      if (cb) cb(ack);
    });
  };

  // Set typing status
  const setTyping = (isTyping) => {
    socket.emit('typing', isTyping);
  };

  // Socket event listeners
  useEffect(() => {
    // Connection events
    const onConnect = () => {
      setIsConnected(true);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onReconnect = (attemptNumber) => {
      // Re-set auth in case token changed
      const token = localStorage.getItem('chatToken');
      if (token) socket.auth = { token };
      setIsConnected(true);
      // Re-fetch rooms and user list after reconnect
      fetchRooms().catch(() => {});
    };

    const onReconnectFailed = () => {
      console.warn('Socket reconnection failed');
    };

    // Message events
    const onReceiveMessage = (message) => {
      setLastMessage(message);
      setMessages((prev) => [...prev, message]);
    };

    const onPrivateMessage = (message) => {
      setLastMessage(message);
      setMessages((prev) => [...prev, message]);
    };

    // User events
    const onUserList = (userList) => {
      setUsers(userList);
    };

    const onUserJoined = (user) => {
      // You could add a system message here
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          system: true,
          message: `${user.username} joined the chat`,
          timestamp: new Date().toISOString(),
        },
      ]);
    };

    const onUserLeft = (user) => {
      // You could add a system message here
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          system: true,
          message: `${user.username} left the chat`,
          timestamp: new Date().toISOString(),
        },
      ]);
    };

    const onUserUpdated = (payload) => {
      setUsers((prev) => prev.map(u => (u.socketId === payload.id || u.id === payload.id ? { ...u, username: payload.username } : u)));
    };

    // Typing events
    const onTypingUsers = (users) => {
      setTypingUsers(users);
    };

    // Room and file events
    const onRoomMessage = (message) => {
      setMessages((prev) => [...prev, message]);
    };

    const onRoomFile = (fileMessage) => {
      setMessages((prev) => [...prev, fileMessage]);
    };

    const onMessageUpdated = (message) => {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? message : m)));
    };

    const onRoomCreated = (room) => {
      setRooms((prev) => {
        // avoid duplicates
        if (prev.find(r => String(r._id || r.id) === String(room._id || room.id))) return prev;
        return [...prev, room];
      });
    };

    // Register event listeners
    socket.on('connect', onConnect);
  socket.on('reconnect', onReconnect);
  socket.on('reconnect_failed', onReconnectFailed);
    socket.on('disconnect', onDisconnect);
    socket.on('receive_message', onReceiveMessage);
    socket.on('private_message', onPrivateMessage);
    socket.on('user_list', onUserList);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
  socket.on('user_updated', onUserUpdated);
    socket.on('typing_users', onTypingUsers);
  socket.on('room_message', onRoomMessage);
  socket.on('room_file', onRoomFile);
  socket.on('message_updated', onMessageUpdated);
  socket.on('room_created', onRoomCreated);

    // Clean up event listeners
    return () => {
      socket.off('connect', onConnect);
      socket.off('reconnect', onReconnect);
      socket.off('reconnect_failed', onReconnectFailed);
      socket.off('disconnect', onDisconnect);
      socket.off('receive_message', onReceiveMessage);
      socket.off('private_message', onPrivateMessage);
      socket.off('user_list', onUserList);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
  socket.off('user_updated', onUserUpdated);
      socket.off('typing_users', onTypingUsers);
      socket.off('room_message', onRoomMessage);
      socket.off('room_file', onRoomFile);
      socket.off('message_updated', onMessageUpdated);
      socket.off('room_created', onRoomCreated);
    };
  }, []);

  // Fetch messages (pagination helper) - can be used to load older messages
  const fetchMessages = async ({ room, before, limit = 50 } = {}) => {
    try {
      const token = localStorage.getItem('chatToken');
      const params = new URLSearchParams();
      if (room) params.set('room', room);
      if (before) params.set('before', before);
      if (limit) params.set('limit', String(limit));
      const res = await fetch(`${SOCKET_URL}/api/messages?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to fetch messages');
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('fetchMessages error', err);
      return [];
    }
  };

  // Fetch private messages with pagination
  const fetchPrivateMessages = async (otherId, { before, limit = 50 } = {}) => {
    try {
      const token = localStorage.getItem('chatToken');
      const params = new URLSearchParams();
      if (before) params.set('before', before);
      if (limit) params.set('limit', String(limit));
      const res = await fetch(`${SOCKET_URL}/api/messages/private/${otherId}?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to fetch private messages');
      const data = await res.json();
      return data;
    } catch (err) {
      console.error('fetchPrivateMessages error', err);
      return [];
    }
  };

  // Search messages
  const searchMessages = async (q, { limit = 50 } = {}) => {
    try {
      const token = localStorage.getItem('chatToken');
      const params = new URLSearchParams();
      params.set('q', q);
      params.set('limit', String(limit));
      const res = await fetch(`${SOCKET_URL}/api/messages/search?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Search failed');
      return await res.json();
    } catch (err) {
      console.error('searchMessages error', err);
      return [];
    }
  };

  // Update user status
  const setStatus = (status) => {
    socket.emit('status_change', status);
  };

  // Rooms
  const joinRoom = (room, cb) => {
    socket.emit('join_room', room, (ack) => {
      if (cb) cb(ack);
    });
  };

  const leaveRoom = (room) => {
    socket.emit('leave_room', room);
  };

  const sendRoomMessage = (room, message, cb) => {
    socket.emit('send_room_message', { room, message }, (ack) => {
      if (cb) cb(ack);
    });
  };

  // Rooms: create and fetch
  const fetchRooms = async () => {
    try {
      const token = localStorage.getItem('chatToken');
      const res = await fetch(`${SOCKET_URL}/api/rooms`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch rooms');
      const data = await res.json();
      setRooms(data);
      return data;
    } catch (err) {
      console.error('fetchRooms error', err);
      return [];
    }
  };

  const createRoom = async (name) => {
    try {
      // prefer API call (returns created room)
      const token = localStorage.getItem('chatToken');
      const res = await fetch(`${SOCKET_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name })
      });
      if (res.status === 409) throw new Error('Room already exists');
      if (!res.ok) throw new Error('Failed to create room');
      const room = await res.json();
      setRooms((prev) => [...prev, room]);
      return room;
    } catch (err) {
      console.error('createRoom error', err);
      // fallback: emit socket event
      socket.emit('create_room', { name });
      throw err;
    }
  };

  // Send file (base64 data)
  const sendFile = (opts, cb) => {
    // opts: { room?, fileName, fileType, data }
    socket.emit('send_file', opts, (ack) => {
      if (cb) cb(ack);
    });
  };

  // Read receipts
  const markMessageRead = (messageId) => {
    socket.emit('message_read', { messageId });
  };

  // Reactions
  const reactToMessage = (messageId, reaction) => {
    socket.emit('message_reaction', { messageId, reaction });
  };

  return {
    socket,
    isConnected,
    lastMessage,
    messages,
    users,
    typingUsers,
    login,
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
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
  };
};

export default socket; 