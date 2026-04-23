; Function declarations with a body — skips interface method signatures
; (which are declared inside interface_body and have no body).
(function_declaration
  name: (identifier) @symbol.name
  body: (statement_block)) @symbol.def

; Class methods with a body.
(method_definition
  name: [(property_identifier) (computed_property_name)] @symbol.name
  body: (statement_block)) @symbol.def

; `const foo = () => { ... }` and `const foo = function () { ... }`.
(lexical_declaration
  (variable_declarator
    name: (identifier) @symbol.name
    value: [
      (arrow_function body: (statement_block))
      (function_expression body: (statement_block))
    ])) @symbol.def
