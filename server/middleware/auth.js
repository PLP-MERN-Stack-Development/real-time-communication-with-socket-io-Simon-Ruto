// auth.js - Authentication middleware
const { verifyToken } = require('../utils/jwt');

// Express middleware to verify JWT in Authorization header
const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Authentication failed' });
  }
};

// Socket.io middleware to verify JWT in handshake auth
const socketAuthMiddleware = (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    
    // Log the connection attempt
    console.log('Socket connection attempt:', {
      id: socket.id,
      token: token ? 'present' : 'missing'
    });

    if (!token) {
      console.log('Socket auth failed: No token provided');
      return next(new Error('Authentication required'));
    }

    const user = verifyToken(token);
    if (!user) {
      console.log('Socket auth failed: Invalid token');
      return next(new Error('Invalid token'));
    }

    // Attach user data to socket for later use
    socket.user = user;
    console.log('Socket authenticated:', { id: socket.id, user: user.username });
    next();
  } catch (error) {
    console.error('Socket auth error:', error);
    next(new Error(`Authentication failed: ${error.message}`));
  }
};

module.exports = {
  authMiddleware,
  socketAuthMiddleware
};