; Free functions with a body.
(function_item
  name: (identifier) @symbol.name
  body: (block)) @symbol.def

; Associated functions inside impl blocks.
(impl_item
  body: (declaration_list
    (function_item
      name: (identifier) @symbol.name
      body: (block)) @symbol.def))
