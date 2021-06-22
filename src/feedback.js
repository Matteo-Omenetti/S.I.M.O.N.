const fetch = require("node-fetch");


/**
 * Send the feedback for the given suggestion
 * @param {String} suggestion the suggestion returned by the NN
 * @param {String} methodContent the content of the method
 * @param {Boolean} isPositive whether the suggestion has been accepted or not 
 * @param {String} url the url that hosts the feedback service
 */
const sendFeedback = (suggestion, methodContent, isPositive, url, name) => {
    data = {
        "suggestion": suggestion,
        "methodContent": methodContent,
        "isPositive": isPositive
    }
    if (name != undefined && name.trim() != "") {
      data["name"] = name;
    }
    payload = {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        method: "POST",
        body: JSON.stringify(data)
      }

      fetch(url, payload)


}

exports.sendFeedback = sendFeedback