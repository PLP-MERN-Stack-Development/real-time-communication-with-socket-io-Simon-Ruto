const Message = require('../models/message');

exports.getMessages = async (req, res) => {
    try {
        const { room = 'general', page = 1, limit = 50 } = req.query;
        const skip = (page - 1) * limit;

        const messages = await Message.find({ 
            room,
            messageType: 'room'
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

        res.json({
            messages: messages.reverse(),
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
};

exports.getPrivateMessages = async (req, res) => {
    try {
        const { userId } = req.user;
        const { otherId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const skip = (page - 1) * limit;

        const messages = await Message.find({
            messageType: 'private',
            $or: [
                { senderId: userId, recipient: otherId },
                { senderId: otherId, recipient: userId }
            ]
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

        res.json({
            messages: messages.reverse(),
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('Error fetching private messages:', error);
        res.status(500).json({ error: 'Failed to fetch private messages' });
    }
};