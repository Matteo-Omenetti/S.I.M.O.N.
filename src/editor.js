// -------------------------------------------------------------------------------------------------
// this file contains the functions to show, delete and accept the recommendation plus some 
// helper functions
// -------------------------------------------------------------------------------------------------
const vscode = require('vscode');
const neuralNetwork = require('./neuralNetwork')
const handle = require('./handleKeyPresses')
// get the theme of the current vs-code window
const workbenchConfig = vscode.workspace.getConfiguration('workbench')
const theme = workbenchConfig.get('colorTheme')
var editor = vscode.window.activeTextEditor;


// this is the decoration that will be used to show the suggestions
const annotationDecoration = vscode.window.createTextEditorDecorationType({
    after: {
        margin: '0 0 0 0em',
        textDecoration: 'none',
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
});

// flag to check if there is a recommendation showing already
// this flag is checked and manipulated by the methods:
// - showSuggestion()
// - removeSuggestion()
// - acceptSuggestion()
var isPresent = false;

// this varaible is manipultaed by 'acceptSuggestion()'
// it is set to true by 'editor/acceptSuggestion()' and 'editor/removeNewLines()' and set to false one second after 
// 'acceptSuggestion()' has terminated. By doing this, 'onDidChangeTextDocument'
// is not going to be called when the suggestion is inserted.
// As a matter of fact, 'onDidChangeTextDocument' is not called only when 
// the user types something but every time the docuemnt is modified.
var isBlocked = false;

// this array of string, will contain the suggestion coming from the NN
// splitted at '\n'
suggestion = [];

// this string holds the suugestion not splitted in an array
s = "";

// this counter represents the number of lines we need to insert
// basically it is equal to suggestion.length - 1
// we subtract 1 from it because if suggestion.length is equal to 1, it means that
// we don't need to add any line, the suggestion will simply show in the same line
// the user is typing in
lines = 0;

// the content of the current method
// this varibale is made public because it is used by extension.js and handleKeyPresses.js
// to send feedback to the server
methodContent = ""


const getIsPresent = () => {
    return isPresent;
}
exports.getIsPresent = getIsPresent;

const setIsPresent = (bool) => {
    isPresent = false;
}
exports.setIsPresent = setIsPresent;

const getIsBlocked = () => {
    return isBlocked;
}
exports.getIsBlocked = getIsBlocked;

const getMethodContent = () => {
    return methodContent
}
exports.getMethodContent = getMethodContent;


/**
 *  insert 'lines' new lines to make room for the suggestion
 * @param {Int} lines the number of lines that must be inserted
 * @returns {Promise}
 */
function insertNewLines(lines) {

    // if lines == 0, there is no need to remove any line
    if (lines == 0) {
        return;
    }

    // create 'lines' new lines
    ins = "";
    for (i = 0; i < lines; i++) {
        ins += "\n"
    }
    editor = vscode.window.activeTextEditor;
    // compute the position in which we need to insert the new lines
    cursor = editor.selection.active;
    startPos = new vscode.Position(cursor.line, cursor.character + 1)
    endPos = new vscode.Position(cursor.line, cursor.character + 2);


    return vscode.window.showTextDocument(editor.document, 1, false).then(e => {
        return e.edit(edit => {
            // insert the lines in the editor
            return edit.replace(new vscode.Range(startPos, endPos), ins)
        })
    }).then(() => {
        // move the caret back to the previous position
        tmpPos = new vscode.Position(cursor.line, cursor.character)
        range = new vscode.Range(tmpPos, tmpPos);
        editor.selection = new vscode.Selection(tmpPos, tmpPos);
        editor.revealRange(range);
    })
}

/**
 * remove the lines that we previosuly inserted using the 'insertNewLine()' method,
 * @param {String} lines the number of lines that must removed
 * @returns {Promise}
 */
function removeNewLines(lines) {
    // if we didn't insert any line, then we don't need to do anything
    if (lines == 0) {
        return;
    }

    editor = vscode.window.activeTextEditor;
    cursor = editor.selection.active;
    // compute the portion of the text we need to remove
    startPos = new vscode.Position(cursor.line, cursor.character + 1)
    endPos = new vscode.Position(cursor.line + lines, 0);

    isBlocked = true;
    return vscode.window.showTextDocument(editor.document, 1, false).then(e => {
        return e.edit(edit => {
            edit.replace(new vscode.Range(startPos, endPos), "")
        })
    }).then(() => {
        isBlocked = false;
    })
}


/**
 * Remove the suggestion from the editor this means to simply remove the decoration using an empty array
 * and to remove the new lines.
 * This method is called when the user doesn't accept the suggestion (for example by keep typing), therefore 
 * the suggestion must disappear as if it had never been there
 * @returns {void}
 */
const removeSuggestion = async () => {
    // if there isn't a recommendation don't even try to delete
    if (isPresent == false) {
        return;
    }

    editor = vscode.window.activeTextEditor;

    // remove the decoration
    editor.setDecorations(annotationDecoration, []);
    // remove the lines that we previously inserted
    await removeNewLines(lines);
    // the recomndation has been deleted, therefore there isn't a recommendation anymore
    isPresent = false;
    // change the behavior of the shortcuts
    vscode.commands.executeCommand('setContext', 'myContext', isPresent);
}

exports.removeSuggestion = removeSuggestion;

/**
 * accept the suggestion, remove the annotation and inject actual code in the editor
 * @param {*} line the line in which the suggestion is shown
 * @param {*} startTyping the position in which the user has just typed.
 * @returns {void}
 */
const acceptSuggestion = async (line, startTyping) => {
    // if there isn't a recommendation, don't even accept
    if (isPresent == false) {
        return;
    }

    // remove the annotation
    await removeSuggestion();

    editor = vscode.window.activeTextEditor;

    isBlocked = true;

    suggToApply = s;
    tmp = line.substr(startTyping, line.length).trimStart()
    if (s.startsWith(tmp)) {
        suggToApply = s.substr(tmp.length, s.length);
    }

    vscode.window.showTextDocument(editor.document, 1, false).then(e => {
        return e.edit(edit => {
            return edit.insert(editor.selection.active, suggToApply)
        })
    }).then(() => {
        isBlocked = false;
        // the recomndation has been accepted, therefore there isn't a recommendation anymore
        isPresent = false;
        // change the behavior of the shortcuts
        vscode.commands.executeCommand('setContext', 'myContext', isPresent);
    });
}

exports.acceptSuggestion = acceptSuggestion;

/**
 * create a decoration
 * @param {String} text the text of the recommendation
 * @param {vscode.Position} startPos the starting position of the recommendation
 * @param {String} suggestion the all recommedation
 * @returns {JSON} the decoration that will be applied
 */
function decorationFactory(text, startPos, suggestion, suggestionColor) {
    let scrollable = true;
    let decoration = {
        renderOptions: {
            after: {
                color: suggestionColor,
                contentText: text,
                fontWeight: 'normal',
                fontStyle: 'normal',
                textDecoration: `none;${scrollable ? '' : ' position: absolute;'}`,
            },
        }
    };
    // if there is a light theme applied, change the color of the suggestion
    if (theme.indexOf("Light") >= 0) {
        decoration.renderOptions.after.color = "#BEBEBE"
    }
    endPos = new vscode.Position(startPos.line, startPos.character + suggestion.length);
    decoration.range = new vscode.Range(startPos, endPos);
    return decoration;
}

function applyDecorations(userHasWrote) {
    // only single line annotations can be inserted, therefore for each line of the sugg, we need to perform an insert action
    decorations = []

    editor = vscode.window.activeTextEditor;
    // get the position of the cursor
    cursor = editor.selection.active;
    // for every line of suggestion create an annotation
    for (i = 0; i < suggestion.length; i++) {
        pos = undefined;
        if (i == 0) {
            pos = new vscode.Position(cursor.line, cursor.character - 1);
        } else {
            pos = new vscode.Position(cursor.line + i, 0);
        }

        decoration = decorationFactory(suggestion[i], pos, suggestion, suggestionColor);
        decorations.push(decoration);
    }
    if (userHasWrote) {
        // change the first decoration
        decorations[0].renderOptions.after.contentText = tmp;
    }
    // now that we have all the annotations, we can apply them
    editor.setDecorations(annotationDecoration, decorations);
}

/**
 * inject and display the suggestion to the user with the proper decoration
 * @param {String} url the url in which the NN is hosted
 * @param {Boolean} inCodeOrComment whether the cursor is in code or comment and cìshich type of comment (single line, multi line, javadoc)
 * @param {String} suggestionColor the color for the suggestion
 * @param {Integer} confidence the minimum confidence that a suggestion must have in order to be shown
 * @returns {void}
 */
async function showSuggestion(url, suggestionColor, inCodeOrComment, confidence, singleLineComment) {
    // if there is already a recommendation return, do not display another one
    if (isPresent == true) {
        return;
    }
    // get the suggestion from the NN
    [s, suggestion, lines, methodContent] = await neuralNetwork.getSuggestion(url, inCodeOrComment, confidence, singleLineComment);
    if (s == undefined) {
        handle.decreasePendingSuggestions();
        if (handle.getPendingSuggestions() == 1 || handle.getPendingSuggestions() == 0) {
            console.log("This was the last rec, setting noLongerNeeded = false")
            handle.setRecNoLongerNeeded(false)
        }
        return;
    }
    // if the recommendation is no longer needed
    if (handle.getRecNoLongerNeeded() == true) {
        console.log("The rec is no longer needed, decrese pending")
        // vscode.window.showInformationMessage('Recommendation no longer needed');
        // we have just blocked this pending suggestion, therefore decrease the number of pending suggestions
        handle.decreasePendingSuggestions();
        if (handle.getPendingSuggestions() == 1 || handle.getPendingSuggestions() == 0) {
            console.log("This was the last rec, setting noLongerNeeded = false")
            handle.setRecNoLongerNeeded(false)
        }
        return
    }



    // if the user has typed something in the mean while we need to skrink the recommendation
    // accordingly if the what the user wrote matches the suggestion
    if (handle.getUserInput() != "" && s.startsWith(handle.getUserInput())) {
        console.log("There is a match between what the user wrote and the rec")
        tmp = s.substring(handle.getUserInput().length)
        // the lines that we insert must not trigger 'onDidChangeTextDocument' therefore we block the function
        isBlocked = true;
        // insert new lines if needed
        await insertNewLines(lines);
        isBlocked = false;
        // apply the decorations to show the suggestion, but shrink the first line of suggestion,
        // because of the match
        applyDecorations(true, tmp)
        // set this position, so that we know what's the next char the user is supposed to write in the recommendation
        handle.setPositionInSuggestion(handle.getUserInput().length - 1)
    } else if (handle.getUserInput() != "") {
        console.log("The user has typed something else in the meanwhile that does not match the rec")
        return
    } else {
        // the lines that we insert must not trigger 'onDidChangeTextDocument' therefore we block the function
        isBlocked = true;
        // insert new lines if needed
        await insertNewLines(lines);
        isBlocked = false;
        // apply the decorations to show the suggestion
        applyDecorations(false, "")
    }

    // we are showing a suggestion
    isPresent = true;
    // the suggestion has been shown, therefore we do not have a pending suggestion
    handle.decreasePendingSuggestions();
    console.log("the suggestion has been shown")
    // change the behavior of the shortcuts
    vscode.commands.executeCommand('setContext', 'myContext', isPresent);
}

/**
 * this function reapplys the same suggestion again without the first char.
 * If the user types the suggestion, then the first char of the suggestion must dissappear because it has just been typed.
 * Example:
 * this is the suggestion: "comment suggetion stubbed"
 * if the user types: 'c'
 * then the suggestion must become: "omment suggestion stubbed"
 * if the user then types: 'o'
 * then the suggestion must become: "mment suggestion stubbed"
 * @param {vscode.Position} startPos the position in which the suggestion starts
 * @returns {void}
 */
const shrinkSuggestion = (startPos) => {
    tmp = decorations[0].renderOptions.after.contentText
    decorations[0].renderOptions.after.contentText = tmp.substring(1, tmp.length);
    endPos = new vscode.Position(startPos.line, startPos.character + tmp.length);
    decorations[0].range = new vscode.Range(startPos, endPos);
    editor.setDecorations(annotationDecoration, decorations);
}

exports.shrinkSuggestion = shrinkSuggestion;

/**
 * if we are deleting and there isn't a suggestion suggestion showing, then try to re-apply the suggestion if
 * the suggestion (partially) matches what's written in the current line.
 * Example:
 * This is the previous suggestion: this.max = 30;
 * The current line contains: this.income = 40;
 * If the user deletes the line like this: this.
 * then the suggestion should appear again, because the line prtially matches the suggestion.
 * @param {vscode.Position} startPos the position in which the suggestion starts
 * @param {String} line the content of the current line
 * @returns {boolean} true if metching has been found and a suggestion in shown, false otherwise
 */
const reApplySuggestion = (startPos, line) => {
    tmp = suggestion[0];
    if (tmp.startsWith(line)) {
        tmp = tmp.substr(line.length, tmp.length);
        // change the first decoration
        decorations[0].renderOptions.after.contentText = tmp;
        // recompute its endingPosition
        endPos = new vscode.Position(startPos.line, startPos.character + suggestion.length);
        decorations[0].range = new vscode.Range(startPos, endPos);
        // reapply the decorations
        editor.setDecorations(annotationDecoration, decorations);
        // there is now a recommnedation showing
        isPresent = true;
        // change the behavior of the shortcuts
        vscode.commands.executeCommand('setContext', 'myContext', isPresent);
        // we performed a match, return true
        return true;
    }
    // a matched was not found, return false
    return false;

}
exports.reApplySuggestion = reApplySuggestion;

/**
 * if there is a suggestion first remove it and then create another one
 * @param {String} url the url that hosts the NN 
 * @param {String} suggestionColor the color of the suggestion 
 * @param {Boolean} inCodeOrComment whether the cursor is in code or comment and cìshich type of comment (single line, multi line, javadoc)
 * @param {Integer} confidence the minimum confidence that a suggestion must have in order to be shown
 */
const removeAndShow = async (url, suggestionColor, inCodeOrComment, confidence, singleLineComment) => {
    await removeSuggestion();
    await showSuggestion(url, suggestionColor, inCodeOrComment, confidence, singleLineComment);
}

exports.removeAndShow = removeAndShow;