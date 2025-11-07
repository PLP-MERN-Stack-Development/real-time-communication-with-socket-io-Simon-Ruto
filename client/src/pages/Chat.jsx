import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../socket/socket';
import './Chat.css';

const Chat = () => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const { socket, currentUser } = useSocket();
  const messagesEndRef = useRef(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadMessages = async (pageNum = 1) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/messages?page=${pageNum}&limit=50`);
      const data = await response.json();
      
      if (pageNum === 1) {
        setMessages(data.messages);
      } else {
        setMessages(prev => [...data.messages, ...prev]);
      }
      
      setHasMore(data.messages.length === 50);
      setLoading(false);
    } catch (error) {
      console.error('Error loading messages:', error);
      setLoading(false);
    }
  };

  const loadMoreMessages = () => {
    if (!hasMore || loading) return;
    setPage(prev => prev + 1);
    loadMessages(page + 1);
  };

  useEffect(() => {
    if (!socket) return;
    
    loadMessages();

    socket.on('receive_message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    return () => {
      socket.off('receive_message');
    };
  }, [socket]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const messageData = {
      body: newMessage,
      sender: currentUser?.username,
      timestamp: new Date().toISOString()
    };

    socket.emit('message', messageData, (ack) => {
      if (ack.status === 'ok') {
        setMessages(prev => [...prev, { ...messageData, id: ack.messageId }]);
      }
    });

    setNewMessage('');
  };

  const [selectedFile, setSelectedFile] = useState(null);

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        socket.emit('message', {
          type: 'file',
          fileName: selectedFile.name,
          fileUrl: data.fileUrl,
          sender: currentUser?.username,
          timestamp: new Date().toISOString()
        });
        setSelectedFile(null);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  };

  return (
    <div className="chat">
      <div className="chat-header">
        <h2>Chat Room</h2>
        <div className="chat-actions">
          {/* Add any additional actions here */}
        </div>
      </div>

      <div className="messages">
        {loading ? (
          <div className="loading">Loading messages...</div>
        ) : (
          <>
            {hasMore && (
              <button 
                className="load-more" 
                onClick={loadMoreMessages}
                disabled={loading}
              >
                Load More Messages
              </button>
            )}
            {messages.map((message, index) => (
              <div 
                key={message.id || index}
                className={`message ${message.sender === currentUser?.username ? 'outgoing' : ''} ${message.type === 'system' ? 'system' : ''}`}
              >
                <div className="meta">
                  <span className="sender">{message.sender}</span>
                  <span className="time">
                    {new Date(message.timestamp || message.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="body">
                  {message.type === 'file' ? (
                    <a href={message.fileUrl} target="_blank" rel="noopener noreferrer">
                      📎 {message.fileName}
                    </a>
                  ) : (
                    message.content || message.body
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="file-upload">
        <label htmlFor="file-upload" className="custom-file-upload">
          📎 Choose File
        </label>
        <input
          id="file-upload"
          type="file"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        {selectedFile && (
          <>
            <span>{selectedFile.name}</span>
            <button onClick={handleFileUpload}>Upload</button>
          </>
        )}
      </div>

      <form onSubmit={sendMessage} className="composer">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit" disabled={!newMessage.trim()}>Send</button>
      </form>
    </div>
  );
};

export default Chat;