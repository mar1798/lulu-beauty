const items = [
  genComponent('Atom', './src/atoms/__name__(kebabCase)'),
  genComponent('Molecule', './src/molecules/__name__(kebabCase)'),
  genComponent('Organism', './src/organisms/__name__(kebabCase)'),
  genComponent('Template', './src/templates/__name__(kebabCase)'),
]

function genComponent(option, path) {
  return {
    option,
    defaultCase: '(pascalCase)',
    entry: {
      folderPath: './tools/templates/react/component/',
    },
    stringReplacers: ['__name__'],
    dynamicReplacers: [
      {
        slot: '__component_type__',
        slotValue: option,
      },
    ],
    output: {
      path,
      pathAndFileNameDefaultCase: '(pascalCase)',
      overwrite: true,
    },
  }
}

exports.items = items
