const fs = require('fs');

const writeLog = (message) => {
    message += "\n"
    fs.appendFile("/Users/Shared/Omenetti_Matteo_Logs.txt", message, function(err) {
        if(err) {
            return console.log(err);
        }
    }); 
}

exports.writeLog = writeLog;