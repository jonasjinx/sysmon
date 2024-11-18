from flask import Flask, render_template, jsonify
import psutil
import platform
import sys
import logging
from queue import Queue
from threading import Lock
import datetime
import time
import math

app = Flask(__name__)

#########################
# CONFIGURATION
#########################

app.config['SYSMON_REFRESH_RATE'] = 2500            
app.config['LIMIT_DISPLAYED_DATAPOINTS'] = 30
app.config['SET_IDLE_TIME'] = 300000                # 5 minutes in milliseconds
app.config['CONSOLE_MAX_LINES'] = 100
app.config['CONSOLE_REFRESH_INTERVAL'] = 5000       # 5 seconds
SET_CPU_METRICS_INTERVAL = 2

# FILTER CONSOLE OUTPUT
displayfilter = ["GET", "Leberwurst"]

# Initialize data storage
cpu_data = []
memory_data = []
disk_data = []
network_data = []
console_lines = []

# Store last network values for delta calculation
last_network_sent = 0
last_network_recv = 0
last_network_time = time.time()

def format_bytes(bytes_value):
    """Format bytes to human readable format"""
    if bytes_value == 0:
        return '0 Bytes'
    k = 1024
    sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    i = int(math.floor(math.log(bytes_value) / math.log(k)))
    return f"{(bytes_value / (k ** i)):.2f} {sizes[i]}/s"

#########################
# System Monitoring
#########################

def get_system_info():
    global last_network_sent, last_network_recv, last_network_time
    
    # Get CPU usage with interval
    cpu_percent = psutil.cpu_percent(interval=SET_CPU_METRICS_INTERVAL)
    
    # Get memory info
    memory = psutil.virtual_memory()
    
    # Get disk info
    disk = psutil.disk_usage('/')
    
    # Get network info and calculate delta
    network = psutil.net_io_counters()
    current_time = time.time()
    time_delta = current_time - last_network_time
    
    # Calculate network speed in bytes per second
    sent_speed = (network.bytes_sent - last_network_sent) / time_delta
    recv_speed = (network.bytes_recv - last_network_recv) / time_delta
    
    # Update last values
    last_network_sent = network.bytes_sent
    last_network_recv = network.bytes_recv
    last_network_time = current_time

    # Get current timestamp
    timestamp = datetime.datetime.now().strftime('%H:%M:%S')

    # Store historical data
    data_point = {
        'timestamp': timestamp,
        'cpu': cpu_percent,
        'memory': memory.percent,
        'disk': disk.percent,
        'network': {
            'sent': sent_speed,
            'recv': recv_speed,
            'sent_formatted': format_bytes(sent_speed),
            'recv_formatted': format_bytes(recv_speed)
        }
    }

    # Add to history and maintain limit
    cpu_data.append(data_point)
    if len(cpu_data) > app.config['LIMIT_DISPLAYED_DATAPOINTS']:
        cpu_data.pop(0)

    return {
        'current': data_point,
        'history': cpu_data
    }

def get_hardware_info():
    try:
        import pynvml
        pynvml.nvmlInit()
        nvidia_gpu = True
    except:
        nvidia_gpu = False

    return {
        'os': platform.system(),
        'cpu': platform.processor(),
        'ram': f"{psutil.virtual_memory().total / (1024**3):.2f} GB",
        'nvidia_gpu': nvidia_gpu
    }

#########################
# Console Management
#########################

class ConsoleManager:
    def __init__(self, max_lines=100):
        self.max_lines = max_lines
        self.lines = []
        self.lock = Lock()

    def add_line(self, text, output_type='stdout'):
        with self.lock:
            timestamp = datetime.datetime.now().strftime('%H:%M:%S')
            line = {
                'text': text,
                'timestamp': timestamp,
                'type': output_type
            }
            
            if self.filter_line(line):
                self.lines.append(line)
                if len(self.lines) > self.max_lines:
                    self.lines.pop(0)
                return True
            return False

    def filter_line(self, line):
        """Filter console output based on displayfilter"""
        text = line['text']
        return not any(filter_str in text for filter_str in displayfilter)

    def get_lines(self):
        with self.lock:
            return self.lines.copy()

    def clear(self):
        with self.lock:
            self.lines = []

console_manager = ConsoleManager(app.config['CONSOLE_MAX_LINES'])

#########################
# Logging Setup
#########################

class ConsoleQueueHandler(logging.Handler):
    def emit(self, record):
        text = self.format(record)
        console_manager.add_line(text, 'log')

# Custom stream to capture both stdout and stderr
class ConsoleCapture:
    def __init__(self, stream_type='stdout'):
        self.stream_type = stream_type
        self._real_stdout = sys.__stdout__
        self._real_stderr = sys.__stderr__

    def write(self, text):
        try:
            if isinstance(text, bytes):
                text = text.decode('utf-8', errors='replace')

            if text.strip():
                console_manager.add_line(text, self.stream_type)

                if self.stream_type == 'stdout':
                    self._real_stdout.write(text)
                else:
                    self._real_stderr.write(text)
        except Exception as e:
            sys.__stderr__.write(f"ConsoleCapture error: {str(e)}\n")

    def flush(self):
        if self.stream_type == 'stdout':
            self._real_stdout.flush()
        else:
            self._real_stderr.flush()

    def fileno(self):
        if self.stream_type == 'stdout':
            return self._real_stdout.fileno()
        else:
            return self._real_stderr.fileno()

# Set up logging
logging.basicConfig(format='%(message)s', level=logging.INFO)
werkzeug_handler = ConsoleQueueHandler()
werkzeug_handler.setFormatter(logging.Formatter('%(message)s'))

logger = logging.getLogger('werkzeug')
logger.handlers = []
logger.addHandler(werkzeug_handler)
logger.setLevel(logging.INFO)

sys.stdout = ConsoleCapture('stdout')
sys.stderr = ConsoleCapture('stderr')

#########################
# Routes
#########################

@app.route('/')
def index():
    print("Accessing index page")
    return render_template('integrated.html', 
                         hardware_info=get_hardware_info(), 
                         config=app.config)

@app.route('/update_data')
def update_data():
    return jsonify(get_system_info())

@app.route('/get-console-output')
def get_console_output():
    return jsonify(console_manager.get_lines())

@app.route('/clear-console')
def clear_console():
    console_manager.clear()
    return jsonify({'status': 'success'})

@app.route('/get-config')
def get_config():
    return jsonify({
        'SYSMON_REFRESH_RATE': app.config['SYSMON_REFRESH_RATE'],
        'LIMIT_DISPLAYED_DATAPOINTS': app.config['LIMIT_DISPLAYED_DATAPOINTS'],
        'SET_IDLE_TIME': app.config['SET_IDLE_TIME'],
        'CONSOLE_MAX_LINES': app.config['CONSOLE_MAX_LINES'],
        'CONSOLE_REFRESH_INTERVAL': app.config['CONSOLE_REFRESH_INTERVAL']
    })

if __name__ == '__main__':
    print("Starting Flask application...")
    app.run(debug=True)