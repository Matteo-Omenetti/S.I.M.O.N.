// -------------------------------------------------------------------------------------------------------------
// this file contains the function that, based on some heurstics, understands when to activate the autocompletion
// -------------------------------------------------------------------------------------------------------------
const vscode = require('vscode');
const parser = require('./parser')
const myEditor = require('./editor')
const feedback = require('./feedback')

// this counter tells you which charachter the user is supposed to write in order not to remove the recommendation
// if this is the recommendation: "this.ciao = 7;",
// positionInSuggestion = 0
// and the user types 'k'
// then the recommendation is going to disappear, because the first char of the recommnedation is 't'
// and it is different from 'k'
var positionInSuggestion = -1;
const setPositionInSuggestion = (a) => {
    positionInSuggestion = a;
}
exports.setPositionInSuggestion = setPositionInSuggestion;

// the character position in which the user starts typing
// this counter is used by the method 'reApplySuggestion' to understand from where
// to try see if there is a match between the line of code and the suggestion
var startTyping = 0;

const getStartTyping = () => {
    return startTyping;
}
exports.getStartTyping = getStartTyping;

// this bool tells you if there was a suggestion showing
// it is used to understand wheter a suggestion has been rejected or not
wasRec = false;
const setWasRec = (b) => {
    wasRec = b
};
exports.setWasRec = setWasRec;

// the number of pending suggestions
var pendingSuggestions = 0;
const getPendingSuggestions = () => {
    return pendingSuggestions;
}
exports.getPendingSuggestions = getPendingSuggestions;

const increasePendingSuggestions = () => {
    pendingSuggestions += 1;
}
exports.increasePendingSuggestions = increasePendingSuggestions;
const decreasePendingSuggestions = () => {
    if (pendingSuggestions >= 1) {
        pendingSuggestions -= 1
    }
}
exports.decreasePendingSuggestions = decreasePendingSuggestions;

// this variable tells whether the recommendation is no longer needed
// this can happen when we are waiting for the recommendation to come from the server
// but the user types something else, therefore the rec is no longer relevant
var recNoLongerNeeded = false;
const getRecNoLongerNeeded = () => {
    return recNoLongerNeeded;
}
exports.getRecNoLongerNeeded = getRecNoLongerNeeded;

const setRecNoLongerNeeded = (b) => {
    recNoLongerNeeded = b;
}
exports.setRecNoLongerNeeded = setRecNoLongerNeeded;

// the chars the user types while a recommendations is pending
var userInput = "";
const getUserInput = () => {
    return userInput;
}
exports.getUserInput = getUserInput;

const setUserInput = (a) => {
    userInput = a;
}
exports.setUserInput = setUserInput;


// 
/**
 * based on some heurstics understand when to activate the autocompletion
 * @param {String} url the url in which the NN is hosted
 * @param {Char[]} triggerChars the array of characters (defined in the settings) for which the NN will be called
 * @param {String} suggestionColor the color for the suggestion
 * @param {Boolean} inCodeOrComment whether the cursor is in code of comment and which type of commene (single line, multi line, javadoc)
 * @param {Integer} confidence the minimum confidence that a suggestion must have in order to be shown
 * @param {String} urlFeedback the server that hosts the service that records the feedback
 * @returns {void} 
 */
const handleKeyPresses = async (url, triggerChars, suggestionColor, inCodeOrComment, confidence, urlFeedback, singleLineComment, name) => {
    editor = vscode.window.activeTextEditor;
    // get the current position of the caret
    caretPosition = editor.selection.active;

    documentLine = editor.document.lineAt(caretPosition)._text
    console.log(caretPosition.line, caretPosition.character);

    // fetch the char at the current postion of the caret, this is the char that the user has just wrote
    charAtCaret = documentLine.charAt(caretPosition.character);
    console.log("The char at the caret is " + charAtCaret)
    // fetch the char at the next postion of the caret
    charAtAfterCaret = documentLine.charAt(caretPosition.character + 1);
    // fetch the char at the previous position of the caret
    charAtBeforeCaret = documentLine.charAt(caretPosition.character - 1);
    console.log("The char before the caret is " + charAtBeforeCaret)
    // the length of the current line
    lengthOfCurrentLine = editor.document.lineAt(caretPosition.line)._text.trim().length;
    console.log("The length of the current line is: " + lengthOfCurrentLine)
    // the length of the next line
    lengthOfNextLine = editor.document.lineAt(caretPosition.line + 1)._text.trim().length;
    console.log("The length of the next line is: " + lengthOfNextLine)

    // if the user presses space and there is another space before it or /, then Return
    if (charAtCaret == " " && (charAtBeforeCaret == " " || charAtBeforeCaret == "/")) {
        console.log("You have pressed space and the char before is either a space or /")
        return
    }

    // if the user presses space and there is *, then Return
    if (charAtCaret == " " && charAtBeforeCaret == "*" && inCodeOrComment == 2) {
        console.log("You have pressed space but in the multi line comment there is not a token yet")
        return
    }

    // if the user is deleting and we are waiting for a recommendation, then the rec is no longer needed 
    if (pendingSuggestions > 0 && isNaN(charAtCaret.charCodeAt()) && isNaN(charAtBeforeCaret.charCodeAt())) {
        console.log("The user was deleting while there is at least a pending suggestion, the rec is no longer needed")
        recNoLongerNeeded = true;
    }
    // if the user is deleting and there was a rec we need to see if we can reapply it (in case there is a match 
    // between the line of code of the user and the recommendation)
    if (wasRec && isNaN(charAtCaret.charCodeAt()) && isNaN(charAtBeforeCaret.charCodeAt())) {
        console.log("We are trying to reapply the suggestion if there is a match")
        
        // remove the previous suggestion
        await myEditor.removeSuggestion();
        // we are intereseted only in the portion of the line that user has just wrote
        if (startTyping > documentLine.length) {
            return
        }
        tmpLine = documentLine.substr(startTyping, documentLine.length)
        //tmpLine = tmpLine.trimStart();
        console.log(tmpLine)
        // if we are in a single line comment then remove //
        if (parser.getTypeOfLine() == 1) {
            tmpLine = tmpLine.substr(2, tmpLine.length).trim()
        }
        // reApply the suggestion if there is a match
        hasBeenReApplyed = myEditor.reApplySuggestion(caretPosition, tmpLine);
        if (hasBeenReApplyed) {
            console.log("A match has been detected")
            positionInSuggestion = documentLine.length - startTyping - 1;
        }
        return
    }

    // if the user types new line we want to show a racommendation
    if (lengthOfNextLine == 0 && isNaN(charAtCaret.charCodeAt()) && !isNaN(charAtBeforeCaret.charCodeAt()) && lengthOfCurrentLine > 0) {

        if (pendingSuggestions > 0) {
            console.log("The user was pressing return while there is at least a pending suggestion, the rec is no longer needed")
            recNoLongerNeeded = true;
        }

        // you are about to show another suggestion, if there was a suggestion  and it wasn't
        // completly typed, then it means that you rejected it
        if (wasRec == true && positionInSuggestion < s.length - 1) {
            // vscode.window.showInformationMessage('A suggestion has been rejected!');
            feedback.sendFeedback(s, myEditor.getMethodContent(), false, urlFeedback, name)
        }
        wasRec = false;
        console.log("The user has typed a new line")
        await myEditor.removeAndShow(url, suggestionColor, inCodeOrComment, confidence, singleLineComment);
        // a new suggestion has just appeared, set positionInSuggestion to the current defualt value
        positionInSuggestion = -1;
        // recompute the position in which the user starts typing
        caretPosition = editor.selection.active;
        startTyping = caretPosition.character
        console.log("StartTyping is " + startTyping)

        return;
    }

    // you don't want to inject a recomendation if in the line there is already something
    // otherwise the recommendation is going to mess with the text already present in the file
    // only do it if we are in a multi line comment
    if (charAtAfterCaret != "" && parser.getTypeOfLine() != 2) {
        myEditor.removeSuggestion()
        positionInSuggestion = -1;
        console.log("In the line there is already something... RETURNING")
        return;
    }

    // if the user types something, with a reccommendation present then go to the next char of the recommendation
    if (myEditor.getIsPresent() == true) {
        positionInSuggestion++;
    }

    // if the user types something different than the recommendation then remove it
    if (positionInSuggestion >= 0 && myEditor.getIsPresent() == true && charAtCaret != s.charAt(positionInSuggestion)) {
        console.log("The user has typed something different than the recommendation. Removing the rec")
        myEditor.removeSuggestion();
        wasRec = true;
        //positionInSuggestion = -1;
        return;
        // if the user types something equal to the recommendation, then shrink the recommendation
    } else if (myEditor.getIsPresent() == true && charAtCaret == s.charAt(positionInSuggestion)) {
        wasRec = true;
        console.log("The user has typed something equal to the recommendation. Shrinking the rec")
        myEditor.shrinkSuggestion(caretPosition);
        // if the user types all the suggestion manually than the suggestionhas been accepted
        if (positionInSuggestion == s.length - 1) {
            wasRec = false;
            myEditor.setIsPresent(false);
            // vscode.window.showInformationMessage('A suggestion has been accepted manually!');
            feedback.sendFeedback(s, myEditor.getMethodContent(), true, urlFeedback, name)
        }
        return;
    }

    // if there is a pending suggestion, save the user input so that we can see if there is a match 
    // between what the user (potentially) writes while the request is pending
    if (pendingSuggestions > 0) {
        userInput += charAtCaret
    }

    // if the user types a trigger char then show a recommenedation
    if (triggerChars.includes(charAtCaret) && lengthOfCurrentLine) {
        // if the are pending suggestions, we set recNoLongerNeeded = true in order to invalidate all the other prrevious suggestions
        // that are still pending 
        if (pendingSuggestions > 0) {
            console.log("The user wants a new rec while there is at least pending suggestion, the old rec is no longer needed")
            recNoLongerNeeded = true;
        }

        // you are about to show another suggestion, if there was a suggestion and it wasn't
        // completly typed, then it means that you rejected it
        if (wasRec == true && positionInSuggestion < s.length - 1) {
            // vscode.window.showInformationMessage('A suggestion has been rejected!');
            feedback.sendFeedback(s, myEditor.getMethodContent(), false, urlFeedback, name)
        }
        // we are about to show another recommendation, set the user inpu to  empty string to catch what the user will write from now on
        userInput = "";
        console.log("we are going to show a suggestion")
        myEditor.removeAndShow(url, suggestionColor, inCodeOrComment, confidence, singleLineComment);
        positionInSuggestion = -1;
        startTyping = caretPosition.character + 1;
        console.log("StartTyping is " + startTyping)
        wasRec = false;
    }
}
exports.handleKeyPresses = handleKeyPresses;