import {
    createConnection,
    ProposedFeatures,
    TextDocuments,
    TextDocumentSyncKind,
    InitializeParams,
    InitializeResult,
    Hover,
    MarkupKind,
    Definition,
    Location,
    DocumentSymbol,
    SymbolKind,
    TextEdit,
    Range,
    Position,
    Diagnostic,
    DiagnosticSeverity,
    CompletionItem,
    CompletionItemKind,
    InsertTextFormat,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Regular expressions for parsing Dragonstone syntax.
const METHOD_DEF_REGEX = /^\s*(def|define)\s+(?:(self|[a-zA-Z_]\w*)\.)?([a-zA-Z_]\w*[?!=]?)\s*(?:\(([^)]*)\))?/;
const CLASS_DEF_REGEX = /^\s*(?:abstract\s+|abs\s+)?(class|cls|struct|record|anno|annotation|enum)\s+([A-Z]\w*)/;
const MODULE_DEF_REGEX = /^\s*(module|mod)\s+([A-Z]\w*)/;
const CONSTANT_DEF_REGEX = /^\s*([A-Z][A-Z_0-9]*)\s*=/;
const VARIABLE_DEF_REGEX = /^\s*(con|let|var|fix)\s+([a-z_]\w*)\s*(?::\s*([A-Z]\w*|str|int|bool|char|float|nil))?/;
const FUNCTION_REGEX = /^\s*(fun|function)\s+([a-z_]\w*[?!=]?)\s*(?:\(([^)]*)\))?/;

interface SymbolInfo {
    name: string;
    kind: SymbolKind;
    line: number;
    range: Range;
    detail?: string;
}

// Parse document and extract symbols.
function parseDocument(document: TextDocument): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i;

        // Match class/struct/record/enum definitions.
        let match = CLASS_DEF_REGEX.exec(line);
        if (match) {
            const [, kind, name] = match;
            symbols.push({
                name,
                kind: kind === 'enum' ? SymbolKind.Enum : SymbolKind.Class,
                line: lineNumber,
                range: Range.create(lineNumber, 0, lineNumber, line.length),
                detail: `${kind} ${name}`,
            });
            continue;
        }

        // Match module definitions.
        match = MODULE_DEF_REGEX.exec(line);
        if (match) {
            const [, , name] = match;
            symbols.push({
                name,
                kind: SymbolKind.Module,
                line: lineNumber,
                range: Range.create(lineNumber, 0, lineNumber, line.length),
                detail: `module ${name}`,
            });
            continue;
        }

        // Match method definitions.
        match = METHOD_DEF_REGEX.exec(line);
        if (match) {
            const [, , target, name, params] = match;
            const methodType = target ? 'singleton method' : 'method';
            const fullName = target ? `${target}.${name}` : name;
            symbols.push({
                name: fullName,
                kind: SymbolKind.Method,
                line: lineNumber,
                range: Range.create(lineNumber, 0, lineNumber, line.length),
                detail: params ? `${methodType} ${fullName}(${params})` : `${methodType} ${fullName}`,
            });
            continue;
        }

        // Match function definitions.
        match = FUNCTION_REGEX.exec(line);
        if (match) {
            const [, , name, params] = match;
            symbols.push({
                name,
                kind: SymbolKind.Function,
                line: lineNumber,
                range: Range.create(lineNumber, 0, lineNumber, line.length),
                detail: params ? `fun ${name}(${params})` : `fun ${name}`,
            });
            continue;
        }

        // Match constant definitions.
        match = CONSTANT_DEF_REGEX.exec(line);
        if (match) {
            const [, name] = match;
            symbols.push({
                name,
                kind: SymbolKind.Constant,
                line: lineNumber,
                range: Range.create(lineNumber, 0, lineNumber, line.length),
                detail: `constant ${name}`,
            });
            continue;
        }

        // Match variable definitions.
        match = VARIABLE_DEF_REGEX.exec(line);
        if (match) {
            const [, keyword, name, type] = match;
            const varType = type ? `: ${type}` : '';
            symbols.push({
                name,
                kind: SymbolKind.Variable,
                line: lineNumber,
                range: Range.create(lineNumber, 0, lineNumber, line.length),
                detail: `${keyword} ${name}${varType}`,
            });
            continue;
        }
    }

    return symbols;
}

// Format document.
function formatDocument(document: TextDocument): TextEdit[] {
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const edits: TextEdit[] = [];
    let indentLevel = 0;

    // 4 spaces per indent level.
    const INDENT = '    ';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        // Decrease indent for 'end', 'elsif', 'elseif',
        // 'else', 'when', 'rescue', and 'ensure'.
        if (/^\s*(end|elsif|elseif|else|when|rescue|ensure)\b/.test(line)) {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        // Calculate proper indentation.
        const expectedIndent = INDENT.repeat(indentLevel);
        const currentIndent = line.match(/^\s*/)?.[0] || '';

        // Create edit if indentation doesn't match.
        if (currentIndent !== expectedIndent) {
            edits.push(TextEdit.replace(
                Range.create(i, 0, i, currentIndent.length),
                expectedIndent
            ));
        }

        // Increase indent for blocks.
        if (/^\s*(class|cls|struct|module|mod|def|define|fun|function|if|unless|case|select|begin|while|when|rescue|ensure|enum|record|annotation|anno)\b/.test(line) &&
            !/\bend\s*$/.test(line)) {
            indentLevel++;
        }
        // Handle do blocks.
        else if (/\bdo\b/.test(line) && !/\bend\s*$/.test(line)) {
            indentLevel++;
        }
        // Decrease after 'end'.
        else if (/^\s*end\b/.test(line)) {
            // Already decreased above
        }
        // elsif/else increases after decreasing.
        else if (/^\s*(elsif|elseif|else)\b/.test(line)) {
            indentLevel++;
        }
    }

    return edits;
}

// Find symbol at position.
function findSymbolAtPosition(document: TextDocument, position: Position): SymbolInfo | undefined {
    const symbols = parseDocument(document);
    const line = document.getText(Range.create(position.line, 0, position.line + 1, 0));
    const wordRange = getWordRangeAtPosition(line, position.character);

    if (!wordRange) {
        return undefined;
    }

    const word = line.substring(wordRange.start, wordRange.end);

    // Find matching symbol.
    return symbols.find(symbol =>
        symbol.name === word ||
        symbol.name.endsWith(`.${word}`) ||
        symbol.name === `${word}?` ||
        symbol.name === `${word}!` ||
        symbol.name === `${word}=`
    );
}

// Get word range at position.
function getWordRangeAtPosition(line: string, character: number): { start: number; end: number } | undefined {
    const wordPattern = /[a-zA-Z_]\w*[?!=]?/g;
    let match: RegExpExecArray | null;

    while ((match = wordPattern.exec(line)) !== null) {
        if (match.index <= character && character <= match.index + match[0].length) {
            return {
                start: match.index,
                end: match.index + match[0].length,
            };
        }
    }

    return undefined;
}

// Completion items.
const KEYWORDS: CompletionItem[] = [
    { label: 'class', kind: CompletionItemKind.Keyword, detail: 'Define a class' },
    { label: 'cls', kind: CompletionItemKind.Keyword, detail: 'Define a class (short)' },
    { label: 'struct', kind: CompletionItemKind.Keyword, detail: 'Define a struct' },
    { label: 'module', kind: CompletionItemKind.Keyword, detail: 'Define a module' },
    { label: 'mod', kind: CompletionItemKind.Keyword, detail: 'Define a module (short)' },
    { label: 'enum', kind: CompletionItemKind.Keyword, detail: 'Define an enum' },
    { label: 'record', kind: CompletionItemKind.Keyword, detail: 'Define a record' },
    { label: 'annotation', kind: CompletionItemKind.Keyword, detail: 'Define an annotation' },
    { label: 'anno', kind: CompletionItemKind.Keyword, detail: 'Define an annotation (short)' },
    { label: 'def', kind: CompletionItemKind.Keyword, detail: 'Define a method', insertText: 'def ${1:method_name}($2)\n    $0\nend', insertTextFormat: InsertTextFormat.Snippet },
    { label: 'define', kind: CompletionItemKind.Keyword, detail: 'Define a method', insertText: 'define ${1:method_name}($2)\n    $0\nend', insertTextFormat: InsertTextFormat.Snippet },
    { label: 'fun', kind: CompletionItemKind.Keyword, detail: 'Define a function', insertText: 'fun ${1:function_name}($2) -> ${3:return_type}\n    $0\nend', insertTextFormat: InsertTextFormat.Snippet },
    { label: 'function', kind: CompletionItemKind.Keyword, detail: 'Define a function', insertText: 'function ${1:function_name}($2) -> ${3:return_type}\n    $0\nend', insertTextFormat: InsertTextFormat.Snippet },
    { label: 'if', kind: CompletionItemKind.Keyword, detail: 'Conditional statement', insertText: 'if ${1:condition}\n    $0\nend', insertTextFormat: InsertTextFormat.Snippet },
    { label: 'unless', kind: CompletionItemKind.Keyword, detail: 'Negative conditional', insertText: 'unless ${1:condition}\n    $0\nend', insertTextFormat: InsertTextFormat.Snippet },
    { label: 'elsif', kind: CompletionItemKind.Keyword, detail: 'Else if clause' },
    { label: 'elseif', kind: CompletionItemKind.Keyword, detail: 'Else if clause' },
    { label: 'else', kind: CompletionItemKind.Keyword, detail: 'Else clause' },
    { label: 'case', kind: CompletionItemKind.Keyword, detail: 'Case statement', insertText: 'case ${1:value}\nwhen ${2:pattern}\n    $0\nend', insertTextFormat: InsertTextFormat.Snippet },
    { label: 'select', kind: CompletionItemKind.Keyword, detail: 'Select statement', insertText: 'select ${1:value}\nwhen ${2:pattern}\n    $0\nend', insertTextFormat: InsertTextFormat.Snippet },
    { label: 'when', kind: CompletionItemKind.Keyword, detail: 'When clause' },
    { label: 'while', kind: CompletionItemKind.Keyword, detail: 'While loop', insertText: 'while ${1:condition}\n    $0\nend', insertTextFormat: InsertTextFormat.Snippet },
    { label: 'begin', kind: CompletionItemKind.Keyword, detail: 'Begin block', insertText: 'begin\n    $0\nend', insertTextFormat: InsertTextFormat.Snippet },
    { label: 'rescue', kind: CompletionItemKind.Keyword, detail: 'Rescue clause' },
    { label: 'ensure', kind: CompletionItemKind.Keyword, detail: 'Ensure clause' },
    { label: 'end', kind: CompletionItemKind.Keyword, detail: 'End block' },
    { label: 'return', kind: CompletionItemKind.Keyword, detail: 'Return statement' },
    { label: 'yield', kind: CompletionItemKind.Keyword, detail: 'Yield to block' },
    { label: 'break', kind: CompletionItemKind.Keyword, detail: 'Break loop' },
    { label: 'next', kind: CompletionItemKind.Keyword, detail: 'Next iteration' },
    { label: 'con', kind: CompletionItemKind.Keyword, detail: 'Define a constant variable' },
    { label: 'let', kind: CompletionItemKind.Keyword, detail: 'Define an immutable variable' },
    { label: 'var', kind: CompletionItemKind.Keyword, detail: 'Define a mutable variable' },
    { label: 'fix', kind: CompletionItemKind.Keyword, detail: 'Define a fixed variable' },
    { label: 'use', kind: CompletionItemKind.Keyword, detail: 'Import/use module' },
    { label: 'from', kind: CompletionItemKind.Keyword, detail: 'Import from module' },
    { label: 'as', kind: CompletionItemKind.Keyword, detail: 'Alias import' },
    { label: 'abstract', kind: CompletionItemKind.Keyword, detail: 'Abstract modifier' },
    { label: 'abs', kind: CompletionItemKind.Keyword, detail: 'Abstract modifier (short)' },
    { label: 'public', kind: CompletionItemKind.Keyword, detail: 'Public visibility' },
    { label: 'private', kind: CompletionItemKind.Keyword, detail: 'Private visibility' },
    { label: 'protected', kind: CompletionItemKind.Keyword, detail: 'Protected visibility' },
    { label: 'with', kind: CompletionItemKind.Keyword, detail: 'With statement', insertText: 'with ${1:expression}\n    $0\nend', insertTextFormat: InsertTextFormat.Snippet },
];

const TYPES: CompletionItem[] = [
    { label: 'str', kind: CompletionItemKind.Class, detail: 'String type' },
    { label: 'int', kind: CompletionItemKind.Class, detail: 'Integer type' },
    { label: 'int8', kind: CompletionItemKind.Class, detail: '8-bit integer' },
    { label: 'int16', kind: CompletionItemKind.Class, detail: '16-bit integer' },
    { label: 'int32', kind: CompletionItemKind.Class, detail: '32-bit integer' },
    { label: 'int64', kind: CompletionItemKind.Class, detail: '64-bit integer' },
    { label: 'int128', kind: CompletionItemKind.Class, detail: '128-bit integer' },
    { label: 'float', kind: CompletionItemKind.Class, detail: 'Float type' },
    { label: 'float8', kind: CompletionItemKind.Class, detail: '8-bit float' },
    { label: 'float16', kind: CompletionItemKind.Class, detail: '16-bit float' },
    { label: 'float32', kind: CompletionItemKind.Class, detail: '32-bit float' },
    { label: 'float64', kind: CompletionItemKind.Class, detail: '64-bit float' },
    { label: 'float128', kind: CompletionItemKind.Class, detail: '128-bit float' },
    { label: 'bool', kind: CompletionItemKind.Class, detail: 'Boolean type' },
    { label: 'char', kind: CompletionItemKind.Class, detail: 'Character type' },
    { label: 'nil', kind: CompletionItemKind.Class, detail: 'Nil type' },
    { label: 'sym', kind: CompletionItemKind.Class, detail: 'Symbol type' },
    { label: 'arr', kind: CompletionItemKind.Class, detail: 'Array type' },
    { label: 'array', kind: CompletionItemKind.Class, detail: 'Array type' },
    { label: 'map', kind: CompletionItemKind.Class, detail: 'Map/Hash type' },
    { label: 'range', kind: CompletionItemKind.Class, detail: 'Range type' },
    { label: 'tuple', kind: CompletionItemKind.Class, detail: 'Tuple type' },
    { label: 'para', kind: CompletionItemKind.Class, detail: 'Parameter type' },
];

const BUILTIN_FUNCTIONS: CompletionItem[] = [
    { label: 'echo', kind: CompletionItemKind.Function, detail: 'Print to stdout' },
    { label: 'eecho', kind: CompletionItemKind.Function, detail: 'Print to stderr' },
    { label: 'e!', kind: CompletionItemKind.Function, detail: 'Print to stdout (short)' },
    { label: 'ee!', kind: CompletionItemKind.Function, detail: 'Print to stderr (short)' },
    { label: 'abort', kind: CompletionItemKind.Function, detail: 'Abort execution' },
    { label: 'exit', kind: CompletionItemKind.Function, detail: 'Exit program' },
    { label: 'gets', kind: CompletionItemKind.Function, detail: 'Get input' },
    { label: 'read_line', kind: CompletionItemKind.Function, detail: 'Read line from input' },
    { label: 'sleep', kind: CompletionItemKind.Function, detail: 'Sleep for duration' },
    { label: 'spawn', kind: CompletionItemKind.Function, detail: 'Spawn fiber/thread' },
    { label: 'thread', kind: CompletionItemKind.Function, detail: 'Create thread' },
    { label: 'channel', kind: CompletionItemKind.Function, detail: 'Create channel' },
    { label: 'fiber', kind: CompletionItemKind.Function, detail: 'Create fiber' },
    { label: 'raise', kind: CompletionItemKind.Function, detail: 'Raise exception' },
    { label: 'rand', kind: CompletionItemKind.Function, detail: 'Random number' },
    { label: 'sprintf', kind: CompletionItemKind.Function, detail: 'Format string' },
    { label: 'system', kind: CompletionItemKind.Function, detail: 'Execute system command' },
    { label: 'typeof', kind: CompletionItemKind.Function, detail: 'Get type of value' },
];

const CONSTANTS: CompletionItem[] = [
    { label: 'true', kind: CompletionItemKind.Constant, detail: 'Boolean true' },
    { label: 'false', kind: CompletionItemKind.Constant, detail: 'Boolean false' },
    { label: 'nil', kind: CompletionItemKind.Constant, detail: 'Nil value' },
    { label: 'null', kind: CompletionItemKind.Constant, detail: 'Null value' },
    { label: 'self', kind: CompletionItemKind.Constant, detail: 'Current instance' },
    { label: '__FILE__', kind: CompletionItemKind.Constant, detail: 'Current file path' },
    { label: '__DIR__', kind: CompletionItemKind.Constant, detail: 'Current directory' },
    { label: '__LINE__', kind: CompletionItemKind.Constant, detail: 'Current line number' },
    { label: '__END_LINE__', kind: CompletionItemKind.Constant, detail: 'End line number' },
];

const SPECIAL_METHODS: CompletionItem[] = [
    { label: 'getter', kind: CompletionItemKind.Method, detail: 'Define getter method' },
    { label: 'setter', kind: CompletionItemKind.Method, detail: 'Define setter method' },
    { label: 'property', kind: CompletionItemKind.Method, detail: 'Define property' },
    { label: 'bag', kind: CompletionItemKind.Method, detail: 'Create bag type', insertText: 'bag($0)', insertTextFormat: InsertTextFormat.Snippet },
    { label: 'para', kind: CompletionItemKind.Method, detail: 'Define parameter', insertText: 'para($0)', insertTextFormat: InsertTextFormat.Snippet },
];

// Validate document and return diagnostics.
function validateDocument(document: TextDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const blockStack: { keyword: string; line: number }[] = [];
    let blockCommentDepth = 0;
    let inEnumBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Handle block comments #[ ... ]# with nesting support,
        // count opening and closing block comment markers.
        const openCount = (line.match(/#\[/g) || []).length;
        const closeCount = (line.match(/\]#/g) || []).length;

        blockCommentDepth += openCount;
        blockCommentDepth -= closeCount;

        // Ensure depth doesn't go negative.
        if (blockCommentDepth < 0) {
            blockCommentDepth = 0;
        }

        // Skip validation if we're inside a block comment.
        if (blockCommentDepth > 0 || closeCount > 0) {
            continue;
        }

        // Skip empty lines and line comments.
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        // Check for unclosed strings - parse all quote types together,
        // this correctly handles quotes inside other quote types.
        let inString = false;
        let currentQuote: string | null = null;
        let escaped = false;
        let unclosedQuote: string | null = null;

        for (let j = 0; j < line.length; j++) {
            const char = line[j];

            if (escaped) {
                escaped = false;
                continue;
            }

            if (char === '\\') {
                escaped = true;
                continue;
            }

            // Check if this is a quote character.
            if (char === '"' || char === "'" || char === '`') {
                if (!inString) {

                    // Start a new string.
                    inString = true;
                    currentQuote = char;

                } else if (char === currentQuote) {

                    // Close the current string,
                    // only if it matches the opening quote.
                    inString = false;
                    currentQuote = null;

                }
                // Skip if we're in a string and this quote doesn't match, 
                // it's just a character inside the string.
            }
        }

        // If we're still in a string at the end of the line, it's unclosed.
        if (inString && currentQuote) {
            unclosedQuote = currentQuote;
        }

        if (unclosedQuote) {
            const quoteType = unclosedQuote === '"' ? 'double quote (")' : unclosedQuote === "'" ? "single quote (')" : 'backtick (`)';
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(i, 0, i, line.length),
                message: `Unclosed string literal (${quoteType})`,
                source: 'dragonstone',
            });
        }

        // Check for invalid class/module names..
        const classMatch = /^\s*(?:abstract\s+|abs\s+)?(class|cls|struct|module|mod|enum|record|annotation|anno)\s+([a-z]\w*)/.exec(line);
        if (classMatch) {
            const [, keyword, name] = classMatch;
            const startCol = line.indexOf(name);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(i, startCol, i, startCol + name.length),
                message: `${keyword} name must start with a capital letter`,
                source: 'dragonstone',
            });
        }

        // Check for invalid method/function names (must start with lowercase).
        // Exclude abstract def/define and visibility methods.
        const methodMatch = /^\s*(?!abstract\s+|abs\s+|public\s+|private\s+|protected\s+)(def|define|fun|function)\s+([A-Z]\w*)/.exec(line);
        if (methodMatch) {
            const [, keyword, name] = methodMatch;
            const startCol = line.indexOf(name);
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                range: Range.create(i, startCol, i, startCol + name.length),
                message: `${keyword} name must start with a lowercase letter`,
                source: 'dragonstone',
            });
        }

        // Check for invalid constant names,
        // constants without 'con' must be SCREAMING_SNAKE_CASE,
        // with 'con', any case is allowed,
        // skip this check inside enum blocks.
        const constWithoutKeyword = /^\s*([A-Z][a-z]\w*)\s*=?/.exec(line);
        if (constWithoutKeyword && !line.match(/^\s*(?:let|var|fix|con)\b/) && !inEnumBlock) {
            const [, name] = constWithoutKeyword;

            // Check if it's not all uppercase with underscores
            // and has an assignment.
            if (!/^[A-Z][A-Z0-9_]*$/.test(name) && line.includes('=')) {
                const startCol = line.indexOf(name);
                diagnostics.push({
                    severity: DiagnosticSeverity.Warning,
                    range: Range.create(i, startCol, i, startCol + name.length),
                    message: 'Constants without keyword should be in SCREAMING_SNAKE_CASE',
                    source: 'dragonstone',
                });
            }
        }

        // Track block structure this is including visibility modifiers, 'with', 
        // 'abstract class', 'abstract def'.
        // Visibility modifiers: `public`, `private`, `protected`.
        // Other modifiers: abstract, abs
        // Note: getter, setter, property are single-line declarations, NOT blocks
        if (/^\s*(?:public\s+|private\s+|protected\s+|abstract\s+|abs\s+)?(class|cls|struct|module|mod|def|define|fun|function|if|unless|case|select|begin|while|with|enum|record|annotation|anno)\b/.test(line) &&
            !/\bend\s*$/.test(line)) {
            const keyword = line.match(/^\s*(?:public\s+|private\s+|protected\s+|abstract\s+|abs\s+)?(\w+)/)?.[1] || '';
            blockStack.push({ keyword, line: i });

            // Track enum blocks specifically
            if (keyword === 'enum') {
                inEnumBlock = true;
            }

        } else if (/\b(fun|function)\s*\(/.test(line) && !/\bend\s*$/.test(line)) {

            // Handle anonymous fun/function: variable = fun(args)
            const match = line.match(/\b(fun|function)\s*\(/);
            blockStack.push({ keyword: match?.[1] || 'fun', line: i });
        } else if (/\bdo\b/.test(line) && !/\bend\s*$/.test(line)) {
            blockStack.push({ keyword: 'do', line: i });

        } else if (/^\s*end\b/.test(line)) {
            if (blockStack.length === 0) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    range: Range.create(i, 0, i, line.length),
                    message: 'Unexpected "end" without matching block start',
                    source: 'dragonstone',
                });

            } else {
                const popped = blockStack.pop();

                // Exit enum block when we hit its 'end'.
                if (popped?.keyword === 'enum') {
                    inEnumBlock = false;
                }
            }
        }
    }

    // Check for unclosed blocks.
    for (const block of blockStack) {
        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: Range.create(block.line, 0, block.line, lines[block.line].length),
            message: `Unclosed "${block.keyword}" block`,
            source: 'dragonstone',
        });
    }

    // Document-level bracket/paren/brace validation,
    // This allows multi-line structures and only reports 
    // if the entire document is unbalanced.
    let documentText = text;

    // Remove all string content first
    documentText = documentText
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/`(?:[^`\\]|\\.)*`/g, '``');

    // Remove block comments (including nested ones),
    // Can't use regex for nested structures, need to
    // parse character by character.
    let withoutBlockComments = '';
    let commentDepth = 0;
    for (let i = 0; i < documentText.length; i++) {

        // Check for `#[`.
        if (i < documentText.length - 1 && documentText[i] === '#' && documentText[i + 1] === '[') {
            commentDepth++;

            // Skip the '['.
            i++;
            continue;
        }

        // Check for `]#`.
        if (i < documentText.length - 1 && documentText[i] === ']' && documentText[i + 1] === '#') {
            if (commentDepth > 0) {
                commentDepth--;
            }
            i++; // Skip the '#'
            continue;
        }

        // Only include character if we're not in a comment.
        if (commentDepth === 0) {
            withoutBlockComments += documentText[i];
        }
    }
    documentText = withoutBlockComments;

    // Remove line comments
    documentText = documentText.replace(/#[^\n]*/g, '');

    // Skip validation if document contains special patterns.
    const hasLambdasOrMaps = documentText.includes('->');
    const hasInvokeAs = /\bas\s*\[/.test(documentText);

    if (!hasLambdasOrMaps && !hasInvokeAs) {
        const openParen     = (documentText.match(/\(/g) || []).length;
        const closeParen    = (documentText.match(/\)/g) || []).length;
        const openBracket   = (documentText.match(/\[/g) || []).length;
        const closeBracket  = (documentText.match(/\]/g) || []).length;
        const openBrace     = (documentText.match(/\{/g) || []).length;
        const closeBrace    = (documentText.match(/\}/g) || []).length;

        // Only report if there's a significant imbalance at document level.
        if (openParen !== closeParen || openBracket !== closeBracket || openBrace !== closeBrace) {
            const firstLine = 0;
            diagnostics.push({
                severity: DiagnosticSeverity.Warning,
                range: Range.create(firstLine, 0, firstLine, lines[firstLine].length),
                message: `Document has mismatched brackets: ${openParen - closeParen} unclosed (), ${openBracket - closeBracket} unclosed [], ${openBrace - closeBrace} unclosed {}`,
                source: 'dragonstone',
            });
        }
    }

    return diagnostics;
}

// Connection handlers.
connection.onInitialize((_params: InitializeParams): InitializeResult => {
    return {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
            hoverProvider: true,
            definitionProvider: true,
            documentSymbolProvider: true,
            documentFormattingProvider: true,
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: ['.', ':', '@', '%', '$'],
            },
        },
    };
});

// Hover provider.
connection.onHover((params): Hover | undefined => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return undefined;
    }

    const symbol = findSymbolAtPosition(document, params.position);
    if (!symbol) {
        return undefined;
    }

    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: [
                '```dragonstone',
                symbol.detail || symbol.name,
                '```',
                `Defined at line ${symbol.line + 1}`,
            ].join('\n'),
        },
    };
});

// Go to definition provider.
connection.onDefinition((params): Definition | undefined => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return undefined;
    }

    const symbol = findSymbolAtPosition(document, params.position);
    if (!symbol) {
        return undefined;
    }

    return Location.create(
        params.textDocument.uri,
        symbol.range
    );
});

// Document symbols provider.
connection.onDocumentSymbol((params): DocumentSymbol[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    const symbols = parseDocument(document);

    return symbols.map(symbol => DocumentSymbol.create(
        symbol.name,
        symbol.detail,
        symbol.kind,
        symbol.range,
        symbol.range
    ));
});

// Document formatting provider.
connection.onDocumentFormatting((params) => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    return formatDocument(document);
});

// Completion provider.
connection.onCompletion((params): CompletionItem[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    const line = document.getText(Range.create(
        params.position.line,
        0,
        params.position.line,
        params.position.character
    ));

    const completionItems: CompletionItem[] = [];

    // Add all base completions
    completionItems.push(...KEYWORDS);
    completionItems.push(...BUILTIN_FUNCTIONS);
    completionItems.push(...CONSTANTS);
    completionItems.push(...SPECIAL_METHODS);

    // Add types after ':' or '->'
    if (line.match(/:\s*\w*$/) || line.match(/->\s*\w*$/)) {
        completionItems.push(...TYPES);
    }

    // Add document symbols.
    const symbols = parseDocument(document);
    for (const symbol of symbols) {
        let kind: CompletionItemKind;
        switch (symbol.kind) {
            case SymbolKind.Class:
            case SymbolKind.Enum:
                kind = CompletionItemKind.Class;
                break;
            case SymbolKind.Method:
                kind = CompletionItemKind.Method;
                break;
            case SymbolKind.Function:
                kind = CompletionItemKind.Function;
                break;
            case SymbolKind.Constant:
                kind = CompletionItemKind.Constant;
                break;
            case SymbolKind.Variable:
                kind = CompletionItemKind.Variable;
                break;
            case SymbolKind.Module:
                kind = CompletionItemKind.Module;
                break;
            default:
                kind = CompletionItemKind.Text;
        }

        completionItems.push({
            label: symbol.name,
            kind,
            detail: symbol.detail,
        });
    }

    return completionItems;
});

// Document change handler;
// Validates on change.
documents.onDidChangeContent((change) => {
    const diagnostics = validateDocument(change.document);
    connection.sendDiagnostics({
        uri: change.document.uri,
        diagnostics,
    });
});

// Document open handler,
// Validates on open.
documents.onDidOpen((event) => {
    const diagnostics = validateDocument(event.document);
    connection.sendDiagnostics({
        uri: event.document.uri,
        diagnostics,
    });
});

documents.listen(connection);
connection.listen();
