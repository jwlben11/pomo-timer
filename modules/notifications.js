export class NotificationManager {
  constructor() {
    this.initialize();
    this.loadSounds();
    this.requestPermissions();
  }

  initialize() {
    chrome.storage.sync.get({
      soundEnabled: true,
      desktopNotifications: true
    }, (settings) => {
      this.settings = settings;
    });

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.soundEnabled) {
        this.settings.soundEnabled = changes.soundEnabled.newValue;
      }
      if (changes.desktopNotifications) {
        this.settings.desktopNotifications = changes.desktopNotifications.newValue;
      }
    });
  }

  loadSounds() {
    this.sounds = {
      focus: new Audio('assets/sounds/focus-start.mp3'),
      break: new Audio('assets/sounds/break-start.mp3'),
      complete: new Audio('assets/sounds/session-complete.mp3')
    };
  }

  async requestPermissions() {
    if (Notification.permission !== 'granted') {
      try {
        await Notification.requestPermission();
      } catch (error) {
        console.error('Error requesting notification permission:', error);
      }
    }
  }

  async notify(title, message, type = 'info') {
    if (this.settings.desktopNotifications) {
      if (Notification.permission === 'granted') {
        // Use chrome.notifications API instead of the web Notification API
        chrome.notifications.create({
          type: 'basic',
          iconUrl: `assets/icon-${type}.png`,
          title: title,
          message: message,
          priority: 2
        });
      }
    }

    if (this.settings.soundEnabled) {
      this.playSound(type);
    }
  }

  playSound(type) {
    const sound = this.sounds[type] || this.sounds.complete;
    sound.play().catch(error => console.error('Audio playback error:', error));
  }
}
