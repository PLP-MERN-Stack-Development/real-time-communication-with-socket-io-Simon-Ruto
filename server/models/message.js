const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  type: { type: String, required: true }
});

const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  senderId: { type: String, required: true },  // User ID for better tracking
  content: { type: String, required: true },
  type: { type: String, enum: ['text', 'file'], default: 'text' },
  messageType: { type: String, enum: ['room', 'private'], default: 'room' },
  room: { type: String },  // Room ID or name
  recipient: { type: String },  // For private messages: recipient's user ID
  fileName: String,  // For file messages
  fileType: String,  // For file messages
  readBy: [{ type: String }],
  reactions: [reactionSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);