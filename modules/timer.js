export class Timer {
  constructor(notificationManager) {
    this.timeDisplay = document.getElementById('time-display');
    this.sessionType = document.getElementById('session-type');
    this.sessionCount = document.getElementById('session-count');
    this.dailyTotal = document.getElementById('daily-total');
    this.toggleBtn = document.getElementById('toggle-btn');
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
    
    this.preSessionForm = document.getElementById('pre-session-form');
    this.timerContainer = document.getElementById('timer-container');
    this.startSessionBtn = document.getElementById('start-session');
    
    this.setupPreSessionForm();
    
    // Add click handler for toggle button
    this.toggleBtn.addEventListener('click', () => {
      if (this.isRunning) {
        this.pause();
      } else {
        this.start();
      }
    });
    
    // Add click handler for skip button
    this.skipBtn.addEventListener('click', () => {
      this.skip();
    });
    
    // Add new properties for goal overlay
    this.goalBtn = document.getElementById('goal-btn');
    this.goalOverlay = document.getElementById('goal-overlay');
    this.closeGoalBtn = document.getElementById('close-goal');
    this.currentSessionInfo = null;
    
    // Add event listeners for goal overlay
    this.goalBtn.addEventListener('click', () => this.showGoalOverlay());
    this.closeGoalBtn.addEventListener('click', () => this.hideGoalOverlay());
    this.goalOverlay.addEventListener('click', (e) => {
      if (e.target === this.goalOverlay) {
        this.hideGoalOverlay();
      }
    });
  }

  initialize() {
    // Get current timer state from background
    chrome.runtime.sendMessage({ type: 'GET_TIMER_STATE' }, (response) => {
      if (response) {
        this.isRunning = response.isRunning;
        this.currentTime = response.currentTime;
        this.totalTime = response.totalTime || response.currentTime;
        this.currentSession = response.currentSession;
        this.sessionType.textContent = response.sessionType;
        this.currentSessionInfo = response.sessionInfo;
        
        // Show timer if:
        // 1. Timer is running, OR
        // 2. It's not a Focus Time session, OR
        // 3. It's a Focus Time session WITH session info
        if (this.isRunning || 
            response.sessionType !== 'Focus Time' || 
            (response.sessionType === 'Focus Time' && this.currentSessionInfo)) {
          // Show timer container and hide pre-session form
          this.preSessionForm.classList.add('hidden');
          this.timerContainer.classList.remove('hidden');
          
          // If there's session info, update the goal overlay
          if (this.currentSessionInfo) {
            this.updateGoalOverlay(this.currentSessionInfo);
          }
          
          // Update UI
          this.updateDisplay();
          this.setupProgressRing();
          this.updateSessionInfo();
          
          // Update toggle button state
          this.toggleBtn.textContent = this.isRunning ? 'Pause' : 'Start';
          if (this.isRunning) {
            this.toggleBtn.classList.add('active');
          }
        } else {
          // Show the pre-session form for Focus Time without session info
          this.preSessionForm.classList.remove('hidden');
          this.timerContainer.classList.add('hidden');
        }
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
    const circle = document.querySelector('.progress-ring-circle');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    
    this.progressRing = circle;
    this.circumference = circumference;
    
    // Immediately update to show current progress
    this.updateProgressRing();
  }

  updateProgressRing() {
    if (!this.progressRing) return;
    
    const progress = this.currentTime / this.totalTime;
    const offset = this.circumference * (1 - progress);
    this.progressRing.style.strokeDashoffset = offset;
  }

  start(sessionInfo = null) {
    if (!this.isRunning) {
      this.isRunning = true;
      
      // Store session info
      if (sessionInfo) {
        this.currentSessionInfo = sessionInfo;
      }
      
      // Update toggle button
      this.toggleBtn.textContent = 'Pause';
      this.toggleBtn.classList.add('active');
      
      chrome.runtime.sendMessage({
        type: 'START_TIMER',
        currentTime: this.currentTime,
        totalTime: this.totalTime,
        currentSession: this.currentSession,
        sessionType: this.sessionType.textContent,
        sessionInfo
      });
    }
  }

  pause() {
    if (this.isRunning) {
      this.isRunning = false;
      
      // Update toggle button
      this.toggleBtn.textContent = 'Start';
      this.toggleBtn.classList.remove('active');
      
      chrome.runtime.sendMessage({ type: 'PAUSE_TIMER' });
    }
  }

  skip() {
    // Pause the timer if it's running
    if (this.isRunning) {
        this.pause();
    }
    
    // Notify background script and pass current state
    chrome.runtime.sendMessage({ 
        type: 'SKIP_TIMER',
        currentSession: this.currentSession,
        sessionType: this.sessionType.textContent
    });
    
    // Clear any local intervals just in case
    if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
    }
  }

  handleSessionComplete(newState) {
    // Update local state with new state from background
    this.isRunning = newState.isRunning;
    this.currentTime = newState.currentTime;
    this.totalTime = newState.currentTime; // Reset totalTime for new session
    this.currentSession = newState.currentSession;
    
    // Fix: Check if sessionType is a string or DOM element
    if (typeof newState.sessionType === 'string') {
      this.sessionType.textContent = newState.sessionType;
    } else {
      this.sessionType = newState.sessionType;
    }

    // Show pre-session form ONLY if next session is Focus Time AND timer is not running
    if (newState.sessionType === 'Focus Time' && !this.isRunning) {
      this.preSessionForm.classList.remove('hidden');
      this.timerContainer.classList.add('hidden');
    } else {
      // For breaks or running sessions, keep timer visible and update display
      this.preSessionForm.classList.add('hidden');
      this.timerContainer.classList.remove('hidden');
    }

    // Reset session info if moving to a break
    if (newState.sessionType !== 'Focus Time') {
      this.currentSessionInfo = null;
    }

    // Update UI
    this.updateDisplay();
    this.updateProgressRing();
    this.updateSessionInfo();
    
    // Reset toggle button
    this.toggleBtn.textContent = 'Start';
    this.toggleBtn.classList.remove('active');
  }

  updateDisplay() {
    const minutes = Math.floor(this.currentTime / 60);
    const seconds = this.currentTime % 60;
    this.timeDisplay.textContent = 
      `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  setupPreSessionForm() {
    this.startSessionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Validate form
      const goal = document.getElementById('session-goal').value.trim();
      const start = document.getElementById('session-start').value.trim();
      const hazards = document.getElementById('session-hazards').value.trim();
      const energy = document.getElementById('energy-level').value;
      const morale = document.getElementById('morale-level').value;
      
      if (!goal || !start || !hazards || !energy || !morale) {
        alert('Please fill in all fields');
        return;
      }
      
      // Collect session info
      const sessionInfo = {
        goal,
        start,
        hazards,
        energy,
        morale,
        startTime: Date.now()
      };
      
      // Hide form and show timer
      this.preSessionForm.classList.add('hidden');
      this.timerContainer.classList.remove('hidden');
      
      // Set initial time for focus session
      chrome.storage.sync.get({ focusDuration: 25 }, (settings) => {
        this.currentTime = settings.focusDuration * 60;
        this.totalTime = this.currentTime;
        this.sessionType.textContent = 'Focus Time';
        
        // Update display before starting
        this.updateDisplay();
        this.setupProgressRing();
        
        // Start timer with session info
        this.start(sessionInfo);
      });
    });
  }

  showGoalOverlay() {
    if (!this.currentSessionInfo) return;
    
    // Update overlay content
    document.getElementById('goal-text').textContent = this.currentSessionInfo.goal;
    document.getElementById('start-text').textContent = this.currentSessionInfo.start;
    document.getElementById('hazards-text').textContent = this.currentSessionInfo.hazards;
    document.getElementById('energy-text').textContent = this.currentSessionInfo.energy;
    document.getElementById('morale-text').textContent = this.currentSessionInfo.morale;
    
    // Show overlay with animation
    this.goalOverlay.classList.remove('hidden');
    requestAnimationFrame(() => {
      this.goalOverlay.classList.add('visible');
    });
  }

  hideGoalOverlay() {
    this.goalOverlay.classList.remove('visible');
    setTimeout(() => {
      this.goalOverlay.classList.add('hidden');
    }, 200); // Match transition duration
  }

  updateGoalOverlay(sessionInfo) {
    document.getElementById('goal-text').textContent = sessionInfo.goal;
    document.getElementById('start-text').textContent = sessionInfo.start;
    document.getElementById('hazards-text').textContent = sessionInfo.hazards;
    document.getElementById('energy-text').textContent = sessionInfo.energy;
    document.getElementById('morale-text').textContent = sessionInfo.morale;
  }
}
