# System Monitoring app by Jonas Buchfink
from flask import Flask, render_template, jsonify
import psutil
import platform
import sys
import logging
from queue import Queue
from threading import Lock
import datetime
import time

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

# Store last network values for delta calculation
last_network_sent = 0
last_network_recv = 0
last_network_time = time.time()


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

    # Store historical data
    cpu_data.append(cpu_percent)
    memory_data.append(memory.percent)
    disk_data.append(disk.percent)
    network_data.append((sent_speed, recv_speed))

    # Limit data points
    if len(cpu_data) > app.config['LIMIT_DISPLAYED_DATAPOINTS']:
        cpu_data.pop(0)
        memory_data.pop(0)
        disk_data.pop(0)
        network_data.pop(0)

    return {
        'cpu': cpu_percent,
        'memory': memory.percent,
        'disk': disk.percent,
        'network': {
            'sent': sent_speed,  # Now sending speed instead of total
            'recv': recv_speed   # Now sending speed instead of total
        },
        'cpu_data': cpu_data,
        'memory_data': memory_data,
        'disk_data': disk_data,
        'network_data': [{'sent': sent, 'recv': recv} for sent, recv in network_data]
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
# Logging
#########################

# Custom logging handler for Flask
class ConsoleQueueHandler(logging.Handler):
    def emit(self, record):
        with output_lock:
            console_output.put({
                'text': self.format(record),
                'timestamp': datetime.datetime.now().strftime('%H:%M:%S'),
                'type': 'log'
            })

# Custom stream to capture both stdout and stderr
class ConsoleCapture:
    def __init__(self, stream_type='stdout'):
        self.stream_type = stream_type
        self._real_stdout = sys.__stdout__
        self._real_stderr = sys.__stderr__

    def write(self, text):
        try:
            # Convert bytes to string if necessary
            if isinstance(text, bytes):
                text = text.decode('utf-8', errors='replace')

            if text.strip():  # Only process non-empty strings
                with output_lock:
                    console_output.put({
                        'text': text,
                        'timestamp': datetime.datetime.now().strftime('%H:%M:%S'),
                        'type': self.stream_type
                    })

                # Write to real console as well
                if self.stream_type == 'stdout':
                    self._real_stdout.write(text)
                else:
                    self._real_stderr.write(text)
        except Exception as e:
            # If something goes wrong, write to real stderr
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
logging.basicConfig(
    format='%(message)s',
    level=logging.INFO
)

# Custom formatter for Werkzeug
werkzeug_handler = ConsoleQueueHandler()
werkzeug_handler.setFormatter(logging.Formatter('%(message)s'))

# Set up logging for Werkzeug
logger = logging.getLogger('werkzeug')
logger.handlers = []  # Remove default handlers
logger.addHandler(werkzeug_handler)
logger.setLevel(logging.INFO)

# Replace system stdout and stderr with our custom streams
sys.stdout = ConsoleCapture('stdout')
sys.stderr = ConsoleCapture('stderr')

def filter_console_output(line_dict, filters):
    """
    Prüft, ob eine Konsolenzeile gefiltert werden soll.
    
    Args:
        line_dict (dict): Dictionary mit der Konsolenzeile ('text', 'timestamp', 'type')
        filters (list): Liste von Strings, die gefiltert werden sollen
    
    Returns:
        bool: True wenn die Zeile behalten werden soll, False wenn sie gefiltert werden soll
    """
    text = line_dict['text']
    for filter_string in filters:
        if filter_string in text:
            return False
    return True


#########################
# OUTPUT TO APP
#########################

# Queue to store console output
console_output = Queue()
output_lock = Lock()

@app.route('/')
def index():
    print("Accessing index page")
    return render_template('integrated.html', 
                           hardware_info=get_hardware_info(), 
                           config=app.config)  # Pass the entire config

@app.route('/update_data')
def update_data():
    data = get_system_info()
    # print("Sending data:", data)  # Debug print
    return jsonify(data)

@app.route('/get-console-output')
def get_console_output():
    outputs = []
    with output_lock:
        while not console_output.empty():
            line = console_output.get()
            if filter_console_output(line, displayfilter):
                outputs.append(line)
    return jsonify(outputs)

if __name__ == '__main__':
    print("Starting Flask application...")
    app.run(debug=True)