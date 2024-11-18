let cpuChart, memoryDiskChart, networkChart;
let consoleOutput, clearConsoleBtn, pauseConsoleBtn;
let lastActivity = Date.now();
let idleTimer;
let consoleLines = [];
let consoleConfig = {
    isPaused: false
};
let config = {};

function fetchConfig() {
    return fetch('/get-config')
        .then(response => response.json())
        .then(data => {
            config = data;
            return config;
        })
        .catch(error => console.error('Error fetching config:', error));
}

function createCharts() {
    const ctx1 = document.getElementById('cpuChart').getContext('2d');
    const ctx2 = document.getElementById('memoryDiskChart').getContext('2d');
    const ctx3 = document.getElementById('networkChart').getContext('2d');

    cpuChart = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'CPU Usage',
                data: [],
                borderColor: '#3e7bfa',
                backgroundColor: 'rgba(62, 123, 250, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });

    memoryDiskChart = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Memory Usage',
                    data: [],
                    borderColor: '#64dae2',
                    backgroundColor: 'rgba(100, 218, 226, 0.1)',
                    tension: 0.4
                },
                {
                    label: 'Disk Usage',
                    data: [],
                    borderColor: '#fdac42',
                    backgroundColor: 'rgba(253, 172, 66, 0.1)',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });

    networkChart = new Chart(ctx3, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Network Upload Speed',
                    data: [],
                    borderColor: '#ff8800',
                    backgroundColor: 'rgba(255, 136, 0, 0.1)',
                    tension: 0.4
                },
                {
                    label: 'Network Download Speed',
                    data: [],
                    borderColor: '#06c270',
                    backgroundColor: 'rgba(6, 194, 112, 0.1)',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Speed (bytes/s)'
                    }
                }
            }
        }
    });
}

function updateCharts(data) {
    // Use the history data from the backend
    const labels = data.history.map(point => point.timestamp);
    const cpuData = data.history.map(point => point.cpu);
    const memoryData = data.history.map(point => point.memory);
    const diskData = data.history.map(point => point.disk);
    const networkSentData = data.history.map(point => point.network.sent);
    const networkRecvData = data.history.map(point => point.network.recv);

    cpuChart.data.labels = labels;
    cpuChart.data.datasets[0].data = cpuData;

    memoryDiskChart.data.labels = labels;
    memoryDiskChart.data.datasets[0].data = memoryData;
    memoryDiskChart.data.datasets[1].data = diskData;

    networkChart.data.labels = labels;
    networkChart.data.datasets[0].data = networkSentData;
    networkChart.data.datasets[1].data = networkRecvData;

    cpuChart.update();
    memoryDiskChart.update();
    networkChart.update();
}

function updateSystemStatus(data) {
    const current = data.current;
    document.getElementById('cpuUsage').textContent = current.cpu.toFixed(1);
    document.getElementById('memoryUsage').textContent = current.memory.toFixed(1);
    document.getElementById('diskUsage').textContent = current.disk.toFixed(1);
    document.getElementById('networkSent').textContent = current.network.sent_formatted;
    document.getElementById('networkRecv').textContent = current.network.recv_formatted;
}

function fetchData() {
    fetch('/update_data')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            updateCharts(data);
            updateSystemStatus(data);
        })
        .catch(error => {
            console.error('Error fetching system data:', error);
        });
}

function resetIdleTimer() {
    lastActivity = Date.now();
    document.getElementById('idleStatus').classList.remove('active');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(setIdle, config.SET_IDLE_TIME);
}

function setIdle() {
    document.getElementById('idleStatus').classList.add('active');
}

function updateConsole(newOutputs) {
    if (consoleConfig.isPaused) return;

    newOutputs.forEach(output => {
        const line = document.createElement('div');
        line.className = `output-${output.type}`;
        line.innerHTML = `<span class="timestamp">${output.timestamp}</span>${output.text}`;
        consoleOutput.appendChild(line);
    });

    if (consoleOutput.scrollHeight - consoleOutput.scrollTop <= consoleOutput.clientHeight + 50) {
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }
}

function fetchConsoleOutput() {
    fetch('/get-console-output')
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                updateConsole(data);
            }
        })
        .catch(error => console.error('Error fetching console output:', error));
}

function clearConsole() {
    fetch('/clear-console')
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                consoleOutput.innerHTML = '';
            }
        })
        .catch(error => console.error('Error clearing console:', error));
}

// Event listeners for activity reset
document.addEventListener('mousemove', resetIdleTimer);
document.addEventListener('keydown', resetIdleTimer);

// Initialize application
window.addEventListener('load', () => {
    fetchConfig().then(() => {
        // Initialize charts
        createCharts();
        fetchData();
        setInterval(fetchData, config.SYSMON_REFRESH_RATE);
        resetIdleTimer();

        // Setup console elements
        consoleOutput = document.getElementById('console-output');
        clearConsoleBtn = document.getElementById('clear-console');
        pauseConsoleBtn = document.getElementById('pause-console');

        // Setup console controls
        clearConsoleBtn.addEventListener('click', clearConsole);

        pauseConsoleBtn.addEventListener('click', () => {
            consoleConfig.isPaused = !consoleConfig.isPaused;
            pauseConsoleBtn.textContent = consoleConfig.isPaused ? 'Resume' : 'Pause';
        });

        // Start console polling
        setInterval(fetchConsoleOutput, config.CONSOLE_REFRESH_INTERVAL);
    });
});