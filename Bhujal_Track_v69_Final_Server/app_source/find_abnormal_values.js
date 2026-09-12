const fs = require('fs');

// We can check the preloaded json files or visitsHistory if we can find any file dumps.
// Since we don't have direct access to AsyncStorage SQLite database, let's write a node script
// that reads the files in the workspace to see if there are any other excel files, or we can check
// how TrendChart.js generates values.
// Let's inspect TrendChart.js around lines 1323-1431 where averageMultipleTrends is defined.
// Wait! Let's write a script that runs in node and prints the contents of visits history and wtto cache
// if they are stored in the emulator. Wait, we can run a shell command on adb to search the shared preferences
// or databases of com.groundwater.monitor!
// Let's run a shell command to see where the app stores its databases.
console.log("Checking database files on emulator...");
