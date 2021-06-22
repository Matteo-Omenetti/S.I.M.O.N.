// --------------------------------------------
// this is the main file that is ran by Vs-Code
// --------------------------------------------

//To run the extenstion press 'fn'+'f5' --> VS code extension development'

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const parser = require('./parser')
const myEditor = require('./editor')
const handleKeyPresses = require('./handleKeyPresses')
const feedback = require('./feedback');
const fs = require('fs');

// this array contains the chars for which the plugin is going to be triggered
triggerChars = [" ", ".", ","];

// this counter keeps track of the previous position of the caret
oldLine = -1;
// this boolean tells you if the current line contains code (true) or a comment (false)
isCode = true;

// this variable holds the url to query for code completion
// this variable is set by defualt (see package.json)
// and can be changed in the settings
urlCode = ""
// this variable holds the url to query for comment completion
// this variable is set by defualt (see package.json)
// and can be changed in the settings
urlComment = ""

// this variable can be sent to the serve when asking for a recommnedation.
// this will enable the server to distiguish your requests from all the others
name = null;

// the color of the suggestion. Depanding of the vs-code theme the user is using, the default color (dark grey) could
// not be visible. This variable can be modified in the settings.
suggestionColor = "#505050"

// Specify the minimum confidence for the prediction returned by the Neural Network for code. 
// If confidence for the current prediction is below the specified number, the predictions will not be shown
confidenceCode = 90;

// Specify the minimum confidence for the prediction returned by the Neural Network for comments. 
// If confidence for the current prediction is below the specified number, the predictions will not be shown
confidenceComment = 90;

// if the cursor is inside a code or comment an which type of comment (single line, multi line, javadoc)
inCodeOrComment = false;

// the url for the server that stores the recommendations
urlFeedback = "http://gym.si.usi.ch:45002/feedback/"

// if true and a single line comment is dected on the same line of some code, move the comment to line above
singleLineComment = true;

/**
 * parse the array of json objects for urls defined in the settings
 * @param {Array[JSON]} arr the array of JSON objects representing the user settings for the given url
 * @returns {String || undefined}  the url field of the first JSON object with the enable parameter set to true,
 *                                  undefined if no such objects is found. 
 */
function parseJson(arr) {
    for (const o of arr) {
        // return the the first url enabled
        if (o.enable == true) {
            return o.url;
        }
    }
    return undefined;
}

/**
 * get the parameters set in the settings and set the variables accordingly
 * @returns {void}
 */
function getMyConfiguration() {
    // get all the settings
    configutation = vscode.workspace.getConfiguration('simon');

    // parse the settings for code completion
    urlCode = parseJson(configutation.urlCode);
    // set to defaulr url in case of undefined
    if (urlCode == undefined) {
        urlCode = "http://gym.si.usi.ch:45001/code/"
    }

    // parse the settings for comment completion
    urlComment = parseJson(configutation.urlComment);
    // set to default url in case of undefined
    if (urlComment == undefined) {
        urlComment = "http://gym.si.usi.ch:45001/comment/"
    }

    // get the chars that trigger code/comment completion
    triggerChars = configutation.triggerChars;

    // get the name parameter
    name = configutation.name;

    // get the suggestion color parameter
    suggestionColor = configutation.suggestionColor;

    // get the confidence parameter for the code NN
    confidenceCode = configutation.confidenceCode;

    // get the confidence parameter for the comment NN
    confidenceComment = configutation.confidenceComment;

    // get the feedbackUrl parameter
    urlFeedback = configutation.urlFeedback;

    // get the boolean to move single line comments to newlines
    singleLineComment = configutation.singleLineComment;

    console.log(urlCode, urlComment, triggerChars, name, suggestionColor, confidenceCode, confidenceComment, urlFeedback, singleLineComment)
}

/**
 * this function is called when the user types something
 * @returns {void}
 */
function handleChangeDocument() {

    if (myEditor.getIsBlocked() == true) {
        return;
    }


    editor = vscode.window.activeTextEditor

    // the extension is available only when working with java files
    if (editor.document.fileName.indexOf(".java") <= 0) {
        console.log("You are not working with a java file")
        return;
    }

    // get the current position of the caret
    caretPosition = editor.selection.active;
    // get the content of the current line
    documentLine = editor.document.lineAt(caretPosition)._text
    // fetch the char at the current position of the caret, this is the char that the user has just wrote
    charAtCaret = documentLine.charAt(caretPosition.character);
    // the length of the next line
    lineLength = editor.document.lineAt(caretPosition.line + 1)._text.trim().length;
    // if the user types one of these chars, set oldLine to -1 in order to recompute 
    // the kind of line the user is typing (comment or code)
    if (charAtCaret == "/" || charAtCaret == "*" || parser.getTypeOfLine() == 2) {
        console.log("Set oldLine = -1")
        oldLine = -1;
    }

    // the user has just pressed return and we were in a single line comment
    if ((lineLength == 0 && isNaN(charAtCaret.charCodeAt())) && ((inCodeOrComment == 1) || oldLine == -1)) {
        oldLine = -1;
        inCodeOrComment = 0;
        handleKeyPresses.handleKeyPresses(urlCode, triggerChars, suggestionColor, inCodeOrComment, confidenceCode, urlFeedback, singleLineComment, name);
        return;
    }

    // if since the previous char we didn't move this means that we don't have to try 
    // to understand again whether we are in a comment or not
    if (oldLine == caretPosition.line) {
        // if before we were in code then we call the code completion NN
        if (isCode) {
            console.log("we are in the same line and I call code")
            handleKeyPresses.handleKeyPresses(urlCode, triggerChars, suggestionColor, inCodeOrComment, confidenceCode, urlFeedback, singleLineComment, name);
        } else {
            // otherwise we call the comment completion NN
            console.log("we are in the same line and I call comment")
            handleKeyPresses.handleKeyPresses(urlComment, triggerChars, suggestionColor, inCodeOrComment, confidenceComment, urlFeedback, singleLineComment, name)
        }
    } else {
        // we changed line, now we have to understand whether we are in a comment or in code
        console.log("recomputing the line")
        oldLine = caretPosition.line;

        lt = parser.commentOrCode()
        inCodeOrComment = lt;
        if (lt == 0) {
            isCode = true;
            handleKeyPresses.handleKeyPresses(urlCode, triggerChars, suggestionColor, inCodeOrComment, confidenceCode, urlFeedback, singleLineComment, name);
        } else {
            isCode = false;
            handleKeyPresses.handleKeyPresses(urlComment, triggerChars, suggestionColor, inCodeOrComment, confidenceComment, urlFeedback, singleLineComment, name);
        }
    }  
    
}


// this is the main function in which you need to register the commands defined in package.json
async function activate(context) {

    // create the file to write the logs
    fs.writeFile("/Users/Shared/Omenetti_Matteo_Logs.txt", "", function(err) {
        if(err) {
            return console.log(err);
        }
    }); 

    getMyConfiguration();
    // if the user changes the setting this function is called
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        getMyConfiguration();
    }));


    // this function is called when the user types something
    // (and also when the document is modified for example by a copy and paste)
    vscode.workspace.onDidChangeTextDocument((e) => {
        handleChangeDocument();
    });


    vscode.window.onDidChangeTextEditorSelection((e) => {
        // if the user moves the cursor with the mouse, then remove the suggestion
        if (e.kind == 2) {
            if (myEditor.getIsPresent() == true) {
                myEditor.removeSuggestion();
                //vscode.window.showInformationMessage('A suggestion has been rejected!');
                feedback.sendFeedback(s, myEditor.getMethodContent(), false, urlFeedback, name)
            }

        }
    })
    // this is the command to accept the suggestion
    let disposable = vscode.commands.registerCommand('simon.accept', function () {
        if (myEditor.getIsPresent() == false) {
            return
        }
        editor = vscode.window.activeTextEditor;
        if (editor == undefined) {
            return
        }
        // get the current position of the caret
        caretPosition = editor.selection.active;
        // get the content of the current line
        line = editor.document.lineAt(caretPosition)._text
        myEditor.acceptSuggestion(line, handleKeyPresses.getStartTyping());
        oldLine = -1;
        handleKeyPresses.setWasRec(false);
        // show a pup-up message for debugging purposes
        //vscode.window.showInformationMessage('A suggestion has been accepted!');
        feedback.sendFeedback(s, myEditor.getMethodContent(), true, urlFeedback, name)
    }, );

    context.subscriptions.push(disposable);

    // remove the suggestion manually with a shortcut
    disposable = vscode.commands.registerCommand('simon.delete', function () {
        if (myEditor.getIsPresent() == false) {
            return
        }
        myEditor.removeSuggestion();
        // show a pup-up message for debugging purposes
        // vscode.window.showInformationMessage('A suggestion has been rejected!');
        // send a negative feedback to the server
        feedback.sendFeedback(s, myEditor.getMethodContent(), false, urlFeedback, name)
    });
   

     // trigger the suggestion manually with a shortcut
     disposable = vscode.commands.registerCommand('simon.trigger', function () {

        editor = vscode.window.activeTextEditor
        // the extension is available only when working with java files
        if (editor.document.fileName.indexOf(".java") <= 0) {
            console.log("You are not working a java file")
            return;
        }
        myEditor.removeSuggestion()

        if (parser.commentOrCode() == 0) {
            myEditor.removeAndShow(urlCode, suggestionColor, inCodeOrComment, confidenceCode);
        } else {
            myEditor.removeAndShow(urlComment, suggestionColor, inCodeOrComment, confidenceComment);
        }
        // vscode.window.showInformationMessage('A suggestion has been triggered manually!');
    });
}


// this method is called when your extension is deactivated
function deactivate() {}

module.exports = {
    activate,
    deactivate
}