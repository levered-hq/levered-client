import * as parser from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

interface ComponentLocation {
  code: string;
  start: number;
  end: number;
}

export const findReactComponentAST = (
  fileContent: string,
  componentName: string
): ComponentLocation | null => {
  const ast = parser.parse(fileContent, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  let found: ComponentLocation | null = null;

  traverse(ast, {
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
      if (path.node.id && path.node.id.name === componentName) {
        found = {
          code: fileContent.slice(path.node.start!, path.node.end!),
          start: path.node.start!,
          end: path.node.end!,
        };
        path.stop();
      }
    },
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (t.isIdentifier(path.node.id) && path.node.id.name === componentName) {
        if (
          t.isArrowFunctionExpression(path.node.init) ||
          t.isFunctionExpression(path.node.init)
        ) {
          found = {
            code: fileContent.slice(path.parent.start!, path.parent.end!),
            start: path.parent.start!,
            end: path.parent.end!,
          };
          path.stop();
        }
      }
    },
  });

  return found;
};
