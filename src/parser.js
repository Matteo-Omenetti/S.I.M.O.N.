const vscode = require('vscode');

// this varibale holds the type of line in which the cursor currently is:
// - 0 = code
// - 1 = single line comment
// - 2 = multi line comment
// - 3 = java doc
typeOfLine = 0;

// return the type of the current line
const getTypeOfLine = () => {
    return typeOfLine;
}
exports.getTypeOfLine = getTypeOfLine;

/**
 * 
 * @param {vscode.Position} caretPosition the position of the caret
 * @param {String[]} documentLines the content of the document splitted at "\n"
 * @returns {boolean} true if the line of the caret position is a single line comment //, false othewise
 */
const isSingleLine = (caretPosition, documentLines) => {
    l = documentLines[caretPosition.line];

    if (l.indexOf("//") >= 0) {
        return true;
    }

    return false;
}
exports.isSingleLine = isSingleLine;

/**
 * 
 * @param {vscode.Position} caretPosition the position of the caret
 * @param {String[]} documentLines the content of the document splitted at "\n"
 * @returns {boolean} true if the line of the caret position is a multi line comment /*, false othewise
 */
const isMultiLine = (caretPosition, documentLines) => {
    for (i = caretPosition.line; i >= 0; i--) {
        posStartComment = documentLines[i].indexOf("/*");
        posEndComment = documentLines[i].indexOf("*/")

        // if there is a javaDoc comment return false
        if (documentLines[i].indexOf("/**") >= 0 && posEndComment < 0) {
            return false;
        }

        // if there is */ but there isn't /* the we are not in a comment
        if (posEndComment >= 0 && posStartComment < 0) {
            return false;
        }

        // if there is /* but there isn't */ the we are in a comment
        if (posStartComment >= 0 && posEndComment < 0) {
            return true;
        }

        // if thre is both /* and */ then we have to check the position of the caret
        // in order to understand whether we are in a comment or not
        if (posStartComment >= 0 && posEndComment >= 0 && i == caretPosition.line - 1) {
            if (posStartComment < caretPosition.character < posEndComment) {
                return true;
            }
        }

    }

    return false;
}

exports.isMultiLine = isMultiLine;

/**
 * 
 * @param {vscode.Position} caretPosition the position of the caret
 * @param {String[]} documentLines the content of the document splitted at "\n"
 * @returns {boolean} true if the line of the caret position is a javadoc comment /**, false othewise
 */
const isJavaDoc = (caretPosition, documentLines) => {
    l = documentLines[caretPosition.line]
    for (i = caretPosition.line; i >= 0; i--) {

        if (documentLines[i].indexOf("*/") >= 0) {
            return false;
        }
        if (documentLines[i].indexOf("/**") >= 0) {
            return true;
        }
    }

    return false;
}

exports.isJavaDoc = isJavaDoc


/**
 * compute the type of the current line: code, single-line comment, multi-line comment or javadoc
 * @returns {Int} 0: the caret is in a code line
 *                1: the caret is in a single line comment (//) line
 *                2: the caret is in a multi line (/*) comment
 *                3: the caret is in a javadoc comment (/**)
 */
const commentOrCode = () => {

    editor = vscode.window.activeTextEditor;
    // get the postion of the caret
    caretPosition = editor.selection.active;
    // get the content of the document
    documentContent = editor.document.getText();
    // split the document at the end of each line 
    documentLines = documentContent.split("\n");


    if (isSingleLine(caretPosition, documentLines)) {
        console.log("we are in a single line comment")
        typeOfLine = 1;
    } else if (isMultiLine(caretPosition, documentLines)) {
        console.log("we are in a multi line comment")
        typeOfLine = 2;
    } else if (isJavaDoc(caretPosition, documentLines)) {
        console.log("we are in a javadoc comment")
        typeOfLine = 3;
    } else {
        console.log("we are in code")
        typeOfLine = 0;
    }

    return typeOfLine;
}

exports.commentOrCode = commentOrCode;