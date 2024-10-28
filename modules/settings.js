export class Settings {
  constructor() {
    this.defaults = {
      focusDuration: 25,
      breakDuration: 5,
      longBreakDuration: 15,
      soundEnabled: true,
      desktopNotifications: true
    };
    
    this.loadSettings();
    this.addInputValidation();
  }

  loadSettings() {
    chrome.storage.sync.get(this.defaults, (settings) => {
      document.getElementById('focus-duration').value = settings.focusDuration;
      document.getElementById('break-duration').value = settings.breakDuration;
      document.getElementById('long-break-duration').value = settings.longBreakDuration;
      document.getElementById('sound-enabled').checked = settings.soundEnabled;
      document.getElementById('desktop-notifications').checked = settings.desktopNotifications;
    });
  }

  addInputValidation() {
    const numberInputs = document.querySelectorAll('input[type="number"]');
    numberInputs.forEach(input => {
      input.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        const min = parseInt(e.target.min);
        const max = parseInt(e.target.max);
        
        if (value < min) e.target.value = min;
        if (value > max) e.target.value = max;
      });
    });
  }

  saveSettings() {
    const settings = {
      focusDuration: parseInt(document.getElementById('focus-duration').value, 10),
      breakDuration: parseInt(document.getElementById('break-duration').value, 10),
      longBreakDuration: parseInt(document.getElementById('long-break-duration').value, 10),
      soundEnabled: document.getElementById('sound-enabled').checked,
      desktopNotifications: document.getElementById('desktop-notifications').checked
    };

    chrome.storage.sync.set(settings, () => {
      this.showSaveConfirmation();
      chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings });
      
      // Request notification permission if enabled
      if (settings.desktopNotifications) {
        Notification.requestPermission();
      }
    });
  }

  showSaveConfirmation() {
    const saveBtn = document.getElementById('save-settings');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saved!';
    saveBtn.style.background = 'var(--success)';
    
    setTimeout(() => {
      saveBtn.textContent = originalText;
      saveBtn.style.background = '';
    }, 2000);
  }
}
