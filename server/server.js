// server.js - Main server file for Socket.io chat application

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { socketAuthMiddleware, authMiddleware } = require('./middleware/auth');
const authController = require('./controllers/authController');
const connectDB = require('./config/db');
const Message = require('./models/message');
const Room = require('./models/room');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Performance tuning
  pingInterval: 20000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6, // 1MB max payload (protects from oversized messages)
  perMessageDeflate: true
});

// Use socket auth middleware
io.use(socketAuthMiddleware);

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Import message controller
const messageController = require('./controllers/messageController');

// Message routes
app.get('/api/messages', authMiddleware, messageController.getMessages);
app.get('/api/messages/private/:otherId', authMiddleware, messageController.getPrivateMessages);

// Store connected users and messages
const connectedUsers = {};
const messages = [];
const typingUsers = {};

// Helper to broadcast enriched user list (DB users + online info)
const broadcastUserList = async () => {
  try {
    const User = require('./models/user');
    const dbUsers = await User.find().select('_id username profileImage status').lean();
    const enriched = dbUsers.map(u => {
      const onlineEntry = Object.values(connectedUsers).find(cu => String(cu.id) === String(u._id));
      return {
        id: String(u._id),
        username: u.username,
        profileImage: u.profileImage || null,
        status: onlineEntry ? 'online' : (u.status || 'offline'),
        socketId: onlineEntry ? onlineEntry.socketId : null
      };
    });
    io.emit('user_list', enriched);
  } catch (err) {
    console.error('broadcastUserList error', err);
  }
};

// Socket.io connection handler
io.on('connection', (socket) => {
  const { user } = socket;
  console.log(`User connected: ${user.username} (${socket.id})`);

  // Store user connection
  connectedUsers[socket.id] = {
    ...user,
    status: 'online',
    socketId: socket.id
  };
  
  // Emit updated user list (DB enriched)
  broadcastUserList().catch(() => {});
  io.emit('user_joined', { username: user.username, id: socket.id });
  console.log(`${user.username} joined the chat`);

  // Allow updating profile (display name)
  socket.on('update_profile', ({ username }) => {
    if (!username) return;
    if (connectedUsers[socket.id]) {
      connectedUsers[socket.id].username = username;
      broadcastUserList().catch(() => {});
      io.emit('user_updated', { id: socket.id, username });
    }
  });

  // send_message with acknowledgment (ack callback)
  socket.on('send_message', async (messageData, ack) => {
    const newMessage = new Message({
      content: messageData.message,
      sender: user.username,
      type: 'text',
      room: messageData.room || 'general',
      senderId: user.id,
      readBy: [],
      reactions: []
    });

    try {
      await newMessage.save();
      const messageToSend = {
        ...newMessage.toObject(),
        id: newMessage._id,
        senderId: user.id,
        userId: user.id,
        timestamp: newMessage.createdAt
      };

      // Emit to room or global depending on presence
      if (messageData.room) io.to(messageData.room).emit('receive_message', messageToSend);
      else io.emit('receive_message', messageToSend);

      // Call acknowledgment callback if provided
      if (typeof ack === 'function') ack({ ok: true, id: String(newMessage._id), timestamp: newMessage.createdAt });
    } catch (error) {
      console.error('Error saving message:', error);
      socket.emit('error', { message: 'Failed to save message' });
      if (typeof ack === 'function') ack({ ok: false, error: error.message });
    }
  });

  // Handle typing indicator
  socket.on('typing', (isTyping) => {
    const username = user.username;
    
    if (isTyping) {
      typingUsers[socket.id] = username;
    } else {
      delete typingUsers[socket.id];
    }
    
    io.emit('typing_users', Object.values(typingUsers));
  });

  // Handle private messages
  socket.on('private_message', async ({ to, message }, ack) => {
    console.log('[private_message] Start:', { from: user.username, fromId: user.id, to, messageText: message?.slice(0, 50) });
    try {
      const newMessage = new Message({
        content: message,
        sender: user.username,
        senderId: user.id,
        type: 'text',
        messageType: 'private',
        recipient: to,
        readBy: [],
        reactions: []
      });

      await newMessage.save();
      console.log('[private_message] Saved:', { messageId: newMessage._id });

      const messageToSend = {
        ...newMessage.toObject(),
        id: newMessage._id,
        userId: user.id,
        timestamp: newMessage.createdAt,
        isPrivate: true,
        message // for backwards compatibility
      };

      // Find recipient's socket id from connectedUsers
      const recipientSocketEntry = Object.entries(connectedUsers).find(([, u]) => String(u.id) === String(to));
      console.log('[private_message] Recipient lookup:', {
        recipientId: to,
        foundSocket: !!recipientSocketEntry,
        recipientSocketId: recipientSocketEntry ? recipientSocketEntry[0] : null,
        onlineUsers: Object.values(connectedUsers).map(u => ({ id: u.id, username: u.username }))
      });

      if (recipientSocketEntry) {
        const recipientSocketId = recipientSocketEntry[0];
        io.to(recipientSocketId).emit('private_message', messageToSend);
        console.log('[private_message] Emitted to recipient:', { recipientSocketId });
      }
      // Send back to sender as confirmation
      socket.emit('private_message', messageToSend);
      console.log('[private_message] Emitted to sender:', { senderSocketId: socket.id });

      // Debug info back to sender
      socket.emit('debug', {
        event: 'private_message_sent',
        recipientFound: !!recipientSocketEntry,
        messageId: String(newMessage._id),
        savedOk: true
      });

      if (typeof ack === 'function') ack({ ok: true, id: String(newMessage._id) });
    } catch (error) {
      console.error('Error saving private message:', error);
      socket.emit('error', { message: 'Failed to send private message' });
      socket.emit('debug', {
        event: 'private_message_error',
        error: error.message
      });
      if (typeof ack === 'function') ack({ ok: false, error: error.message });
    }
  });

  // Rooms: join a room
  socket.on('join_room', async (payload, ack) => {
    try {
      const room = typeof payload === 'string' ? payload : payload?.room;
      if (!room) return socket.emit('error', { message: 'Room name required' });
      socket.join(room);
      
      // Fetch room messages from database
      const roomMessages = await Message.find({ 
        room,
        messageType: 'room' 
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

      // Transform messages for client compatibility
      const formattedMessages = roomMessages.map(msg => ({
        ...msg,
        id: msg._id,
        message: msg.content,
        timestamp: msg.createdAt
      }));

  // Send room messages to the user
  socket.emit('room_messages', formattedMessages.reverse());
  if (typeof ack === 'function') ack({ ok: true, count: formattedMessages.length });

      // Save or update room in database
  const existingRoom = await Room.findOne({ name: room });
      if (!existingRoom) {
        const newRoom = new Room({
          name: room,
          members: [user.id],
          createdBy: user.id
        });
        await newRoom.save();
      } else {
        // Add user to room members if not already present
        await Room.findOneAndUpdate(
          { name: room },
          { $addToSet: { members: user.id } }
        );
      }

      // Notify room of new user
      io.to(room).emit('room_user_joined', { 
        room, 
        username: user.username, 
        id: socket.id,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // Create a room via socket (persisted)
  socket.on('create_room', async ({ name }) => {
    if (!name || !name.trim()) return;
    try {
      // Check existence
      let existing = await Room.findOne({ name: name.trim() });
      if (existing) {
        socket.emit('room_error', { message: 'Room already exists' });
        return;
      }

      const newRoom = new Room({ name: name.trim(), createdBy: user.username });
      await newRoom.save();
      const roomToSend = newRoom.toObject();
      io.emit('room_created', roomToSend);
    } catch (err) {
      console.error('Error creating room:', err);
      socket.emit('room_error', { message: 'Failed to create room' });
    }
  });

  socket.on('leave_room', (room) => {
    socket.leave(room);
    io.to(room).emit('room_user_left', { room, username: user.username, id: socket.id });
  });

  // Send message to a room
  socket.on('send_room_message', async ({ room, message: text }, ack) => {
    try {
      const newMessage = new Message({
        content: text,
        sender: user.username,
        senderId: user.id,
        type: 'text',
        messageType: 'room',
        room,
        readBy: [],
        reactions: []
      });

      await newMessage.save();
      const messageToSend = {
        ...newMessage.toObject(),
        id: newMessage._id,
        userId: user.id,
        timestamp: newMessage.createdAt,
        message: text // for backwards compatibility
      };

      io.to(room).emit('room_message', messageToSend);
      if (typeof ack === 'function') ack({ ok: true, id: String(newMessage._id) });
    } catch (error) {
      console.error('Error saving room message:', error);
      socket.emit('error', { message: 'Failed to send room message' });
      if (typeof ack === 'function') ack({ ok: false, error: error.message });
    }
  });

  // File/image sharing via socket (base64 payload)
  socket.on('send_file', async ({ room, fileName, fileType, data }, ack) => {
    const newFileMessage = new Message({
      content: data, // base64 string
      sender: user.username,
      type: 'file',
      room: room || 'general',
      senderId: user.id,
      fileName,
      fileType,
      readBy: [],
      reactions: []
    });

    try {
      await newFileMessage.save();
      const messageToSend = {
        ...newFileMessage.toObject(),
        id: newFileMessage._id,
        senderId: user.id,
        userId: user.id,
        timestamp: newFileMessage.createdAt,
        isFile: true
      };

      if (room) {
        io.to(room).emit('room_file', messageToSend);
      } else {
        io.emit('receive_message', messageToSend);
      }
      if (typeof ack === 'function') ack({ ok: true, id: String(newFileMessage._id) });
    } catch (error) {
      console.error('Error saving file message:', error);
      socket.emit('error', { message: 'Failed to save file message' });
      if (typeof ack === 'function') ack({ ok: false, error: error.message });
    }
  });

  // Read receipts
  socket.on('message_read', async ({ messageId }) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) return;

      if (!message.readBy.includes(user.id)) {
        message.readBy.push(user.id);
        await message.save();
        
        const messageToSend = {
          ...message.toObject(),
          id: message._id,
          senderId: user.id,
          userId: user.id
        };
        io.emit('message_updated', messageToSend);
      }
    } catch (error) {
      console.error('Error updating read receipt:', error);
      socket.emit('error', { message: 'Failed to update read receipt' });
    }
  });

  // Reactions (idempotent per-user)
  socket.on('message_reaction', async ({ messageId, reaction }) => {
    try {
      const message = await Message.findById(messageId);
      if (!message) return;

      // Find if user already has a reaction
      const existingReactionIndex = message.reactions.findIndex(
        r => r.userId === user.id && r.type === reaction
      );

      if (existingReactionIndex > -1) {
        // Remove reaction if it exists (toggle off)
        message.reactions.splice(existingReactionIndex, 1);
      } else {
        // Remove any other reactions by this user for this type
        message.reactions = message.reactions.filter(
          r => !(r.userId === user.id && r.type === reaction)
        );
        // Add new reaction
        message.reactions.push({ userId: user.id, type: reaction });
      }

      await message.save();
      const messageToSend = {
        ...message.toObject(),
        id: message._id,
        senderId: user.id,
        userId: user.id
      };
      io.emit('message_updated', messageToSend);
    } catch (error) {
      console.error('Error updating reaction:', error);
      socket.emit('error', { message: 'Failed to update reaction' });
    }
  });

  // Handle status changes
  socket.on('status_change', (status) => {
    if (connectedUsers[socket.id]) {
      connectedUsers[socket.id].status = status;
      broadcastUserList().catch(() => {});
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const username = user.username;
    io.emit('user_left', { username, id: socket.id });
    console.log(`${username} left the chat`);
    
    delete connectedUsers[socket.id];
    delete typingUsers[socket.id];
    
    broadcastUserList().catch(() => {});
    io.emit('typing_users', Object.values(typingUsers));
  });
});

// Auth routes
app.post('/api/auth/login', authController.login);
app.post('/api/auth/register', authController.register);
// Profile routes
app.get('/api/auth/profile', authMiddleware, authController.getProfile);
app.put('/api/auth/profile', authMiddleware, authController.updateProfile);

// API routes (protected by auth middleware)
// Generic messages endpoint with optional pagination and room filtering
// Query params: room, before (ISO date or messageId), limit
app.get('/api/messages', authMiddleware, async (req, res) => {
  try {
    const { room, before, limit = 50 } = req.query;
    const q = {};
    if (room) q.room = room;
    // Support before as ISO date or message id
    if (before) {
      if (/^[0-9a-fA-F]{24}$/.test(before)) {
        // find message and use its createdAt
        const beforeMsg = await Message.findById(before).lean();
        if (beforeMsg) q.createdAt = { $lt: beforeMsg.createdAt };
      } else {
        const d = new Date(before);
        if (!isNaN(d)) q.createdAt = { $lt: d };
      }
    }

    const messages = await Message.find(q)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 50, 500))
      .lean();

    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Error fetching messages' });
  }
});

// Get private message history between logged-in user and another user
// Private messages with optional pagination: before (id or date), limit
app.get('/api/messages/private/:otherId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const otherId = req.params.otherId;
    const { before, limit = 50 } = req.query;

    const q = {
      messageType: 'private',
      $or: [
        { $and: [{ senderId: userId }, { recipient: otherId }] },
        { $and: [{ senderId: otherId }, { recipient: userId }] }
      ]
    };

    if (before) {
      if (/^[0-9a-fA-F]{24}$/.test(before)) {
        const beforeMsg = await Message.findById(before).lean();
        if (beforeMsg) q.createdAt = { $lt: beforeMsg.createdAt };
      } else {
        const d = new Date(before);
        if (!isNaN(d)) q.createdAt = { $lt: d };
      }
    }

    const msgs = await Message.find(q)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 50, 500))
      .lean();

    // return in chronological order
    res.json(msgs.reverse());
  } catch (err) {
    console.error('Error fetching private messages:', err);
    res.status(500).json({ message: 'Error fetching private messages' });
  }
});

// Search messages across rooms/private by text (simple regex search)
app.get('/api/messages/search', authMiddleware, async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;
    if (!q || !q.trim()) return res.status(400).json({ message: 'Query required' });

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const results = await Message.find({ content: { $regex: regex } })
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 50, 500))
      .lean();

    res.json(results);
  } catch (err) {
    console.error('Error searching messages:', err);
    res.status(500).json({ message: 'Error searching messages' });
  }
});

app.get('/api/users', authMiddleware, (req, res) => {
  // Return connected users plus DB users with profile images
  (async () => {
    try {
      const User = require('./models/user');
      const dbUsers = await User.find().select('_id username profileImage status').lean();
      // Attach online socketId if present
      const enriched = dbUsers.map(u => {
        const onlineEntry = Object.values(connectedUsers).find(cu => String(cu.id) === String(u._id));
        return {
          id: String(u._id),
          username: u.username,
          profileImage: u.profileImage || null,
          status: onlineEntry ? 'online' : (u.status || 'offline'),
          socketId: onlineEntry ? onlineEntry.socketId : null
        };
      });
      res.json(enriched);
    } catch (err) {
      console.error('Error fetching users:', err);
      res.status(500).json({ message: 'Error fetching users' });
    }
  })();
});

// Rooms API
app.get('/api/rooms', authMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find().sort({ createdAt: 1 });
    res.json(rooms);
  } catch (err) {
    console.error('Error fetching rooms:', err);
    res.status(500).json({ message: 'Error fetching rooms' });
  }
});

app.post('/api/rooms', authMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ message: 'Name required' });
  try {
    let existing = await Room.findOne({ name: name.trim() });
    if (existing) return res.status(409).json({ message: 'Room already exists' });

    const newRoom = new Room({ name: name.trim(), createdBy: req.user.username });
    await newRoom.save();
    io.emit('room_created', newRoom.toObject());
    res.status(201).json(newRoom);
  } catch (err) {
    console.error('Error creating room:', err);
    res.status(500).json({ message: 'Error creating room' });
  }
});

// Root route
app.get('/', (req, res) => {
  res.send('Socket.io Chat Server is running');
});

// Connect to MongoDB and start server
connectDB().then(() => {
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

module.exports = { app, server, io }; 