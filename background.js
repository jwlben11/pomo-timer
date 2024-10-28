// Initialize storage on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ 
    sessionHistory: [],
    dailyStats: {
      date: new Date().toLocaleDateString(),
      focusTime: 0,
      sessions: 0
    }
  });
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SESSION_COMPLETE':
      handleSessionComplete(message);
      break;
    case 'SETTINGS_UPDATED':
      handleSettingsUpdate(message.settings);
      break;
    case 'GET_TIMER_STATE':
      sendResponse(timerState);
      break;
    case 'START_TIMER':
      startTimer(message);
      sendResponse({ success: true });
      break;
    case 'PAUSE_TIMER':
      pauseTimer();
      sendResponse({ success: true });
      break;
    case 'SKIP_TIMER':
      skipTimer();
      sendResponse({ success: true });
      break;
  }
  return true; // Required for async response
});

function handleSessionComplete(message) {
  // Update session history
  chrome.storage.local.get(['sessionHistory', 'dailyStats'], (result) => {
    const history = result.sessionHistory || [];
    const dailyStats = result.dailyStats || {
      date: new Date().toLocaleDateString(),
      focusTime: 0,
      sessions: 0
    };

    // Reset daily stats if it's a new day
    if (dailyStats.date !== new Date().toLocaleDateString()) {
      dailyStats.date = new Date().toLocaleDateString();
      dailyStats.focusTime = 0;
      dailyStats.sessions = 0;
    }

    // Update stats
    if (message.sessionType === 'Focus Time') {
      dailyStats.focusTime += message.duration;
      dailyStats.sessions++;
    }

    // Add session to history
    history.push({
      timestamp: Date.now(),
      type: message.sessionType,
      duration: message.duration
    });

    // Store updates
    chrome.storage.local.set({ 
      sessionHistory: history,
      dailyStats: dailyStats
    });
  });

  // Show notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'assets/icon128.png',
    title: `${message.sessionType} Complete!`,
    message: 'Time for a change of pace!',
    priority: 2
  });
}

function handleSettingsUpdate(settings) {
  // Update alarm intervals if needed
  chrome.alarms.clearAll();
  if (settings.desktopNotifications) {
    chrome.alarms.create('checkTimer', { periodInMinutes: 1 });
  }
}

// Set up periodic checks
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkTimer') {
    chrome.storage.sync.get(['currentSession'], (result) => {
      if (result.currentSession && result.currentSession.endTime < Date.now()) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'assets/icon128.png',
          title: 'Time\'s Up!',
          message: 'Your current session has ended.',
          priority: 2
        });
      }
    });
  }
});

let timerState = {
  isRunning: false,
  currentTime: 0,
  totalTime: 0,
  currentSession: 1,
  sessionType: 'Focus Time',
  interval: null
};

function startTimer(config) {
  timerState = {
    ...timerState,
    ...config,
    isRunning: true
  };
  
  if (timerState.interval) {
    clearInterval(timerState.interval);
  }
  
  timerState.interval = setInterval(() => {
    timerState.currentTime--;
    
    // Notify popup of time update - with error handling
    chrome.runtime.sendMessage({
      type: 'TIMER_UPDATE',
      currentTime: timerState.currentTime
    }).catch(() => {
      // Ignore error when popup is closed
    });
    
    if (timerState.currentTime <= 0) {
      handleTimerComplete();
    }
  }, 1000);
}

function pauseTimer() {
  if (timerState.interval) {
    clearInterval(timerState.interval);
  }
  timerState.isRunning = false;
}

function skipTimer() {
  if (timerState.interval) {
    clearInterval(timerState.interval);
  }
  handleTimerComplete();
}

function handleTimerComplete() {
  // Update session history
  chrome.storage.local.get(['sessionHistory', 'dailyStats'], (result) => {
    const history = result.sessionHistory || [];
    const dailyStats = result.dailyStats || {
      date: new Date().toLocaleDateString(),
      focusTime: 0,
      sessions: 0
    };

    // Reset daily stats if it's a new day
    if (dailyStats.date !== new Date().toLocaleDateString()) {
      dailyStats.date = new Date().toLocaleDateString();
      dailyStats.focusTime = 0;
      dailyStats.sessions = 0;
    }

    // Update stats
    if (timerState.sessionType === 'Focus Time') {
      dailyStats.focusTime += timerState.currentTime;
      dailyStats.sessions++;
    }

    // Add session to history
    history.push({
      timestamp: Date.now(),
      type: timerState.sessionType,
      duration: timerState.currentTime
    });

    // Store updates
    chrome.storage.local.set({ 
      sessionHistory: history,
      dailyStats: dailyStats
    });
  });

  // Update timer state for next session
  chrome.storage.sync.get({
    focusDuration: 25,
    breakDuration: 5,
    longBreakDuration: 15
  }, (settings) => {
    const isBreak = timerState.sessionType === 'Focus Time';
    const isLongBreak = isBreak && timerState.currentSession >= 4;
    
    timerState = {
      ...timerState,
      isRunning: false,
      currentTime: isLongBreak ? settings.longBreakDuration * 60 :
                  isBreak ? settings.breakDuration * 60 :
                  settings.focusDuration * 60,
      sessionType: isLongBreak ? 'Long Break' :
                  isBreak ? 'Break' :
                  'Focus Time',
      currentSession: isLongBreak ? 1 : timerState.currentSession + (isBreak ? 0 : 1)
    };
    
    // Notify popup of session completion - with error handling
    chrome.runtime.sendMessage({
      type: 'SESSION_COMPLETE',
      newState: timerState
    }).catch(() => {
      // Ignore error when popup is closed
    });

    // Store current session state in storage for persistence
    chrome.storage.sync.set({
      currentSession: {
        isRunning: timerState.isRunning,
        currentTime: timerState.currentTime,
        totalTime: timerState.totalTime,
        currentSession: timerState.currentSession,
        sessionType: timerState.sessionType,
        endTime: Date.now() + (timerState.currentTime * 1000)
      }
    });
  });
}

// Clean up interval when extension is unloaded
chrome.runtime.onSuspend.addListener(() => {
  if (timerState.interval) {
    clearInterval(timerState.interval);
  }
});

// Add a helper function to wrap chrome.runtime.sendMessage with error handling
function sendMessageToPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Ignore error when popup is closed
  });
}

// Initialize timer state from storage when background script starts
chrome.storage.sync.get(['currentSession'], (result) => {
  if (result.currentSession) {
    timerState = {
      ...timerState,
      ...result.currentSession,
      interval: null
    };
    
    // Restart timer if it was running
    if (timerState.isRunning) {
      startTimer(timerState);
    }
  }
});
