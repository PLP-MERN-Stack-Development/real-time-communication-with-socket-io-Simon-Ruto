// Notification sound
const notificationSound = new Audio('/notification.mp3');

// Request browser notification permission
export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.log('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

// Send browser notification
export const sendBrowserNotification = (title, options = {}) => {
  if (Notification.permission === 'granted') {
    const notification = new Notification(title, {
      icon: '/chat-icon.png',
      ...options
    });

    // Auto close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  }
};

// Play notification sound
export const playNotificationSound = () => {
  notificationSound.play().catch(err => console.log('Error playing sound:', err));
};

// Handle notifications
export const handleNotification = async ({ title, body, sound = true }) => {
  // In-app notification logic can be added here
  
  // Browser notification
  if (document.hidden) {
    sendBrowserNotification(title, { body });
  }
  
  // Sound notification
  if (sound) {
    playNotificationSound();
  }
};