// ---------------------------------------------------------------------------
// this file contains the functions required to call the neural network
// ---------------------------------------------------------------------------

// the libray to get acccess to the vs-code api
const vscode = require('vscode');
const handle = require('./handleKeyPresses')
// the library to make http calls to the server that hosts the NN
const fetch = require("node-fetch");
const parser = require('./parser')

// the regex to find method declarations
const regexp = new RegExp("(public|private|static|protected|abstract|native|synchronized) *([a-zA-Z0-9<>._?[\\], ]+) +([a-zA-Z0-9_]+) *\\([a-zA-Z0-9<>\\[\\]._?, \n]*\\) *([a-zA-Z0-9_ ,\n]*) *\\{?", "g")
const regexpConstructor = new RegExp("(public|private|protected|abstract|native) +([a-zA-Z0-9_]+) *\\([a-zA-Z0-9<>\\[\\]._?, \n]*\\) *([a-zA-Z0-9_ ,\n]*) *\\{?", "g")
/**
 * this method performs a request to the NN at the url passed as a parameter
 * @param {String} methodContent the content of the method in which the cursor currently is
 * @param {String} url the url in which the NN is hosted
 * @param {Boolean} inCodeOrComment whether the cursor is in code or comment and cìshich type of comment (single line, multi line, javadoc)
 * @param {Integer} confidence the minimum confidence that a suggestion must have in order to be shown
 * @return {String}    the best suggestion
 */
async function neuralNetwork(methodContent, url, inCodeOrComment, confidence) {
    data = {
        "input": methodContent,
        // how many suggestions you want
        "beam": 2,
        // if the cursor is currently in a javadoc
        "javadoc": inCodeOrComment == 3
    }
    payload = {
        headers: {
            'Content-Type': 'application/json'
        },
        method: "POST",
        body: JSON.stringify(data)
    }
    

    // make the post request and fetch the suggestion of the NN
    tmp = await fetch(url, payload);
    tmp = await tmp.json();
    console.log(tmp)
    sugg = tmp.text.pred_0[0];
    conf = tmp.text.pred_0[1];
    // if the prediction of the model is too low
    console.log("The confidence of the model is " + conf * 100 + "%")
    if (conf * 100 < confidence) {
        // vscode.window.showInformationMessage('The confidence of the NN was below the specified treshold... RETURNING');
        console.log("The confidence of the NN was below the specified treshold")
        return undefined;
    }
    sugg = sugg.replaceAll("  ", " ");
    console.log("The prediction of the model is: " + sugg)
    if (sugg.trim() == "") {
        console.log("The prediction of the model is empty string")
        // vscode.window.showInformationMessage('The prediction of the model is empty string... RETURNING');
        return undefined
    }
    return sugg;
}

/**
 * Compute the content of the current method, this is the part in common between computeMethodContent and computeJavadocMethodContent
 * @param {String} fileContent the content of the current file
 * @param {Integer} closestMethodIndex the index of the signature of the closest method in fileContent 
 * @param {vscode.Position} closestMethodPosition the position in the array of results of the closest method
 * @param {array[String]} closestMethodPosition the signatures of all the methods in the current file along with their indeces
 * @returns 
 */
function methodContentHelper(fileContent, closestMethodIndex, closestMethodPosition, regexResult) {

    // extrapolate from the entire file the content of the method
    let methodContent = ""
    if (closestMethodPosition == regexResult.length - 1) {
        methodContent = fileContent.substring(closestMethodIndex, fileContent.length).trim();
        methodContent = methodContent.substring(0, methodContent.length - 1).trim();
    } else {
        methodContent = fileContent.substring(closestMethodIndex, regexResult[closestMethodPosition + 1].index).trim();
    }

    // the purpose of this for loop is to discard evrything in between the current method declaration
    // and the next method declaration, for example comments or variable declarations
    // in order to do that we need to understand the position of the last "}"
    methodSplit = methodContent.split("\n")
    // the position of the last closing "}"
    final = methodSplit.length - 1;
    for (let i = methodSplit.length - 1; i >= 0; i--) {

        // get the content of the line
        l = methodSplit[i];
        // get the position of "}" (if present)
        c = l.indexOf("}");
        // if there is a close curly brache
        if (c >= 0) {
            pos = new vscode.Position(i, c)
            // if the curly brache is in a comment, discard it
            if (parser.isSingleLine(pos, methodSplit) || parser.isMultiLine(pos, methodSplit) || parser.isJavaDoc(pos, methodSplit)) {
                continue;
            }
            // if the curly brache is in code, remember its position
            final = i;
            break;
        }
    }

    // remove everything, but the content of the method
    methodSplit.length = final + 1;
    methodContent = methodSplit.join("\n")

    return methodContent
}

/**
 * Parse the current file and retrieve the current method body
 * This is a general method that is used both for the code and commment NN 
 * @param {String} fileContent the content of the current file
 * @param {vscode.Position} caretPosition the offset of the caret
 * @returns {String} methodContent the content of the current method
 */
function computeMethodContent(fileContent, caretOffset) {
    // find every method declaration and their indexes (offsets)
    regexResult = fileContent.matchAll(regexp)
    regexResult = Array.from(regexResult);
    if (regexResult.length == 0) {
        regexResult = fileContent.matchAll(regexpConstructor)
        regexResult = Array.from(regexResult);
    }
    console.log(regexResult)

    // if a method couldn't be found
    if (regexResult.length == 0) {
        // vscode.window.showInformationMessage('A method couldnt be found... RETURNING');
        console.log("A method couldnt be found... RETURNING")
        return undefined;
    }

    //if you are above any method declaration
    if (caretOffset < regexResult[0].index) {
        // vscode.window.showInformationMessage('You are above any method declaration... RETURNING');
        console.log("You are above any method declaration... RETURNING")
        return undefined;
    }

    // compute the closest method declaration to the position of the caret
    closestMethodIndex = -1;
    closestMethodPosition = -1;
    for (let i = 0; i < regexResult.length; i++) {
        index = regexResult[i].index;
        // the method declaration must be above (or in the same line) of the caret position the caret position
        // I keep getting the one that is closest
        if (index <= caretOffset) {
            closestMethodPosition = i
            closestMethodIndex = index;
        }
    }

    return methodContentHelper(fileContent, closestMethodIndex, closestMethodPosition, regexResult)
}

/**
 * Parse the current file and the method to which the current javadoc is referring to
 * @param {String} fileContent the content of the current file
 * @param {vscode.Position} caretPosition the offset of the caret
 * @returns {String} methodContent the content of the current method
 */
function computeJavadocMethodContent(fileContent, caretOffset) {
    // find every method declaration and their indexes (offsets)
    regexResult = fileContent.matchAll(regexp)
    regexResult = Array.from(regexResult);
    if (regexResult.length == 0) {
        regexResult = fileContent.matchAll(regexpConstructor)
        regexResult = Array.from(regexResult);
    }

    // if a method couldn't be found
    if (regexResult.length == 0) {
        // vscode.window.showInformationMessage('A method couldnt be found... RETURNING');
        console.log("A method couldnt be found... RETURNING")
        return undefined;
    }

    // compute the closest method declaration to the position of the caret
    closestMethodIndex = -1;
    closestMethodPosition = -1;
    for (let i = 0; i < regexResult.length; i++) {
        index = regexResult[i].index;
        // the method declaration must be below the caret position
        // as soon as I find a greater method declaration than, that's the one that i have to take
        if (index > caretOffset) {
            closestMethodPosition = i
            closestMethodIndex = index;
            break;
        }
    }

    return methodContentHelper(fileContent, closestMethodIndex, closestMethodPosition, regexResult)
}

/**
 * Remove the // at the beginning of the single line comment 
 * @param {String} methodContent the content of the current file
 * @param {vscode.Position} caretPosition the position of the caret 
 * @returns {String} the content of the curret method without "//" and with the special tokens for the comment NN
 */
function handleSingleLine(fileContent, caretPosition, singleLineComment) {

    // remove the "//"" at the beginning of the comment line and insert <sep>
    fileContent = fileContent.split("\n")
    fileContent[caretPosition.line] = fileContent[caretPosition.line].replace("//", "<sep>")
    fileContent[caretPosition.line] = fileContent[caretPosition.line] + " <sep>";

    // this boolean tells you if the comment is at the beggining of the line or if it is right of a line of code
    let isCommentNextToLine = fileContent[caretPosition.line].trim().indexOf("<sep>") > 3;
    // if the comment is on the right of a line of code
    if (isCommentNextToLine && singleLineComment) {
        // we need to undertand where the comment starts
        let indexOfSep = fileContent[caretPosition.line].indexOf("<sep>");
        // get the comment
        let tmp = fileContent[caretPosition.line].substring(indexOfSep);
        // create a regex that matches the comment
        let r = new RegExp("<sep>(.)+")
        // move the comment in the line above
        // if this is the code:
        // this.a = a; // this is a comment
        // then what we ant to get is the following:
        // // this is a comment
        // this.a = a;
        fileContent[caretPosition.line] = tmp + "\n" + fileContent[caretPosition.line].replace(r, "");
    }
    fileContent = fileContent.join("\n")

    return fileContent
}

/**
 * Remove the /* at the beginning of the multi line comment and *\/ at the end of the multi line comment
 * @param {String} fileContent the content of the current file
 * @param {vscode.Position} caretPosition the position of the caret 
 * @returns {String} the content of the curret method without "/*" and with the special tokens for the comment NN
 */
function handleMultiLine(fileContent, caretPosition) {
    fileContent = fileContent.split("\n")

    // from the the current pos look for the first /*
    pos1 = 0;
    for (i = caretPosition.line; i >= 0; i--) {
        // find /*
        if (fileContent[i].indexOf("/*") >= 0) {
            pos1 = i;
            break;
        }
    }

    pos2 = caretPosition.line;
    for (i = caretPosition.line; i < fileContent.length; i++) {
        // find */
        if (fileContent[i].indexOf("*/") >= 0) {
            pos2 = i;
            break;
        }
    }

    // replace /* with the speacial token
    fileContent[pos1] = fileContent[pos1].replace("/*", "<sep>")
    // replace */ with the speacial token
    fileContent[pos2] = fileContent[pos2].replace("*/", "<sep>")
    fileContent = fileContent.join("\n")

    return fileContent
}

/**
 * Remove the /** at the beginning of the multi line comment and **\/ at the end of the multi line comment and return just the javadoc comment
 * @param {String} fileContent the content of the current file
 * @param {vscode.Position} caretPosition the position of the caret 
 * @returns {String} the content of the curret method without "/*" and with the special tokens for the comment NN
 */
function handleJavaDoc(fileContent, caretPosition) {
    fileContent = fileContent.split("\n")

    // from the the current pos look for the first /*
    pos1 = 0;
    for (i = caretPosition.line; i >= 0; i--) {
        // find /** */
        if (fileContent[i].indexOf("/**") >= 0) {
            pos1 = i;
            break;
        }
    }

    pos2 = caretPosition.line;
    for (i = caretPosition.line; i < fileContent.length; i++) {
        // find */
        if (fileContent[i].indexOf("*/") >= 0) {
            pos2 = i;
            break;
        }
    }

    // replace /** with the speacial token
    fileContent[pos1] = fileContent[pos1].replace("/**", "<sep>")
    // replace */ with the speacial token
    fileContent[pos2] = fileContent[pos2].replace("*/", "<sep>")
    fileContent = fileContent.slice(pos1, pos2 + 1)
    fileContent = fileContent.join("\n")
    fileContent = fileContent.replaceAll("*", "")

    return fileContent
}

/**
 * Based on the agreed heusritcs return the String that will be passed to the comment NN 
 * @param {String} methodContent the content of the current method with all the necessary special tokens
 * @returns {String} th string that will be passed to the comment NN
 */
function handleHeuristics(methodContent) {

    methodContent = methodContent.split("\n")

    // I need to find the position of "<extra_id_0>"
    pos = 0;
    for (let i = 0; i < methodContent.length; i++) {
        if (methodContent[i].indexOf("<extra_id_0>") >= 0) {
            pos = i;
            break;
        }
    }

    // from "pos" I need to go up until I find:
    // - empty line
    // - comment 
    // - beginning of the method
    upperBound = 0;
    for (let i = pos - 1; i > 0; i--) {
        // check for empty line condition
        if (methodContent[i].trim() == "") {
            upperBound = i + 1
            break
        }
        // check for comment line condition
        if (methodContent[i].indexOf("*/") >= 0 || methodContent[i].indexOf("//") >= 0) {
            upperBound = i + 1
            break
        }
    }

    // from pos I need to go down, until I find:
    // - emtpy line
    // - }
    // - comment
    lowerBound = 0;
    for (let i = pos + 1; i < methodContent.length; i++) {
        // check for empty line condition
        if (methodContent[i].trim() == "") {
            lowerBound = i
            break
        }
        // check for comment line condition
        if (methodContent[i].indexOf("/*") >= 0 || methodContent[i].indexOf("//") >= 0) {
            lowerBound = i
            break
        }

        // check for curly brace condition
        if (methodContent[i].indexOf("}") >= 0) {
            // +1 because you want to include the closing curlybrace
            lowerBound = i + 1
            break
        }
    }

    // reduce the content of the method based on the bounds that we have just found
    methodContent = methodContent.slice(upperBound, lowerBound)
    // go from an array to a method
    methodContent = methodContent.join("\n")


    return methodContent
}

/**
 * Parse the current file and retrieve the current method body, insert the special token
 * @param {String} fileContent the content of the current file
 * @param {vscode.Position} caretPosition the position of the caret
 * @returns {String} methodContent the content of the current method
 */
function insertSpecialTokens(inCodeOrComment, singleLineComment) {

    editor = vscode.window.activeTextEditor;
    // the position of the caret
    caretPosition = editor.selection.active;
    // the offset of the caret
    caretOffset = editor.document.offsetAt(caretPosition)
    // the content of the current document
    fileContent = editor.document.getText();

    // insert the special token to tell the NN where is the position in which we are expecting the prediction
    fileContent = fileContent.substring(0, caretOffset) + " <extra_id_0> " +
        fileContent.substring(caretOffset, fileContent.length);

    // if we are in code, then there is no need to do anything more than finding the content of the current method
    if (inCodeOrComment == 0) {
        methodContent = computeMethodContent(fileContent, caretOffset)
        return methodContent
    // if we are in a single line comment more parsing is required
    } else if (inCodeOrComment == 1) {
        fileContent = handleSingleLine(fileContent, caretPosition, singleLineComment);
        // compute the content of the current method
        methodContent = computeMethodContent(fileContent, caretOffset)
        if (methodContent == undefined) {
            return undefined
        }
        // in case of comments we don't want to send to the NN the content of the entire method
        // but instead we need to further reduce the content sent to the NN based on some heuristics
        return handleHeuristics(methodContent)
    // if we are in a multi line comment more parsing is required
    } else if (inCodeOrComment == 2) {
        fileContent = handleMultiLine(fileContent, caretPosition);
        // compute the content of the current method
        methodContent = computeMethodContent(fileContent, caretOffset)
        if (methodContent == undefined) {
            return undefined
        }
        // in case of comments we don't want to send to the NN the content of the entire method
        // but instead we need to further reduce the content sent to the NN based on some heuristics
        return handleHeuristics(methodContent)
    } else {
        javaDocComment = handleJavaDoc(fileContent, caretPosition);
        methodContent = computeJavadocMethodContent(fileContent, caretOffset)
        toReturn = methodContent + "\n" + javaDocComment
        return toReturn
    }
}

/**
 *  this method first retrieves some information we need in order to call the NN, then with those information it calls the NN
 * @param {String} url the url in which the NN is hosted
 * @param {Boolean} inCodeOrComment whether the cursor is in code or comment and cìshich type of comment (single line, multi line, javadoc)
 * @param {Integer} confidence the minimum confidence that a suggestion must have in order to be shown
 * @returns {String, String[], Int} the suggestion returned by the NN, the suggestion splitted at "\n" and the
 *                                  number of lines we need to insert in order to make room for the suggestion
 */
const getSuggestion = async (url, inCodeOrComment, confidence, singleLineComment) => {

    // ge the content of method with thge special tokens inserted
    methodContent = insertSpecialTokens(inCodeOrComment, singleLineComment)

    // if a method can't be found
    if (methodContent == undefined) {
        return [undefined, undefined, undefined];
    }


    console.log("The content of the method is: \n" + methodContent)
    // vscode.window.showInformationMessage('The code that has been sent to the NN  is: \n' + methodContent);

    // we are waiting for a recommendation
    handle.increasePendingSuggestions()
    // get the code suggestion from the neural network
    s = await neuralNetwork(methodContent, url, inCodeOrComment, confidence)

    // if the prediction was not confident enough
    if (s == undefined) {
        return [undefined, undefined, undefined]
    }

    // this code undertsands how many lines the suggestion is made up of
    // so that we can understand if we need to add any new line to show the suggestion in the editor
    suggestion = s.split("\n");
    // we subtract 1 from the suggestion.length because if suggestion.length is equal to 1, it means that
    // we simply insert the suggestion in the current line, and therefore we don't need to add any line
    lines = suggestion.length - 1;

    return [s, suggestion, lines, methodContent]
}
exports.getSuggestion = getSuggestion;