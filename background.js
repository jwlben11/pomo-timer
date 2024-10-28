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
      handleSkipTimer(message);
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
  interval: null,
  sessionInfo: null,
  lastActiveTime: null
};

function startTimer(config) {
  timerState = {
    ...timerState,
    ...config,
    isRunning: true,
    lastActiveTime: Date.now()
  };
  
  // Store complete timer state
  chrome.storage.local.set({
    currentSession: {
      isRunning: timerState.isRunning,
      currentTime: timerState.currentTime,
      totalTime: timerState.totalTime || timerState.currentTime,
      currentSession: timerState.currentSession,
      sessionType: timerState.sessionType,
      sessionInfo: timerState.sessionInfo,
      lastActiveTime: timerState.lastActiveTime,
      endTime: Date.now() + (timerState.currentTime * 1000)
    }
  });
  
  if (timerState.interval) {
    clearInterval(timerState.interval);
  }
  
  timerState.interval = setInterval(() => {
    timerState.currentTime--;
    
    // Update storage with new time
    chrome.storage.local.set({
      currentSession: {
        ...timerState,
        endTime: Date.now() + (timerState.currentTime * 1000)
      }
    });
    
    // Notify popup of time update
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

function handleSkipTimer(request) {
  // Clear any existing timer
  if (timerState.interval) {
    clearInterval(timerState.interval);
    timerState.interval = null;
  }

  // Determine next session type and duration
  chrome.storage.sync.get({
    focusDuration: 25,
    breakDuration: 5,
    longBreakDuration: 15
  }, (settings) => {
    const currentType = request.sessionType;
    const currentSession = request.currentSession;
    
    let nextSessionType, nextDuration, nextSession;
    
    if (currentType === 'Focus Time') {
      // If skipping a focus session, go to break
      const isLongBreak = currentSession >= 4;
      nextSessionType = isLongBreak ? 'Long Break' : 'Break';
      nextDuration = isLongBreak ? settings.longBreakDuration : settings.breakDuration;
      nextSession = isLongBreak ? 1 : currentSession;
    } else {
      // If skipping a break or long break, go to focus
      nextSessionType = 'Focus Time';
      nextDuration = settings.focusDuration;
      nextSession = currentType === 'Long Break' ? 1 : currentSession + 1;
    }

    // Update timer state
    timerState = {
      ...timerState,
      isRunning: false,
      currentTime: nextDuration * 60,
      totalTime: nextDuration * 60,
      sessionType: nextSessionType,
      currentSession: nextSession,
      sessionInfo: null // Clear session info on skip
    };

    // Notify popup of the new state
    chrome.runtime.sendMessage({
      type: 'SESSION_COMPLETE',
      newState: timerState
    }).catch(() => {
      // Ignore error when popup is closed
    });

    // Update storage
    chrome.storage.local.set({
      currentSession: {
        isRunning: timerState.isRunning,
        currentTime: timerState.currentTime,
        totalTime: timerState.totalTime,
        currentSession: timerState.currentSession,
        sessionType: timerState.sessionType,
        sessionInfo: null,
        lastActiveTime: Date.now(),
        endTime: Date.now() + (timerState.currentTime * 1000)
      }
    });
  });
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

    // Add session to history with additional info
    history.push({
      timestamp: Date.now(),
      type: timerState.sessionType,
      duration: timerState.currentTime,
      sessionInfo: timerState.sessionInfo // Add session info to history
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

    // Update storage with new session state
    chrome.storage.local.set({
      currentSession: {
        isRunning: timerState.isRunning,
        currentTime: timerState.currentTime,
        totalTime: timerState.totalTime || timerState.currentTime,
        currentSession: timerState.currentSession,
        sessionType: timerState.sessionType,
        sessionInfo: timerState.sessionInfo,
        lastActiveTime: Date.now(),
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
chrome.storage.local.get(['currentSession'], (result) => {
  if (result.currentSession) {
    const stored = result.currentSession;
    const now = Date.now();
    
    // Calculate remaining time
    if (stored.endTime && stored.endTime > now) {
      const remainingTime = Math.ceil((stored.endTime - now) / 1000);
      
      timerState = {
        ...stored,
        currentTime: remainingTime,
        interval: null,
        lastActiveTime: stored.lastActiveTime
      };
      
      // Restart timer if it was running
      if (stored.isRunning) {
        startTimer(timerState);
      }
    } else if (stored.sessionType !== 'Focus Time' || 
              (stored.lastActiveTime && (now - stored.lastActiveTime) < 24 * 60 * 60 * 1000)) {
      // Keep the session state if it's a break or if the last activity was within 24 hours
      timerState = {
        ...stored,
        isRunning: false,
        interval: null,
        currentTime: stored.currentTime,
        lastActiveTime: stored.lastActiveTime
      };
    }
  }
});

