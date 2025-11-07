// authController.js - Authentication routes handler (using MongoDB User model)
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/jwt');
const User = require('../models/user');
const Message = require('../models/message');

// Login - if user doesn't exist, create for demo convenience
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username) return res.status(400).json({ message: 'Username required' });

    let user = await User.findOne({ username });
    if (!user) {
      // Create user
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password || 'default', salt);
      user = new User({ username, password: hashedPassword, status: 'online' });
      await user.save();
    } else {
      // If password provided, verify
      if (password && user.password && !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    }

    const token = generateToken({ id: user._id.toString(), username: user.username });

    res.json({
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        profileImage: user.profileImage || null
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Register - create a new user
const register = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !username.trim()) return res.status(400).json({ message: 'Username required' });
    if (!password || password.length < 3) return res.status(400).json({ message: 'Password too short' });

    const existing = await User.findOne({ username: username.trim() });
    if (existing) return res.status(409).json({ message: 'Username already taken' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = new User({ username: username.trim(), password: hashedPassword, status: 'online' });
    await user.save();

    const token = generateToken({ id: user._id.toString(), username: user.username });

    res.status(201).json({
      token,
      user: { id: user._id.toString(), username: user.username, profileImage: user.profileImage || null }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get profile + recent private chat list
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Get recent private chats (latest message per participant)
    const privateMessages = await Message.find({
      messageType: 'private',
      $or: [{ senderId: userId }, { recipient: userId }]
    })
    .sort({ createdAt: -1 })
    .lean();

    const threadsMap = new Map();
    for (const m of privateMessages) {
      const otherId = String(m.senderId) === String(userId) ? String(m.recipient) : String(m.senderId);
      if (!threadsMap.has(otherId)) {
        threadsMap.set(otherId, m);
      }
    }

    const threads = Array.from(threadsMap.entries()).map(([otherId, lastMessage]) => ({ otherId, lastMessage }));

    res.json({ user: { id: user._id.toString(), username: user.username, profileImage: user.profileImage || null }, threads });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update profile (username, profileImage)
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, profileImage } = req.body;
    const update = {};
    if (username && username.trim()) update.username = username.trim();
    if (typeof profileImage === 'string') update.profileImage = profileImage;

    const user = await User.findByIdAndUpdate(userId, update, { new: true }).lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ id: user._id.toString(), username: user.username, profileImage: user.profileImage || null });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  login,
  register,
  getProfile,
  updateProfile
};