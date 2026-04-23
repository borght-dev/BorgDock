; Class/struct/record methods with a body — skips interface methods
; (which have a semicolon terminator, not a block).
(method_declaration
  name: (identifier) @symbol.name
  body: (block)) @symbol.def

; Constructors.
(constructor_declaration
  name: (identifier) @symbol.name
  body: (block)) @symbol.def

; Top-level or nested local function declarations with a body.
(local_function_statement
  name: (identifier) @symbol.name
  body: (block)) @symbol.def
