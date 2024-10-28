export class Analytics {
  constructor() {
    this.chart = null;
    this.initializeCharts();
  }

  initializeCharts() {
    const ctx = document.getElementById('analytics-chart').getContext('2d');
    
    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'Focus Time (hours)',
          data: [],
          backgroundColor: '#2563eb',
          borderColor: '#1d4ed8',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => `${value}h`
            }
          }
        }
      }
    });

    this.updateCharts();
  }

  async updateCharts(timeRange = 'week') {
    const data = await this.fetchAnalyticsData(timeRange);
    this.updateChartData(data);
    this.updateStats(data);
  }

  async fetchAnalyticsData(timeRange) {
    return new Promise((resolve) => {
      chrome.storage.local.get('sessionHistory', (result) => {
        const history = result.sessionHistory || [];
        const now = new Date();
        let filteredHistory;

        switch (timeRange) {
          case 'month':
            filteredHistory = history.filter(session => {
              const sessionDate = new Date(session.timestamp);
              return now.getMonth() === sessionDate.getMonth();
            });
            break;
          case 'year':
            filteredHistory = history.filter(session => {
              const sessionDate = new Date(session.timestamp);
              return now.getFullYear() === sessionDate.getFullYear();
            });
            break;
          default: // week
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            filteredHistory = history.filter(session => {
              const sessionDate = new Date(session.timestamp);
              return sessionDate >= weekAgo;
            });
        }

        resolve(this.processHistoryData(filteredHistory, timeRange));
      });
    });
  }

  processHistoryData(history, timeRange) {
    const now = new Date();
    const labels = [];
    const values = [];
    const sessions = [];

    switch (timeRange) {
      case 'week': {
        // Last 7 days
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
          
          const dayData = this.getDayData(history, date);
          values.push({
            hours: dayData.focusTime / 3600,
            sessions: dayData.sessions
          });
          sessions.push(...dayData.sessionList);
        }
        break;
      }
      case 'month': {
        // Current month by weeks
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const weeks = Math.ceil((lastDay.getDate() - firstDay.getDate() + 1) / 7);

        for (let i = 0; i < weeks; i++) {
          const weekStart = new Date(firstDay);
          weekStart.setDate(firstDay.getDate() + (i * 7));
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);

          labels.push(`Week ${i + 1}`);
          const weekData = this.getDateRangeData(history, weekStart, weekEnd);
          values.push({
            hours: weekData.focusTime / 3600,
            sessions: weekData.sessions
          });
          sessions.push(...weekData.sessionList);
        }
        break;
      }
      case 'year': {
        // Last 12 months
        for (let i = 11; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          labels.push(date.toLocaleDateString('en-US', { month: 'short' }));
          
          const monthData = this.getMonthData(history, date);
          values.push({
            hours: monthData.focusTime / 3600,
            sessions: monthData.sessions
          });
          sessions.push(...monthData.sessionList);
        }
        break;
      }
    }

    return { labels, values, sessions };
  }

  getDayData(history, date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    return this.getDateRangeData(history, dayStart, dayEnd);
  }

  getMonthData(history, date) {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);

    return this.getDateRangeData(history, monthStart, monthEnd);
  }

  getDateRangeData(history, startDate, endDate) {
    const sessionList = history.filter(session => {
      const sessionDate = new Date(session.timestamp);
      return sessionDate >= startDate && sessionDate <= endDate;
    });

    return {
      focusTime: sessionList.reduce((sum, session) => 
        sum + (session.type === 'Focus Time' ? session.duration : 0), 0),
      sessions: sessionList.filter(session => session.type === 'Focus Time').length,
      sessionList
    };
  }

  updateChartData(data) {
    this.chart.data.labels = data.labels;
    this.chart.data.datasets[0].data = data.values;
    this.chart.update();
  }

  updateStats(data) {
    const totalSessions = data.values.reduce((sum, val) => sum + val.sessions, 0);
    const totalHours = data.values.reduce((sum, val) => sum + val.hours, 0);
    const streak = this.calculateStreak(data.sessions);

    document.getElementById('total-hours').textContent = totalHours.toFixed(1);
    document.getElementById('total-sessions').textContent = totalSessions;
    document.getElementById('current-streak').textContent = `${streak} days`;
  }

  calculateStreak(sessions) {
    if (!sessions.length) return 0;

    let streak = 1;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    const today = currentDate.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    // Check if there's a session today
    const hasSessionToday = sessions.some(session => {
      const sessionDate = new Date(session.timestamp);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate.getTime() === today;
    });

    if (!hasSessionToday) {
      currentDate = new Date(currentDate.getTime() - oneDayMs);
    }

    // Count consecutive days backwards
    while (true) {
      const prevDate = new Date(currentDate.getTime() - oneDayMs);
      prevDate.setHours(0, 0, 0, 0);
      
      const hasSession = sessions.some(session => {
        const sessionDate = new Date(session.timestamp);
        sessionDate.setHours(0, 0, 0, 0);
        return sessionDate.getTime() === prevDate.getTime();
      });

      if (!hasSession) break;
      
      streak++;
      currentDate = prevDate;
    }

    return streak;
  }
}
