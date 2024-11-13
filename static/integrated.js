let cpuChart, memoryDiskChart, networkChart;
let consoleOutput, clearConsoleBtn, pauseConsoleBtn;
let lastActivity = Date.now();
let idleTimer;
let consoleLines = [];
let consoleConfig = {
    isPaused: false
};

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
    const timestamp = new Date().toLocaleTimeString();

    cpuChart.data.labels.push(timestamp);
    cpuChart.data.datasets[0].data.push(data.cpu);

    memoryDiskChart.data.labels.push(timestamp);
    memoryDiskChart.data.datasets[0].data.push(data.memory);
    memoryDiskChart.data.datasets[1].data.push(data.disk);

    networkChart.data.labels.push(timestamp);
    networkChart.data.datasets[0].data.push(data.network.sent);
    networkChart.data.datasets[1].data.push(data.network.recv);

    if (cpuChart.data.labels.length > LIMIT_DISPLAYED_DATAPOINTS) {
        cpuChart.data.labels.shift();
        cpuChart.data.datasets[0].data.shift();
        memoryDiskChart.data.labels.shift();
        memoryDiskChart.data.datasets[0].data.shift();
        memoryDiskChart.data.datasets[1].data.shift();
        networkChart.data.labels.shift();
        networkChart.data.datasets[0].data.shift();
        networkChart.data.datasets[1].data.shift();
    }

    cpuChart.update();
    memoryDiskChart.update();
    networkChart.update();
}

function updateSystemStatus(data) {
    document.getElementById('cpuUsage').textContent = data.cpu.toFixed(1);
    document.getElementById('memoryUsage').textContent = data.memory.toFixed(1);
    document.getElementById('diskUsage').textContent = data.disk.toFixed(1);
    document.getElementById('networkSent').textContent = formatBytes(data.network.sent) + '/s';
    document.getElementById('networkRecv').textContent = formatBytes(data.network.recv) + '/s';
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Update the data fetching to handle errors
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
    idleTimer = setTimeout(setIdle, SET_IDLE_TIME);
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
        consoleLines.push(line);
    });

    // Trim excess lines
    while (consoleLines.length > CONSOLE_MAX_LINES) {
        consoleLines.shift();
    }

    // Update display
    consoleOutput.innerHTML = '';
    consoleLines.forEach(line => consoleOutput.appendChild(line));

    // Auto-scroll to bottom if not manually scrolled up
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

document.addEventListener('mousemove', resetIdleTimer);
document.addEventListener('keydown', resetIdleTimer);

window.addEventListener('load', () => {
    createCharts();
    fetchData();
    setInterval(fetchData, SYSMON_REFRESH_RATE);
    resetIdleTimer();

    // Console-related code
    consoleOutput = document.getElementById('console-output');
    clearConsoleBtn = document.getElementById('clear-console');
    pauseConsoleBtn = document.getElementById('pause-console');

    clearConsoleBtn.addEventListener('click', () => {
        consoleLines = [];
        consoleOutput.innerHTML = '';
    });

    pauseConsoleBtn.addEventListener('click', () => {
        consoleConfig.isPaused = !consoleConfig.isPaused;
        pauseConsoleBtn.textContent = consoleConfig.isPaused ? 'Resume' : 'Pause';
    });

    setInterval(fetchConsoleOutput, CONSOLE_REFRESH_INTERVAL);
});
