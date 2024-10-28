import { Timer } from './modules/timer.js';
import { Analytics } from './modules/analytics.js';
import { Settings } from './modules/settings.js';
import { NotificationManager } from './modules/notifications.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize modules
  const notificationManager = new NotificationManager();
  const timer = new Timer(notificationManager);
  const analytics = new Analytics();
  const settings = new Settings();

  // Add event listeners for timer controls
  document.getElementById('start-btn').addEventListener('click', () => timer.start());
  document.getElementById('pause-btn').addEventListener('click', () => timer.pause());
  document.getElementById('skip-btn').addEventListener('click', () => timer.skip());

  // Add event listener for settings save
  document.getElementById('save-settings').addEventListener('click', () => settings.saveSettings());

  // Add event listeners for navigation
  const navButtons = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.view');

  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      const viewId = button.dataset.view;
      
      // Update active states
      navButtons.forEach(btn => btn.classList.remove('active'));
      views.forEach(view => view.classList.remove('active'));
      
      button.classList.add('active');
      document.getElementById(`${viewId}-view`).classList.add('active');

      // Update analytics if switching to analytics view
      if (viewId === 'analytics') {
        analytics.updateCharts();
      }
    });
  });

  // Request notification permissions on startup
  if (Notification.permission !== 'granted') {
    Notification.requestPermission();
  }
});
