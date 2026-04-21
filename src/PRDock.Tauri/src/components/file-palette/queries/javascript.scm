(function_declaration
  name: (identifier) @symbol.name
  body: (statement_block)) @symbol.def

(method_definition
  name: (property_identifier) @symbol.name
  body: (statement_block)) @symbol.def

(lexical_declaration
  (variable_declarator
    name: (identifier) @symbol.name
    value: [
      (arrow_function body: (statement_block))
      (function_expression body: (statement_block))
    ])) @symbol.def
