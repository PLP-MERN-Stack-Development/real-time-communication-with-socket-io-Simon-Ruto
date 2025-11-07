import React, { createContext, useContext, useState, useEffect } from 'react';
import { useSocket } from '../socket/socket';
import { handleNotification, requestNotificationPermission } from '../utils/notifications';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const { socket, isConnected } = useSocket();
  const [unreadCounts, setUnreadCounts] = useState({});
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Request notification permission on mount
    requestNotificationPermission().then(granted => {
      setHasNotificationPermission(granted);
    });
  }, []);

  // Reset unread count for a room
  const resetUnreadCount = (roomId = 'general') => {
    setUnreadCounts(prev => ({
      ...prev,
      [roomId]: 0
    }));
  };

  // Increment unread count for a room
  const incrementUnreadCount = (roomId = 'general') => {
    setUnreadCounts(prev => ({
      ...prev,
      [roomId]: (prev[roomId] || 0) + 1
    }));
  };

  // Get unread count for a room
  const getUnreadCount = (roomId = 'general') => {
    return unreadCounts[roomId] || 0;
  };

  useEffect(() => {
    // Early return if socket is not available or not connected
    if (!socket?.on) return;

    const handleMessage = (message) => {
      // Don't notify for own messages
      if (message.senderId === socket.id) return;

      incrementUnreadCount(message.room);
      handleNotification({
        title: `New message from ${message.sender}`,
        body: message.isFile ? 'Sent a file' : message.content || message.message
      });
    };

    // Listen for new messages
    socket.on('receive_message', handleMessage);

    // Listen for private messages
    const handlePrivateMessage = (message) => {
      if (message.senderId === socket.id) return;

      incrementUnreadCount(`private_${message.senderId}`);
      handleNotification({
        title: `Private message from ${message.sender}`,
        body: message.message
      });
    };

    // Listen for room messages
    const handleRoomMessage = (message) => {
      if (message.senderId === socket.id) return;

      incrementUnreadCount(message.room);
      handleNotification({
        title: `New message in ${message.room}`,
        body: `${message.sender}: ${message.message}`
      });
    };

    // Listen for user join/leave events
    const handleRoomUserJoined = ({ room, username }) => {
      handleNotification({
        title: `${room} Room`,
        body: `${username} joined the room`,
        sound: false
      });
    };

    const handleRoomUserLeft = ({ room, username }) => {
      handleNotification({
        title: `${room} Room`,
        body: `${username} left the room`,
        sound: false
      });
    };

    const handleUserJoined = ({ username }) => {
      handleNotification({
        title: 'Chat App',
        body: `${username} joined the chat`,
        sound: false
      });
    };

    const handleUserLeft = ({ username }) => {
      handleNotification({
        title: 'Chat App',
        body: `${username} left the chat`,
        sound: false
      });
    };

    // Register all event listeners
    socket.on('private_message', handlePrivateMessage);
    socket.on('room_message', handleRoomMessage);
    socket.on('room_user_joined', handleRoomUserJoined);
    socket.on('room_user_left', handleRoomUserLeft);
    socket.on('user_joined', handleUserJoined);
    socket.on('user_left', handleUserLeft);

    // Cleanup function to remove all event listeners
    return () => {
      if (socket?.off) {
        socket.off('receive_message', handleMessage);
        socket.off('private_message', handlePrivateMessage);
        socket.off('room_message', handleRoomMessage);
        socket.off('room_user_joined', handleRoomUserJoined);
        socket.off('room_user_left', handleRoomUserLeft);
        socket.off('user_joined', handleUserJoined);
        socket.off('user_left', handleUserLeft);
      }
    };
  }, [socket]);

  const value = {
    unreadCounts,
    resetUnreadCount,
    getUnreadCount,
    hasNotificationPermission
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};