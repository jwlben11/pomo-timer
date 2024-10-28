export class Timer {
  constructor(notificationManager) {
    this.timeDisplay = document.getElementById('time-display');
    this.sessionType = document.getElementById('session-type');
    this.sessionCount = document.getElementById('session-count');
    this.dailyTotal = document.getElementById('daily-total');
    this.startBtn = document.getElementById('start-btn');
    this.pauseBtn = document.getElementById('pause-btn');
    this.skipBtn = document.getElementById('skip-btn');
    this.progressRing = document.querySelector('.progress-ring-circle');
    
    this.isRunning = false;
    this.currentTime = 0;
    this.totalTime = 0;
    this.interval = null;
    this.currentSession = 1;
    this.totalSessions = 4;
    this.totalFocusTime = 0;
    
    this.notificationManager = notificationManager;
    this.initialize();
    
    // Add listener for timer updates from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'TIMER_UPDATE') {
        this.currentTime = message.currentTime;
        this.updateDisplay();
        this.updateProgressRing();
      } else if (message.type === 'SESSION_COMPLETE') {
        this.handleSessionComplete(message.newState);
      }
    });
  }

  initialize() {
    // Get current timer state from background
    chrome.runtime.sendMessage({ type: 'GET_TIMER_STATE' }, (response) => {
      if (response && response.isRunning) {
        this.isRunning = response.isRunning;
        this.currentTime = response.currentTime;
        this.totalTime = response.totalTime;
        this.currentSession = response.currentSession;
        this.sessionType = response.sessionType;
        
        // Update UI
        this.updateDisplay();
        this.setupProgressRing();
        this.updateSessionInfo();
        
        // Update button states
        this.startBtn.disabled = this.isRunning;
        this.pauseBtn.disabled = !this.isRunning;
      } else {
        // Initialize with default settings if no timer is running
        chrome.storage.sync.get({
          focusDuration: 25,
          breakDuration: 5,
          longBreakDuration: 15
        }, (settings) => {
          this.settings = settings;
          this.currentTime = settings.focusDuration * 60;
          this.totalTime = this.currentTime;
          this.updateDisplay();
          this.setupProgressRing();
          this.updateSessionInfo();
        });
      }
    });
  }

  updateSessionInfo() {
    this.sessionCount.textContent = `Session ${this.currentSession}/${this.totalSessions}`;
    const hours = Math.floor(this.totalFocusTime / 3600);
    const minutes = Math.floor((this.totalFocusTime % 3600) / 60);
    this.dailyTotal.textContent = `Total: ${hours}h ${minutes}m`;
  }

  setupProgressRing() {
    const circumference = 2 * Math.PI * 116;
    this.progressRing.style.strokeDasharray = `${circumference} ${circumference}`;
    this.progressRing.style.strokeDashoffset = circumference;
  }

  updateProgressRing() {
    const circumference = 2 * Math.PI * 116;
    const offset = circumference - (this.currentTime / this.totalTime) * circumference;
    this.progressRing.style.strokeDashoffset = offset;
  }

  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.startBtn.disabled = true;
      this.pauseBtn.disabled = false;
      
      chrome.runtime.sendMessage({
        type: 'START_TIMER',
        currentTime: this.currentTime,
        totalTime: this.totalTime,
        currentSession: this.currentSession,
        sessionType: this.sessionType.textContent
      });
    }
  }

  pause() {
    if (this.isRunning) {
      this.isRunning = false;
      this.startBtn.disabled = false;
      this.pauseBtn.disabled = true;
      
      chrome.runtime.sendMessage({ type: 'PAUSE_TIMER' });
    }
  }

  skip() {
    chrome.runtime.sendMessage({ type: 'SKIP_TIMER' });
  }

  handleSessionComplete(newState) {
    // Update local state with new state from background
    this.isRunning = newState.isRunning;
    this.currentTime = newState.currentTime;
    this.totalTime = newState.currentTime; // Reset totalTime for new session
    this.currentSession = newState.currentSession;
    this.sessionType.textContent = newState.sessionType;

    // Update UI
    this.startBtn.disabled = false;
    this.pauseBtn.disabled = true;
    this.updateDisplay();
    this.updateProgressRing();
    this.updateSessionInfo();
  }

  updateDisplay() {
    const minutes = Math.floor(this.currentTime / 60);
    const seconds = this.currentTime % 60;
    this.timeDisplay.textContent = 
      `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}
