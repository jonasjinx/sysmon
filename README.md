# sysmon

a very simple system monitor made to explore some concepts in python.

open ** http://127.0.0.1:5000 ** in your browser to see the output

### features
- measures system metrics and outputs them visually - similar to the windows task manager
- checks if the machine it runs on has a NVIDIA gpu or not
- checks if the user was afk for some time
- mirrors outputs of the python console and displays them

## how it works
- it utilizes flask to output to a web interface
- runs a local server (thus you have to use your browser and localhost to access)
- uses chart.js for visualization
- some configurations can be made at the beginning of the py script (intervals, console filtering,...)

this is NOT a finished product, feel free to explore the code and submit suggestions, bugfixes etc.
